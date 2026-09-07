-- Varios racks (cuartos de telecomunicaciones) en un mismo plano ("Planos").
--
-- Until now the telecom room was a single derived block: every drop on the
-- plan fed one imaginary room. A floor with three racks doesn't work that way
-- — each rack terminates the drops around it, and each one is sized on its own
-- (a rack with 38 drops is one 48-port panel, not a slice of a global total).
-- So the room stops being imaginary and becomes what it already is on the
-- drawing: an Equipment Rack marker, with the drops pointing at it.
--
-- 1) element_types.is_rack — which catalog elements ARE a rack. Set on every
--    'Equipment Rack' row (the element exists under several systems: VSS, IT,
--    Infrastructure, AV, Communications) so a rack placed from any category
--    works the same. A rack still counts as equipment — it is equipment you
--    install and bill — but never as a drop, which is what keeps the keystone
--    count honest.
--
-- 2) floor_plan_markers.rack_marker_id — the rack a drop terminates at. Null
--    means unassigned: those drops still get sized, in their own block, so
--    nothing silently disappears from the purchase list. Self-referencing FK
--    with ON DELETE SET NULL: deleting a rack releases its drops instead of
--    taking 40 jacks down with it.
--
-- 3) rack_patch_panel_ports / rack_cable_managers — per-rack overrides of the
--    plan-wide defaults in floor_plans (migrations/2026-09-06-plan-materials-and-idf.sql).
--    Null falls back to the plan: the size stays one decision for the whole job
--    unless a particular rack needs its own.
--
-- No new RLS: every column rides on tables that already have their policies.
-- Safe to re-run.

alter table element_types add column if not exists is_rack boolean not null default false;
update element_types set is_rack = true where name = 'Equipment Rack';

comment on column element_types.is_rack is 'El elemento es un rack / cuarto de telecomunicaciones: termina tomas y se dimensiona solo. Cuenta como equipo pero nunca como toma.';

alter table floor_plan_markers
  add column if not exists rack_marker_id uuid null references floor_plan_markers(id) on delete set null,
  add column if not exists rack_patch_panel_ports integer,
  add column if not exists rack_cable_managers integer;

alter table floor_plan_markers drop constraint if exists floor_plan_markers_rack_patch_panel_ports_check;
alter table floor_plan_markers add constraint floor_plan_markers_rack_patch_panel_ports_check
  check (rack_patch_panel_ports is null or rack_patch_panel_ports in (24, 48));

alter table floor_plan_markers drop constraint if exists floor_plan_markers_rack_cable_managers_check;
alter table floor_plan_markers add constraint floor_plan_markers_rack_cable_managers_check
  check (rack_cable_managers is null or rack_cable_managers >= 0);

create index if not exists idx_floor_plan_markers_rack on floor_plan_markers(rack_marker_id);

comment on column floor_plan_markers.rack_marker_id is 'Rack donde termina esta toma; null = sin asignar (se dimensiona en su propio bloque).';
comment on column floor_plan_markers.rack_patch_panel_ports is 'Tamaño de patch panel de ESTE rack (24 o 48); null = usar floor_plans.patch_panel_ports.';
comment on column floor_plan_markers.rack_cable_managers is 'Cable managers de ESTE rack; null = usar el número derivado del layout.';
