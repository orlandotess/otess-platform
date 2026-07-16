-- Named, colored cable types (e.g. "Cat6 Cable Blue", "Cable 16/4 Speaker"),
-- shared org-wide across all plans — same sharing pattern as
-- custom_equipment_icons (a library, not per-plan data).
-- cable_type_id is nullable on floor_plan_cables — existing/untyped cables
-- keep rendering with the default stroke color. Deleting a type only
-- detaches its cables (on delete set null), never deletes the cables.
-- RLS ALL4 full CRUD (admin, secretaria, vendedor, tecnico), same as
-- custom_equipment_icons — shared library, low risk.
-- Safe to re-run: uses IF NOT EXISTS / DROP+CREATE for policies.

create table if not exists cable_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#2a4cb5',
  created_at timestamptz not null default now()
);

alter table floor_plan_cables add column if not exists cable_type_id uuid null references cable_types(id) on delete set null;

alter table cable_types enable row level security;

drop policy if exists cable_types_select on cable_types;
create policy cable_types_select on cable_types for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists cable_types_insert on cable_types;
create policy cable_types_insert on cable_types for insert
  with check (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists cable_types_update on cable_types;
create policy cable_types_update on cable_types for update
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists cable_types_delete on cable_types;
create policy cable_types_delete on cable_types for delete
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
