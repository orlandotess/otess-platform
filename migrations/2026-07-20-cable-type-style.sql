-- Per-cable-type line width (thickness multiplier) and dash style, so runs
-- are easier to tell apart on the plan independent of color, and path/conduit
-- types (e.g. "Flex Cable Path") can render thicker than point-to-point wires.
-- Defaults preserve today's fixed-width solid line for existing types.
-- Safe to re-run: uses IF NOT EXISTS.

alter table cable_types add column if not exists line_width numeric not null default 1;
alter table cable_types add column if not exists dash_style text not null default 'solid';
