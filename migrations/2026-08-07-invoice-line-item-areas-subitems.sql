-- Brings Facturas up to parity with Propuestas/Estimados/Trabajos: area
-- grouping (Piso 1, Piso 2...) and sub-item accessories. Same pattern as
-- 2026-08-04-estimate-job-line-item-subitems.sql — a child row hangs off a
-- parent via parent_item_id, and the parent's combine_price flag decides
-- whether the child's own price counts toward the total (false) or is
-- assumed already folded into the parent's price (true, the default —
-- every existing invoice keeps behaving exactly as before).
alter table invoice_line_items
  add column if not exists area text,
  add column if not exists vendor text,
  add column if not exists parent_item_id uuid references invoice_line_items(id) on delete cascade,
  add column if not exists combine_price boolean not null default true;

create index if not exists idx_invoice_line_items_parent_item_id on invoice_line_items(parent_item_id);
