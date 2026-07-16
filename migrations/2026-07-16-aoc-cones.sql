-- Area of Coverage (AOC / FOV cone) fields for floor_plan_markers, so
-- cameras, access points, and motion sensors can show an interactive
-- field-of-view cone on the plan (direction, opening angle, radius,
-- color override, opacity). Off by default (aoc_visible = false) so
-- existing markers render unchanged until a user opts in per-marker.
-- No RLS changes needed: these are plain columns on an existing table,
-- covered by floor_plan_markers' existing policies.
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS.

alter table floor_plan_markers
  add column if not exists aoc_visible   boolean default false,
  add column if not exists aoc_direction float   default 0,    -- 0-360°, 0=derecha/este, 90=abajo/sur
  add column if not exists aoc_angle     float   default 60,   -- ángulo FOV en grados (5-360)
  add column if not exists aoc_radius    float   default 80,   -- longitud del cono en unidades SVG (mismo espacio que pos_x * image_width)
  add column if not exists aoc_color     text    default null, -- hex con #, null = usa color del sistema del equipment_type
  add column if not exists aoc_opacity   float   default 0.5;  -- 0-1

comment on column floor_plan_markers.aoc_visible   is 'Muestra/oculta el cono de cobertura en el plano';
comment on column floor_plan_markers.aoc_direction is '0-360°: dirección central del cono. 0=derecha, 90=abajo, 180=izquierda, 270=arriba';
comment on column floor_plan_markers.aoc_angle     is 'Ángulo de apertura del FOV en grados (5 min - 360 max = círculo completo)';
comment on column floor_plan_markers.aoc_radius    is 'Longitud del cono en unidades SVG (pos_x/pos_y * image_width/height)';
comment on column floor_plan_markers.aoc_color     is 'Color del cono en hex con #. NULL = hereda color del equipment_type';
comment on column floor_plan_markers.aoc_opacity   is 'Opacidad del cono: 0=transparente, 1=opaco. Default 0.5';
