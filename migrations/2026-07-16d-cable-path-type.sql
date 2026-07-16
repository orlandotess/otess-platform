-- Pre-seed the "Cable Path" cable type (Infrastructure red) so picking
-- "Cable Path" from the Add Element panel has a real, ready-to-use type to
-- switch to instead of creating one on the fly client-side. cable_types has
-- no unique constraint on name, so guard the insert manually.
insert into cable_types (name, color)
select 'Cable Path', '#ed1c24'
where not exists (select 1 from cable_types where name = 'Cable Path');
