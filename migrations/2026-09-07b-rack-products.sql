-- Productos y líneas excluidas de un rack ("Planos").
--
-- The room's three lines came out generic: "Patch panel 48 puertos". What the
-- shop actually orders is a catalog product with a code and a price, and it is
-- not the same product on every job.
--
-- 1) rack_patch_panel_item_id / rack_switch_item_id — the product each rack's
--    panels and switches are ordered as. Per rack, because two rooms on the
--    same floor can be built out of different gear. The KEYSTONE is
--    deliberately absent: it has to be the same one used on the floor, so it is
--    read from the drops' own catalog_item_id rather than picked again here —
--    picking it twice is the only way to get two different answers.
--
-- 2) rack_hidden_lines — derived lines this rack does not need: a room where
--    the switches are already installed and nothing is bought. They cannot be
--    "deleted" (the plan recomputes them on the next render), so they are
--    excluded and can be restored. Values: 'keystones', 'panels', 'switches',
--    'managers'.
--
-- No new RLS: both columns ride on floor_plan_markers, which already has its
-- policies. Safe to re-run.

alter table floor_plan_markers
  add column if not exists rack_patch_panel_item_id uuid null references catalog_items(id) on delete set null,
  add column if not exists rack_switch_item_id uuid null references catalog_items(id) on delete set null,
  add column if not exists rack_hidden_lines text[] not null default '{}';

comment on column floor_plan_markers.rack_patch_panel_item_id is 'Producto del catálogo con el que se ordenan los patch panels de ESTE rack; null = sin producto, solo el tamaño.';
comment on column floor_plan_markers.rack_switch_item_id is 'Producto del catálogo con el que se ordenan los switches de ESTE rack.';
comment on column floor_plan_markers.rack_hidden_lines is 'Líneas calculadas excluidas de este rack (keystones, panels, switches, managers). Se restauran desde el resumen.';
