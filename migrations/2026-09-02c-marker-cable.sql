-- Cable estimated per equipment, so a plan can price its wiring without a
-- scale: most plans never get calibrated, and drawing every run just to get
-- footage is not how the estimate actually gets made. Each marker says which
-- cable type it needs and how many feet.
--
-- cable_feet is PER UNIT of the marker, like accessory quantity: a marker with
-- quantity 3 and 150 feet needs 450. The UI and the CSV do the multiplication.
--
-- feet_per_box lives on the cable type (default 1000, a standard Cat6 box) so
-- a reel of 500 ft — or 305 m — only takes editing the type, not the code.
-- The export list divides the total feet by it and rounds up: 2,800 ft of
-- Cat6 is 2.8 boxes, which is 3 boxes to order.
--
-- No RLS changes needed: plain columns on existing tables, covered by their
-- current policies.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS.

alter table floor_plan_markers
  add column if not exists cable_type_id uuid null references cable_types(id) on delete set null,
  add column if not exists cable_feet numeric null;

comment on column floor_plan_markers.cable_feet is 'Pies de cable estimados POR UNIDAD del marcador; el total es cable_feet * quantity';

create index if not exists idx_floor_plan_markers_cable_type on floor_plan_markers(cable_type_id);

alter table cable_types
  add column if not exists feet_per_box integer not null default 1000;

comment on column cable_types.feet_per_box is 'Pies por caja/carrete de este cable; el estimado redondea hacia arriba (2,800 pies / 1,000 = 3 cajas)';
