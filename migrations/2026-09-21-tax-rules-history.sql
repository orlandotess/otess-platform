-- Historial de tasas de IVU, con vigencia.
--
-- Hoy tax_rules tiene UNA fila por combinación (client_type, line_item_type)
-- y cambiar una tasa se hace sobrescribiéndola. Las facturas, estimados y
-- órdenes de cambio ya emitidos no se mueven — resuelven la tasa al grabar y
-- la guardan por línea (tax_rate/tax_amount/line_total), y la factura además
-- guarda sus agregados (subtotal_labor, tax_labor, ...), que es de donde leen
-- /accounting y el reporte de IVU. Pero trabajos, solicitudes y propuestas NO
-- guardan tasa: recalculan con calcularIVU() contra esta tabla cada vez que se
-- abren. Sobrescribir la tasa les reescribe hacia atrás lo que muestran, igual
-- que pasaba con technicians.hourly_rate antes de technician_rates
-- (2026-09-15-technician-rates.sql) — mismo patrón, mismo remedio.
--
-- Cada cambio de tasa pasa a ser una fila nueva con la fecha desde la que
-- aplica; nada se sobrescribe. La tasa de un documento se resuelve por su
-- fecha, y la documentación de cuándo cambió ES la tabla.
--
-- ⚠️ ORDEN DE LOS PASOS — esto importa más que el SQL mismo:
--
--   1. correr este archivo  ← no cambia ningún número, solo habilita el
--      esquema (ver "Siembra" abajo)
--   2. cambiar el código para resolver por fecha: el .find() de rateFor() en
--      lib/tax.js y el de financialBreakdown() en
--      app/propuestas/ProposalDocument.js
--   3. recién entonces insertar la fila de la tasa nueva
--
-- Si insertas la fila nueva ANTES del paso 2, el IVU se vuelve impredecible:
-- hoy las 12 llamadas hacen `.select('client_type, line_item_type, rate')` sin
-- order ni filtro y luego `.find(...)`, o sea que con dos filas por combinación
-- la app toma la que Postgres devuelva primero — puede cambiar entre recargas.
-- Este archivo deja el esquema listo; NO arregla esa lectura por sí solo.
--
-- Siembra: las filas existentes se fechan 2020-01-01 (muy anterior a cualquier
-- documento), así que el día que corras esto ningún total cambia en ninguna
-- pantalla. El comportamiento nuevo aparece con el primer cambio real de tasa.
--
-- Safe to re-run: todo va guardado con if exists / if not exists, y la siembra
-- solo toca combinaciones que aún tienen una sola fila — una vez que exista un
-- historial real, volver a correr esto no lo pisa.

-- ── 0. Discovery (opcional, pero corre esto primero si quieres ver el antes)─
-- Columnas reales de la tabla (tax_rules se creó fuera de migrations/, así que
-- el repo no tiene su CREATE TABLE):
--
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_name = 'tax_rules'
-- order by ordinal_position;
--
-- Restricciones e índices actuales (aquí se ve si hay un unique o un primary
-- key sobre (client_type, line_item_type) — es lo que la sección 2 quita):
--
-- select conname, contype, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'tax_rules'::regclass;
-- select indexname, indexdef from pg_indexes where tablename = 'tax_rules';
--
-- Y las filas de hoy, para comparar contra la verificación de la sección 4:
--
-- select * from tax_rules order by client_type, line_item_type;

-- ── 1. effective_from: date, no nula, y sembrada "desde siempre" ───────────
alter table tax_rules add column if not exists effective_from date;

-- Si ya existía como timestamp/timestamptz, bajarla a date. La resolución por
-- fecha compara contra la fecha del documento (YYYY-MM-DD); una hora encima
-- solo aporta ambigüedad en el día del cambio.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'tax_rules' and column_name = 'effective_from'
      and data_type <> 'date'
  ) then
    alter table tax_rules alter column effective_from type date using effective_from::date;
    raise notice 'effective_from convertida a date';
  end if;
end $$;

alter table tax_rules alter column effective_from set default current_date;

-- Siembra idempotente: solo se fecha 2020-01-01 la combinación que todavía
-- tiene UNA sola fila, o sea la que nunca ha cambiado de tasa. En cuanto haya
-- historial real (2+ filas), esta sentencia deja de tocar esa combinación.
update tax_rules t
set effective_from = date '2020-01-01'
where (t.effective_from is null or t.effective_from > date '2020-01-01')
  and 1 = (
    select count(*) from tax_rules o
    where o.client_type = t.client_type and o.line_item_type = t.line_item_type
  );

