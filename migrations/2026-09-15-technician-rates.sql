-- Historial de tarifas por hora del técnico, con vigencia.
--
-- Hasta ahora la paga vivía en una sola columna, technicians.hourly_rate, y
-- TODO lo que calcula dinero la leía directo: nómina, su historial, el
-- dashboard de contabilidad, rentabilidad, timesheet y el costo de mano de
-- obra de un trabajo. Como esa columna se sobrescribe, subirle la tarifa a un
-- técnico hoy recalculaba hacia atrás cada semana que ya se le había pagado
-- — incluidas las marcadas como paid, porque ese flag nunca congeló el monto,
-- solo marcaba que salió el cheque. El historial mostraba lo que se le
-- pagaría hoy por esas horas, no lo que se le pagó.
--
-- Cada cambio de tarifa es ahora una fila nueva con la fecha desde la que
-- aplica; nada se sobrescribe. Una semana vieja resuelve su tarifa por fecha,
-- así que queda congelada por construcción, y la documentación de cuándo se
-- ajustó ES la tabla — no un log aparte que haya que mantener sincronizado.
--
-- Por qué no congelar la tarifa en payroll_adjustments, que era la otra
-- opción obvia: esas filas solo existen cuando hay un ajuste manual de horas
-- o un bruto directo, o sea que la semana normal no tiene fila y no habría
-- nada que congelar; no cubre rentabilidad ni trabajos, que costean por
-- entrada de tiempo y no por semana de nómina; y un mismo valor repetido en
-- 40 semanas no dice cuándo subió, habría que deducirlo comparando semanas.
--
-- effective_from tiene que caer miércoles (el check de abajo) porque la
-- semana de pago corre miércoles a martes. Una vigencia a mitad de semana
-- dejaría esa semana con dos tarifas y volvería ambiguo el corte de las
-- primeras 40 horas regulares, que se calculan por semana completa
-- (splitRegularOvertime en lib/payrollOverrides.js). La UI ofrece un selector
-- de semana, no un calendario libre, y su default es la semana SIGUIENTE:
-- ajustar hoy no le toca a nadie la semana que ya está por cobrarse.
--
-- Fechar a futuro es válido a propósito (registras hoy el aumento que entra
-- el miércoles). Por eso "la tarifa actual" se resuelve siempre por fecha y
-- technicians.hourly_rate deja de ser de donde sale la paga: se queda como
-- respaldo para un técnico que no tenga ninguna fila aquí, nada más.
--
-- La siembra usa la tarifa actual con vigencia 2020-01-01 (miércoles, muy
-- anterior a la primera entrada de tiempo), así que el día que corras esto
-- ningún número cambia en ninguna pantalla: el historial ya se calculaba con
-- esa misma tarifa. El comportamiento nuevo solo aparece con el primer ajuste
-- real. Si después de correrla un total se movió, algo salió mal.
--
-- Safe to re-run: if not exists en todo, y la siembra es idempotente por el
-- unique (technician_id, effective_from).

create table if not exists technician_rates (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references technicians(id) on delete cascade,
  hourly_rate numeric not null check (hourly_rate >= 0),
  effective_from date not null,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (technician_id, effective_from),
  -- 3 = miércoles. La semana de pago corre Wed–Tue; ver comentario arriba.
  constraint technician_rates_effective_from_wednesday check (extract(dow from effective_from) = 3)
);

create index if not exists technician_rates_technician_id_idx on technician_rates(technician_id);
-- Toda lectura es "la tarifa vigente en tal fecha": el técnico y la fecha
-- descendente son exactamente el orden en que se busca.
create index if not exists technician_rates_lookup_idx on technician_rates(technician_id, effective_from desc);

alter table technician_rates enable row level security;

-- Mismos roles que daily_hour_overrides (2026-07-14): la tarifa es dato de
-- nómina, solo oficina. El técnico NO la ve — el Crew App solo le muestra sus
-- horas, nunca tarifa ni bruto ni neto.
drop policy if exists technician_rates_select on technician_rates;
create policy technician_rates_select on technician_rates for select
  using (auth_role() in ('admin', 'secretaria'));
drop policy if exists technician_rates_insert on technician_rates;
create policy technician_rates_insert on technician_rates for insert
  with check (auth_role() in ('admin', 'secretaria'));
drop policy if exists technician_rates_update on technician_rates;
create policy technician_rates_update on technician_rates for update
  using (auth_role() in ('admin', 'secretaria'));
drop policy if exists technician_rates_delete on technician_rates;
create policy technician_rates_delete on technician_rates for delete
  using (auth_role() in ('admin', 'secretaria'));

-- Siembra: la tarifa de hoy pasa a ser la vigente "desde siempre", para que
-- el historial existente siga dando exactamente los mismos números.
insert into technician_rates (technician_id, hourly_rate, effective_from, note)
select id, coalesce(hourly_rate, 0), date '2020-01-01',
       'Tarifa inicial migrada desde technicians.hourly_rate'
from technicians
on conflict (technician_id, effective_from) do nothing;
