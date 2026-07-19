-- Pipeline de ventas "Oportunidades": Kanban de leads/prospectos, inspirado en
-- el board de Specifi.io que enseñó el usuario (columnas por etapa, tarjeta con
-- valor + responsable + seguimiento). Vive ANTES de Clientes/Solicitudes en el
-- embudo: un lead frío que aún no es cliente. Al marcar "Ganado" se puede
-- convertir a un cliente real desde la UI (no automático en esta migración).
--
-- Etapas son configurables por el usuario ("Configurar Etapas" en el board),
-- así que viven en su propia tabla en vez de un blob JSON en company_settings
-- (esa tabla no tiene migración rastreada en este repo, no quiero alterarla a
-- ciegas). opportunities.stage_key referencia opportunity_stages.key.
--
-- Safe to re-run: usa if not exists / drop+create para tablas, políticas y el
-- seed de etapas (el insert de etapas solo corre si la tabla está vacía).

create table if not exists opportunity_stages (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table opportunity_stages enable row level security;

drop policy if exists "opportunity_stages_all_office3" on opportunity_stages;
create policy "opportunity_stages_all_office3"
  on opportunity_stages for all
  using (auth_role() in ('admin', 'secretaria', 'vendedor'))
  with check (auth_role() in ('admin', 'secretaria', 'vendedor'));

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid null references clients(id) on delete set null,
  contact_name text null,
  company_name text null,
  phone text null,
  email text null,
  value numeric(12,2) not null default 0,
  stage_key text not null references opportunity_stages(key) on update cascade,
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  assigned_technician_id uuid null references technicians(id) on delete set null,
  next_follow_up date null,
  notes text null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunities_stage_key_idx on opportunities(stage_key);
create index if not exists opportunities_client_id_idx on opportunities(client_id);

alter table opportunities enable row level security;

drop policy if exists "opportunities_all_office3" on opportunities;
create policy "opportunities_all_office3"
  on opportunities for all
  using (auth_role() in ('admin', 'secretaria', 'vendedor'))
  with check (auth_role() in ('admin', 'secretaria', 'vendedor'));

-- Etapas por defecto. Solo siembra si la tabla está vacía, para no pisar
-- etapas que el usuario ya haya renombrado/reordenado en un re-run.
insert into opportunity_stages (key, label, position)
select * from (values
  ('sin_asignar',        'Sin Asignar',        0),
  ('contacto_frio',       'Contacto Frío',       1),
  ('contactado',          'Contactado',          2),
  ('propuesta_enviada',   'Propuesta Enviada',   3),
  ('negociacion',         'Negociación',         4)
) as seed(key, label, position)
where not exists (select 1 from opportunity_stages);