alter table tax_rules alter column effective_from set not null;

-- ── 2. Quitar el unique/PK sobre (client_type, line_item_type) ─────────────
-- Es lo único que impide tener dos vigencias de la misma combinación. El
-- nombre no se asume: se busca por las columnas exactas, en constraints y en
-- índices únicos sueltos.
do $$
declare r record;
begin
  for r in
    select c.conname, c.contype
    from pg_constraint c
    where c.conrelid = 'tax_rules'::regclass
      and c.contype in ('u', 'p')
      and (
        select array_agg(a.attname::text order by a.attname)
        from unnest(c.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      ) = array['client_type', 'line_item_type']
  loop
    execute format('alter table tax_rules drop constraint %I', r.conname);
    raise notice 'Eliminada la restricción % (contype %) sobre (client_type, line_item_type)', r.conname, r.contype;
  end loop;

  for r in
    select i.indexrelid::regclass::text as idxname
    from pg_index i
    where i.indrelid = 'tax_rules'::regclass
      and i.indisunique
      and not i.indisprimary
      and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
      and (
        select array_agg(a.attname::text order by a.attname)
        from unnest(string_to_array(i.indkey::text, ' ')::int[]) as k(attnum)
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
      ) = array['client_type', 'line_item_type']
  loop
    execute format('drop index %s', r.idxname);
    raise notice 'Eliminado el índice único % sobre (client_type, line_item_type)', r.idxname;
  end loop;
end $$;

-- Contingencia: si lo que se eliminó arriba era el PRIMARY KEY (o sea, la
-- tabla no tenía columna id), la tabla queda sin llave primaria. Se le pone
-- una sustituta, como el resto del repo.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'tax_rules'::regclass and contype = 'p'
  ) then
    if not exists (
      select 1 from information_schema.columns
      where table_name = 'tax_rules' and column_name = 'id'
    ) then
      alter table tax_rules add column id uuid not null default gen_random_uuid();
    end if;
    alter table tax_rules add constraint tax_rules_pkey primary key (id);
    raise notice 'tax_rules quedó sin PK al quitar el unique viejo; se agregó PK sobre id';
  end if;
end $$;

-- ── 3. La vigencia pasa a ser parte de la identidad de la fila ─────────────
-- Evita dos tasas para la misma combinación y la misma fecha (que volvería
-- ambigua la resolución) y da el índice con el que se busca: cliente + tipo,
-- fecha hacia atrás. No hace falta un índice adicional — este se puede
-- recorrer en reversa para el "la mayor effective_from <= fecha del documento".
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'tax_rules'::regclass and conname = 'tax_rules_vigencia_unica'
  ) then
    alter table tax_rules add constraint tax_rules_vigencia_unica
      unique (client_type, line_item_type, effective_from);
  end if;
end $$;

-- ── 4. Verificación ────────────────────────────────────────────────────────
-- Deben salir las 6 filas de siempre (b2b/final × labor/product/reembolso),
-- todas con effective_from = 2020-01-01 y la MISMA tasa de antes. Si alguna
-- tasa se movió, algo salió mal.
--
-- select client_type, line_item_type, rate, label, effective_from
-- from tax_rules
-- order by client_type, line_item_type, effective_from desc;

-- ── 5. Cómo se registra un cambio de tasa, después del paso 2 del código ───
-- Una fila nueva por combinación afectada; nunca un update sobre la vieja.
-- Fechar a futuro es válido a propósito (registras hoy el cambio que entra el
-- 1ro). Ejemplo — IVU de labor a cliente final del 11.5% al 12% desde el
-- 1 de enero de 2027:
--
-- insert into tax_rules (client_type, line_item_type, rate, label, effective_from)
-- values ('final'::client_type, 'labor'::line_item_type, 0.12, 'IVU General 12%', date '2027-01-01');
--
-- Ojo: esto cambia lo que muestran trabajos, solicitudes y propuestas con
-- fecha en o después de la vigencia, y la tasa que tomará cada factura nueva
-- (incluidas las recurrentes al generarse). Las ya emitidas siguen con su tasa
-- guardada, que es justo lo que queremos.
