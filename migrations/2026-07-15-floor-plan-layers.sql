-- Named, toggleable layers within a floor plan ("Planos"), so equipment
-- markers and cables can be grouped by system (e.g. "Eléctrico", "Cámaras",
-- "Cableado estructurado") on the same plan. layer_id is nullable on both
-- floor_plan_markers and floor_plan_cables — existing rows keep working
-- untouched and are treated as an implicit "Sin capa" layer in the UI.
-- Deleting a layer only detaches its equipment/cables (on delete set null),
-- it never cascades-deletes them.
-- RLS ALL4 (admin, secretaria, vendedor, tecnico), same as floor_plan_markers
-- / floor_plan_cables — frequent, low-risk edits, not the top-level record.
-- Safe to re-run: uses IF NOT EXISTS / DROP+CREATE for policies.

create table if not exists floor_plan_layers (
  id uuid primary key default gen_random_uuid(),
  floor_plan_id uuid not null references floor_plans(id) on delete cascade,
  name text not null,
  color text not null default '#2a4cb5',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table floor_plan_markers add column if not exists layer_id uuid null references floor_plan_layers(id) on delete set null;
alter table floor_plan_cables add column if not exists layer_id uuid null references floor_plan_layers(id) on delete set null;

create index if not exists idx_floor_plan_layers_plan on floor_plan_layers(floor_plan_id);

alter table floor_plan_layers enable row level security;

drop policy if exists floor_plan_layers_select on floor_plan_layers;
create policy floor_plan_layers_select on floor_plan_layers for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists floor_plan_layers_insert on floor_plan_layers;
create policy floor_plan_layers_insert on floor_plan_layers for insert
  with check (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists floor_plan_layers_update on floor_plan_layers;
create policy floor_plan_layers_update on floor_plan_layers for update
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists floor_plan_layers_delete on floor_plan_layers;
create policy floor_plan_layers_delete on floor_plan_layers for delete
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
