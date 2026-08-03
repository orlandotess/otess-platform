-- Módulo Fees: separa `type`/`item_type` (dónde se muestra una línea: labor/
-- product/fee) de `tax_category` (cómo se grava: labor/product/reembolso).
-- Fees es una agrupación de presentación, no una categoría fiscal — ver
-- HANDOFF / plan de implementación para el razonamiento completo.
--
-- tax_rules ya existe (client_type: 'b2b'/'final', line_item_type: 'labor'/
-- 'product', rate) y hoy solo la usa Propuestas (financialBreakdown en
-- app/propuestas/ProposalDocument.js). Se reusa tal cual, solo se le añade
-- la categoría 'reembolso' a 0%.
--
-- IMPORTANTE: client_type y line_item_type son ENUMS de Postgres, no text
-- (confirmado con el usuario) — 'client_type' con valores (final, b2b),
-- 'line_item_type' con valores (product, labor). Este script REQUIERE que
-- 2026-08-02a-fees-enum.sql ya haya corrido y confirmado por separado antes
-- (agrega 'reembolso' al enum line_item_type) — si no, la sección 1 falla.
--
-- Safe to re-run: add column if not exists, drop constraint if exists.

-- ── 0. Discovery opcional ───────────────────────────────────────────────
-- Antes de correr esto, si quieres confirmar los nombres reales de los
-- check constraints de `type`/`item_type` en cada tabla (este script asume
-- la convención por defecto de Postgres `<tabla>_<columna>_check`, que es
-- la que usa el resto del repo — ver solicitud_line_items en
-- migrations/2026-07-15-solicitudes.sql), corre esto primero:
--
-- select conrelid::regclass as tabla, conname, pg_get_constraintdef(oid) as definicion
-- from pg_constraint
-- where contype = 'c'
--   and conrelid = any (array[
--     'catalog_items','job_line_items','invoice_line_items','estimate_line_items',
--     'change_order_line_items','solicitud_line_items','recurring_invoice_items',
--     'proposal_line_items'
--   ]::regclass[])
-- order by 1, 2;
--
-- Si algún nombre difiere del que asume este script, avísame para ajustarlo
-- antes de correr las secciones 2 y 3 de abajo.

-- ── 1. tax_rules: añadir categoría 'reembolso' (0% para b2b y final) ─────
-- label sigue el mismo patrón que las 4 filas existentes ("IVU General
-- 11.5%", "IVU B2B 4%"); effective_from tiene default, no hace falta pasarlo.
insert into tax_rules (client_type, line_item_type, rate, label)
select v.client_type, v.line_item_type, v.rate, v.label
from (values
  ('b2b'::client_type, 'reembolso'::line_item_type, 0::numeric, 'IVU Reembolso 0%'),
  ('final'::client_type, 'reembolso'::line_item_type, 0::numeric, 'IVU Reembolso 0%')
) as v(client_type, line_item_type, rate, label)
where not exists (
  select 1 from tax_rules tr
  where tr.client_type = v.client_type and tr.line_item_type = v.line_item_type
);

-- ── 2. catalog_items: tercer tipo 'fee' + columnas nuevas ────────────────
alter table catalog_items drop constraint if exists catalog_items_type_check;
alter table catalog_items add constraint catalog_items_type_check
  check (type in ('labor', 'product', 'fee'));

alter table catalog_items
  add column if not exists tax_category  text,
  add column if not exists costo         numeric(12,2),
  add column if not exists recurrencia   text default 'unica'
    check (recurrencia in ('unica', 'mensual', 'anual')),
  add column if not exists termino_meses int;

alter table catalog_items drop constraint if exists catalog_items_tax_category_check;
alter table catalog_items add constraint catalog_items_tax_category_check
  check (tax_category in ('labor', 'product', 'reembolso'));

-- backfill: los items existentes conservan su comportamiento actual
-- (type -> tax_category 1:1, porque hoy solo existen 'labor'/'product')
update catalog_items set tax_category = type
where tax_category is null and type in ('labor', 'product');

alter table catalog_items alter column tax_category set not null;

create index if not exists idx_catalog_items_type on catalog_items(type);

-- ── 3. Las 7 tablas de line items: permitir 'fee' + columna tax_category ─
-- tax_category se copia a la línea al crearla, nunca se resuelve en tiempo
-- de render — snapshot histórico, igual que hoy con `type`. Si mañana
-- cambia la categoría de un item del catálogo, las facturas/trabajos ya
-- creados no deben cambiar de total.

alter table job_line_items drop constraint if exists job_line_items_type_check;
alter table job_line_items add constraint job_line_items_type_check
  check (type in ('labor', 'product', 'fee'));
alter table job_line_items add column if not exists tax_category text;
update job_line_items set tax_category = type
where tax_category is null and type in ('labor', 'product');

alter table invoice_line_items drop constraint if exists invoice_line_items_type_check;
alter table invoice_line_items add constraint invoice_line_items_type_check
  check (type in ('labor', 'product', 'fee'));
alter table invoice_line_items add column if not exists tax_category text;
update invoice_line_items set tax_category = type
where tax_category is null and type in ('labor', 'product');

alter table estimate_line_items drop constraint if exists estimate_line_items_type_check;
alter table estimate_line_items add constraint estimate_line_items_type_check
  check (type in ('labor', 'product', 'fee'));
alter table estimate_line_items add column if not exists tax_category text;
update estimate_line_items set tax_category = type
where tax_category is null and type in ('labor', 'product');

alter table change_order_line_items drop constraint if exists change_order_line_items_type_check;
alter table change_order_line_items add constraint change_order_line_items_type_check
  check (type in ('labor', 'product', 'fee'));
alter table change_order_line_items add column if not exists tax_category text;
update change_order_line_items set tax_category = type
where tax_category is null and type in ('labor', 'product');

alter table solicitud_line_items drop constraint if exists solicitud_line_items_type_check;
alter table solicitud_line_items add constraint solicitud_line_items_type_check
  check (type in ('labor', 'product', 'fee'));
alter table solicitud_line_items add column if not exists tax_category text;
update solicitud_line_items set tax_category = type
where tax_category is null and type in ('labor', 'product');

alter table recurring_invoice_items drop constraint if exists recurring_invoice_items_type_check;
alter table recurring_invoice_items add constraint recurring_invoice_items_type_check
  check (type in ('labor', 'product', 'fee'));
alter table recurring_invoice_items add column if not exists tax_category text;
update recurring_invoice_items set tax_category = type
where tax_category is null and type in ('labor', 'product');

-- proposal_line_items usa `item_type`, no `type` — mismo tratamiento.
alter table proposal_line_items drop constraint if exists proposal_line_items_item_type_check;
alter table proposal_line_items add constraint proposal_line_items_item_type_check
  check (item_type in ('labor', 'product', 'fee'));
alter table proposal_line_items add column if not exists tax_category text;
update proposal_line_items set tax_category = item_type
where tax_category is null and item_type in ('labor', 'product');

-- Nota: deliberadamente NO se pone `tax_category` NOT NULL en las tablas de
-- line items (a diferencia de catalog_items). Las líneas históricas con
-- `type` fuera de ('labor','product') (si las hubiera) quedarían con
-- tax_category null, y lib/tax.js debe tratar null como fallback a la
-- tasa de 'product' (11.5%) igual que hace hoy el TAX map con `?? 0.115`,
-- en vez de que la migración falle o invente datos.
