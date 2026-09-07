-- Materiales adicionales del plano + cuarto de telecomunicaciones ("Planos").
--
-- 1) floor_plan_materials — material that belongs to the job, not to a point on
--    the wall: a rack, ties, hardware, a ladder rental. Until now the only way
--    to add material was floor_plan_marker_accessories, which hangs off a
--    marker (migrations/2026-09-02-marker-accessories.sql); hanging a rack off
--    an arbitrary jack distorted both that jack's breakdown and the totals.
--    Same shape as the accessories table — catalog_item_id optional so the
--    products the shop stocks keep their code, name always stored so the CSV
--    export reads the same either way — with one difference: quantity here is
--    absolute, since there is no parent marker to multiply by.
--
-- 2) floor_plans.patch_panel_ports — 24 or 48, the panel size the telecom-room
--    block sizes against. The room itself is derived from the plan (one
--    keystone and one patch-panel port per drop, one 48-port switch per 48
--    drops), so only this choice needs storing; null means the default 24,
--    which is the size that sandwiches a 48-port switch between two panels and
--    saves the horizontal cable managers.
--
-- 3) floor_plans.cable_managers — how many horizontal cable managers the room
--    needs. The sandwich layout needs none and any other one needs a manager
--    per panel, but that is only a starting number: how many go in depends on
--    the rack the installer actually draws, so this column overrides it.
--    null = use the derived count.
--
-- RLS ALL4 (admin, secretaria, vendedor, tecnico), same as
-- floor_plan_marker_accessories / floor_plan_markers — frequent, low-risk
-- edits, not the top-level record. Safe to re-run.

create table if not exists floor_plan_materials (
  id uuid primary key default gen_random_uuid(),
  floor_plan_id uuid not null references floor_plans(id) on delete cascade,
  catalog_item_id uuid null references catalog_items(id) on delete set null,
  name text not null,
  quantity integer not null default 1,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table floor_plan_materials is 'Materiales adicionales de un plano que no cuelgan de un equipo colocado (rack, tornillería, ties). quantity es absoluta, a diferencia de floor_plan_marker_accessories.';

create index if not exists idx_floor_plan_materials_plan on floor_plan_materials(floor_plan_id);

alter table floor_plan_materials enable row level security;

drop policy if exists floor_plan_materials_select on floor_plan_materials;
create policy floor_plan_materials_select on floor_plan_materials for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists floor_plan_materials_insert on floor_plan_materials;
create policy floor_plan_materials_insert on floor_plan_materials for insert
  with check (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists floor_plan_materials_update on floor_plan_materials;
create policy floor_plan_materials_update on floor_plan_materials for update
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists floor_plan_materials_delete on floor_plan_materials;
create policy floor_plan_materials_delete on floor_plan_materials for delete
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));

alter table floor_plans add column if not exists patch_panel_ports integer;
alter table floor_plans drop constraint if exists floor_plans_patch_panel_ports_check;
alter table floor_plans add constraint floor_plans_patch_panel_ports_check
  check (patch_panel_ports is null or patch_panel_ports in (24, 48));

alter table floor_plans add column if not exists cable_managers integer;
alter table floor_plans drop constraint if exists floor_plans_cable_managers_check;
alter table floor_plans add constraint floor_plans_cable_managers_check
  check (cable_managers is null or cable_managers >= 0);

comment on column floor_plans.cable_managers is 'Cable managers horizontales del cuarto; null = usar el número derivado del layout (0 en panel/switch/panel, 1 por panel en los demás).';

comment on column floor_plans.patch_panel_ports is 'Tamaño de patch panel elegido para el cuarto de telecomunicaciones (24 o 48). null = 24 (panel / switch de 48 / panel, sin cable managers).';
