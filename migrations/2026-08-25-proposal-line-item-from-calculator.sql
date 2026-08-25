-- Marks the rows a cable/tubo calculator run produced on a proposal.
--
-- A run now lands as one independent parent line — described by the material
-- group's title ("Pipe, Box and Miscellaneous") and priced at the sum of the
-- lot — with every material hanging off it as an accessory. That header is a
-- price bucket, not a material: the Pick List has to skip it, or the warehouse
-- gets sent to pull one "Pipe, Box and Miscellaneous". A parent that is a real
-- material with real accessories (a camera and its mount) must keep showing up
-- there, so "has children" can't be the test — the header needs its own mark.
--
-- Nothing else changes: `combine_price` keeps the meaning it already has on
-- proposals (the parent's price already includes its children), which is
-- exactly what this grouping needs. Existing rows default to false and behave
-- exactly as before. Safe to re-run.
alter table proposal_line_items
  add column if not exists from_calculator boolean not null default false;
