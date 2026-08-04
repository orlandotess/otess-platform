-- Sub items (accessories) for Estimados and Trabajos — same pattern proposal_line_items
-- already has: a child row hangs off a parent via parent_item_id, and the parent's
-- combine_price flag decides whether the child's own price counts toward the total
-- (false) or is assumed already folded into the parent's price (true, the default —
-- every existing row keeps behaving exactly as before).
alter table estimate_line_items
  add column if not exists parent_item_id uuid references estimate_line_items(id) on delete cascade,
  add column if not exists combine_price boolean not null default true;

alter table job_line_items
  add column if not exists parent_item_id uuid references job_line_items(id) on delete cascade,
  add column if not exists combine_price boolean not null default true;

create index if not exists idx_estimate_line_items_parent_item_id on estimate_line_items(parent_item_id);
create index if not exists idx_job_line_items_parent_item_id on job_line_items(parent_item_id);
