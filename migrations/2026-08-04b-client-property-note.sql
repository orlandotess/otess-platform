-- Adds a short freeform note field to client_properties (e.g. "S4311 numero
-- de propiedad"), editable from the Propiedades tab on the client detail page.
--
-- Safe to re-run: IF NOT EXISTS guard on the column add.

alter table client_properties add column if not exists note text;
