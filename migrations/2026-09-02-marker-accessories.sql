-- Accessories attached to a placed element ("Planos"): a Network Jack that
-- needs a two-port faceplate insert, a camera that needs a junction box, etc.
-- They are child rows of floor_plan_markers, not markers of their own —
-- an accessory is not a separate point on the wall, and counting it as
-- equipment would inflate the plan's device count.
--
-- catalog_item_id is optional: the picker searches catalog_items (products)
-- so accessories the shop already stocks stay linked to their code/price,
-- but a tech in the field can also type a name that isn't in the catalog yet
-- and keep working. name is always stored, so the export list reads the same
-- either way.
--
-- quantity is PER UNIT of the parent marker: a marker with quantity 3 and an
-- accessory with quantity 1 needs 3 of them. The UI and the CSV export do the
-- multiplication.
--
-- RLS ALL4 (admin, secretaria, vendedor, tecnico), same as floor_plan_markers
-- / floor_plan_layers — frequent, low-risk edits, not the top-level record.
-- Safe to re-run: IF NOT EXISTS / DROP+CREATE for policies.

create table if not exists floor_plan_marker_accessories (
  id uuid primary key default gen_random_uuid(),
  marker_id uuid not null references floor_plan_markers(id) on delete cascade,
  catalog_item_id uuid null references catalog_items(id) on delete set null,
  name text not null,
  quantity integer not null default 1,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table floor_plan_marker_accessories is 'Accesorios de un equipo colocado en un plano (ej. faceplate insert de 2 puertos en un Network Jack). quantity es por unidad del marcador.';
comment on column floor_plan_marker_accessories.quantity is 'Cantidad POR UNIDAD del marcador padre; el total es quantity * floor_plan_markers.quantity';

create index if not exists idx_marker_accessories_marker on floor_plan_marker_accessories(marker_id);

alter table floor_plan_marker_accessories enable row level security;

drop policy if exists floor_plan_marker_accessories_select on floor_plan_marker_accessories;
create policy floor_plan_marker_accessories_select on floor_plan_marker_accessories for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists floor_plan_marker_accessories_insert on floor_plan_marker_accessories;
create policy floor_plan_marker_accessories_insert on floor_plan_marker_accessories for insert
  with check (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists floor_plan_marker_accessories_update on floor_plan_marker_accessories;
create policy floor_plan_marker_accessories_update on floor_plan_marker_accessories for update
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists floor_plan_marker_accessories_delete on floor_plan_marker_accessories;
create policy floor_plan_marker_accessories_delete on floor_plan_marker_accessories for delete
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
