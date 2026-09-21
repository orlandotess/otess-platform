-- Congela el IVU de lo ya creado: guarda la tasa en la línea.
--
-- Facturas, estimados y órdenes de cambio ya lo hacen — resuelven la tasa al
-- grabar y la guardan en tax_rate/tax_amount/line_total. Las tres tablas de
-- abajo NO guardan nada y recalculan contra tax_rules cada vez que se abre la
-- pantalla:
--
--   job_line_items        → calcularIVU() en app/trabajos/[id]/page.js:206
--   solicitud_line_items  → calcularIVU() en app/solicitudes/[id]/SolicitudTabs.js
--   proposal_line_items   → financialBreakdown() en ProposalDocument.js:55
--                           (incluye el enlace público de propuestas)
--
-- Cambiar la tasa sin esto les reescribe el total hacia atrás a todos.
--
-- ⚠️ ESTO HAY QUE CORRERLO ANTES DE INSERTAR LA TASA NUEVA. Hoy la tasa nunca
-- ha cambiado, así que la tasa vigente ES la histórica y el backfill es exacto
-- y trivial. En cuanto tax_rules tenga dos vigencias, "la tasa que tenía al
-- momento" deja de ser una consulta directa. La sección 0 aborta con error si
-- detecta que ya hay historial, para que no se corra en el orden equivocado.
--
-- Se guarda SOLO la tasa, no el impuesto ni el total. Son documentos vivos: si
-- le cambias la cantidad o el precio a una línea de un trabajo abierto, el
-- total debe seguirlo — lo que queda congelado es la TASA. Por la misma razón
-- se guarda la tasa de la categoría, no la de la línea ya ajustada por exento:
-- así el toggle de "Exento" sigue funcionando (se aplica al renderizar, como
-- hoy).
--
-- Safe to re-run: add column if not exists, y el backfill solo toca filas con
-- tax_rate null — una línea ya congelada no se vuelve a tocar.

-- ── 0. Guarda: esto asume UNA tasa vigente por combinación ────────────────
do $$
declare dupes int;
begin
  select count(*) into dupes
  from (select client_type, line_item_type from tax_rules group by 1, 2 having count(*) > 1) d;
  if dupes > 0 then
    raise exception using message = format(
      'tax_rules ya tiene historial (%s combinación(es) con más de una vigencia). Este backfill asume una sola tasa vigente por combinación: córrelo ANTES de insertar la tasa nueva. Si ya la insertaste, avísame y lo reescribo para resolver por la fecha de cada documento.', dupes);
  end if;
end $$;

-- Discovery opcional — cuántas líneas se van a congelar, y si quedan líneas
-- viejas sin tasa en las tablas que sí la guardan (esas se revisan aparte,
-- ver sección 4):
--
-- select 'job' t, count(*) from job_line_items
-- union all select 'solicitud', count(*) from solicitud_line_items
-- union all select 'proposal', count(*) from proposal_line_items;
--
-- select 'invoice' t, count(*) from invoice_line_items where tax_rate is null
-- union all select 'estimate', count(*) from estimate_line_items where tax_rate is null
-- union all select 'change_order', count(*) from change_order_line_items where tax_rate is null;

-- ── 1. La columna ─────────────────────────────────────────────────────────
-- Nullable a propósito: null significa "sin congelar", y el código resuelve
-- contra tax_rules — que es justo lo que debe pasar con una línea nueva.
alter table job_line_items       add column if not exists tax_rate numeric;
alter table solicitud_line_items add column if not exists tax_rate numeric;
alter table proposal_line_items  add column if not exists tax_rate numeric;

