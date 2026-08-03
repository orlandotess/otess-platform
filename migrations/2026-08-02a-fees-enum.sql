-- PASO 1 de 3 — correr esto SOLO, en su propio "Run" del SQL editor, y
-- esperar a que termine antes de correr 2026-08-02-fees-tax-category.sql.
--
-- tax_rules.line_item_type es un enum de Postgres (no text) con valores
-- actuales 'product'/'labor' — confirmado vía:
--   select c.column_name, c.udt_name,
--          string_agg(e.enumlabel, ', ' order by e.enumsortorder) as enum_values
--   from information_schema.columns c
--   left join pg_type t on t.typname = c.udt_name
--   left join pg_enum e on e.enumtypid = t.oid
--   where c.table_name = 'tax_rules' and c.column_name in ('client_type','line_item_type')
--   group by c.column_name, c.udt_name;
--
-- Un valor de enum agregado con ALTER TYPE ... ADD VALUE no se puede usar
-- (ni en un INSERT ni en un WHERE) dentro de la misma transacción en que se
-- agregó — Postgres lo bloquea explícitamente ("unsafe use of new value").
-- Por eso este archivo está separado: hay que correrlo y dejar que confirme
-- antes de tocar tax_rules o las tablas de abajo.
--
-- El mismo enum line_item_type también lo usan invoice_line_items.type y
-- job_line_items.type (confirmado por consulta contra las 8 tablas de line
-- items) — así que también necesita 'fee' para esos dos, además de
-- 'reembolso' para tax_rules. Las otras 6 tablas (incluyendo catalog_items)
-- usan texto plano, sin este problema.

alter type line_item_type add value if not exists 'reembolso';
alter type line_item_type add value if not exists 'fee';
