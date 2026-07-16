-- Infrastructure was missing "Flex Cable Path" — the 19th element the
-- original source doc's header counted but its table never listed (confirmed
-- against a real SystemSurveyor screenshot). Same path-tool behavior as
-- Cable Path: arms the cable-drawing tool instead of placing a point marker.
insert into element_types (system_name, system_abbr, system_color, name, abbr, sort_order, is_path_tool)
select 'Infrastructure', 'INFRA', '#ed1c24', 'Flex Cable Path', 'FCP-', 4003, true
where not exists (select 1 from element_types where system_name = 'Infrastructure' and name = 'Flex Cable Path');

update element_types set is_path_tool = true
where system_name = 'Infrastructure' and name = 'Flex Cable Path';

-- Re-sequence Infrastructure's sort_order to match SystemSurveyor's own
-- display order (screenshot-verified), now that Flex Cable Path is in.
update element_types set sort_order = 4001 where system_name = 'Infrastructure' and name = 'Node';
update element_types set sort_order = 4002 where system_name = 'Infrastructure' and name = 'Cable Path';
update element_types set sort_order = 4003 where system_name = 'Infrastructure' and name = 'Flex Cable Path';
update element_types set sort_order = 4004 where system_name = 'Infrastructure' and name = 'Equipment Rack';
update element_types set sort_order = 4005 where system_name = 'Infrastructure' and name = 'Cable Balun';
update element_types set sort_order = 4006 where system_name = 'Infrastructure' and name = 'Network Surge Protector';
update element_types set sort_order = 4007 where system_name = 'Infrastructure' and name = 'PoE Injector';
update element_types set sort_order = 4008 where system_name = 'Infrastructure' and name = 'Multimedia Outlet';
update element_types set sort_order = 4009 where system_name = 'Infrastructure' and name = 'Junction Box';
update element_types set sort_order = 4010 where system_name = 'Infrastructure' and name = 'UPS Power Unit';
update element_types set sort_order = 4011 where system_name = 'Infrastructure' and name = 'Network Patch Panel';
update element_types set sort_order = 4012 where system_name = 'Infrastructure' and name = 'Network Jack';
update element_types set sort_order = 4013 where system_name = 'Infrastructure' and name = 'Enclosure';
update element_types set sort_order = 4014 where system_name = 'Infrastructure' and name = 'Structured Media Cabinet';
update element_types set sort_order = 4015 where system_name = 'Infrastructure' and name = 'Wireless Receiver Hub';
update element_types set sort_order = 4016 where system_name = 'Infrastructure' and name = 'Battery';
update element_types set sort_order = 4017 where system_name = 'Infrastructure' and name = 'Generator';
update element_types set sort_order = 4018 where system_name = 'Infrastructure' and name = 'General Component';
update element_types set sort_order = 4019 where system_name = 'Infrastructure' and name = 'General Assembly';
