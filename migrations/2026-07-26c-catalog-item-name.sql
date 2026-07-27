-- Adds a dedicated item name to catalog_items, separate from the longer
-- free-text description, plus a per-item markup % (products only) so
-- Precio venta can be recalculated from Costo without retyping the
-- percentage each time (see app/catalogo/CatalogoClient.js).
--
-- Safe to re-run: IF NOT EXISTS guard on every column add.

alter table catalog_items add column if not exists name text;
alter table catalog_items add column if not exists markup_pct numeric;
