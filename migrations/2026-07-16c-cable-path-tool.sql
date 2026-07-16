-- "Cable Path" (Infrastructure) isn't a point marker like the rest of the
-- Add Element catalog — in SystemSurveyor it's a multi-bend line traced
-- between two pieces of equipment (their "Flex Cable Path" feature), the
-- same concept as the 🔌 Cable tool OTESS already has. Flag it so the
-- editor arms the cable-drawing tool instead of point-placement mode when
-- it's picked from the Add Element panel.

alter table element_types
  add column if not exists is_path_tool boolean not null default false;

update element_types set is_path_tool = true
where name = 'Cable Path' and system_name = 'Infrastructure';
