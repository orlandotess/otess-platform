-- Links a placed element to the actual product from the catalog: the plan
-- stops saying "Network Jack ×12" and starts saying which jack, by code, so
-- the export list doubles as a purchase list.
--
-- Nullable and independent from `model`, which stays as free text for gear
-- that isn't in catalog_items (and for every marker placed before this).
-- on delete set null: retiring a catalog item must never delete a marker.
--
-- No RLS changes needed: a plain column on an existing table, covered by
-- floor_plan_markers' existing policies.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS.

alter table floor_plan_markers
  add column if not exists catalog_item_id uuid null references catalog_items(id) on delete set null;

comment on column floor_plan_markers.catalog_item_id is 'Producto del catálogo que representa este equipo; null = solo el tipo de elemento (o el texto libre de model)';

create index if not exists idx_floor_plan_markers_catalog_item on floor_plan_markers(catalog_item_id);