-- ── 2. Backfill: trabajos y solicitudes ───────────────────────────────────
-- Reproduce exactamente normalizeCategory() de lib/tax.js: la categoría sale
-- de tax_category, si no de type, y cualquier cosa que no sea una de las tres
-- cae en 'product'. Sin cliente o sin regla, los mismos respaldos que el
-- código ('final' y 0.115).
update job_line_items li
set tax_rate = coalesce((
  select tr.rate
  from jobs j
  left join clients c on c.id = j.client_id
  join tax_rules tr
    on tr.client_type = coalesce(c.client_type, 'final'::client_type)
   and tr.line_item_type::text = case
         when coalesce(li.tax_category, li.type::text) in ('labor', 'product', 'reembolso')
           then coalesce(li.tax_category, li.type::text)
         else 'product' end
  where j.id = li.job_id
), 0.115)
where li.tax_rate is null;

update solicitud_line_items li
set tax_rate = coalesce((
  select tr.rate
  from solicitudes s
  left join clients c on c.id = s.client_id
  join tax_rules tr
    on tr.client_type = coalesce(c.client_type, 'final'::client_type)
   and tr.line_item_type::text = case
         when coalesce(li.tax_category, li.type::text) in ('labor', 'product', 'reembolso')
           then coalesce(li.tax_category, li.type::text)
         else 'product' end
  where s.id = li.solicitud_id
), 0.115)
where li.tax_rate is null;

-- ── 3. Backfill: propuestas ───────────────────────────────────────────────
-- OJO — aquí la regla NO es la misma. financialBreakdown() ignora
-- tax_category y decide solo con item_type: `item_type === 'product' ?
-- 'product' : 'labor'`. O sea que hoy un fee dentro de una propuesta se grava
-- como labor aunque su tax_category diga otra cosa. Este backfill congela ESO,
-- tal como se ve hoy, que es lo que pediste. Corregir la regla es un cambio
-- aparte y sí movería el total de propuestas existentes — dime si lo quieres.
update proposal_line_items li
set tax_rate = coalesce((
  select tr.rate
  from proposal_options po
  join proposals p on p.id = po.proposal_id
  left join clients c on c.id = p.client_id
  join tax_rules tr
    on tr.client_type = coalesce(c.client_type, 'final'::client_type)
   and tr.line_item_type::text = case when li.item_type::text = 'product' then 'product' else 'labor' end
  where po.id = li.option_id
), 0.115)
where li.tax_rate is null;

-- ── 4. Facturas / estimados / órdenes de cambio ───────────────────────────
-- Ya guardan tax_rate, así que no se tocan. Si la discovery de la sección 0
-- mostró filas con tax_rate null (líneas viejas anteriores a esa columna), NO
-- se rellenan desde tax_rules: el documento ya tiene su impuesto guardado, y
-- la tasa honesta es la que se deduce de sus propios montos. Descomenta solo
-- si hace falta:
--
-- update invoice_line_items set tax_rate = round(tax_amount / line_total, 5)
-- where tax_rate is null and line_total is not null and line_total <> 0;
-- update estimate_line_items set tax_rate = round(tax_amount / line_total, 5)
-- where tax_rate is null and line_total is not null and line_total <> 0;
-- update change_order_line_items set tax_rate = round(tax_amount / line_total, 5)
-- where tax_rate is null and line_total is not null and line_total <> 0;

-- ── 5. Verificación ───────────────────────────────────────────────────────
-- No debe quedar ninguna línea sin congelar, y el reparto de tasas debe
-- cuadrar con lo esperado (11.5% general, 4% labor B2B, 0% reembolso):
--
-- select 'job' t, tax_rate, count(*) from job_line_items group by 1, 2
-- union all select 'solicitud', tax_rate, count(*) from solicitud_line_items group by 1, 2
-- union all select 'proposal', tax_rate, count(*) from proposal_line_items group by 1, 2
-- order by 1, 2;
--
-- Y el chequeo que de verdad importa: abre un trabajo, una solicitud y una
-- propuesta ANTES de correr esto, anota el total, y compáralo después. Tiene
-- que dar idéntico — este archivo no debe mover ni un centavo. El
-- comportamiento nuevo aparece recién con la tasa nueva.
