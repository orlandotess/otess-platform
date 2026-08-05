-- Links auto-generated checklist items back to the job_line_item (product/labor)
-- they were generated from, so the crew checklist can show what the item actually
-- is instead of just a free-text description. item_type is denormalized from the
-- source line item's `type` at generation time so the checklist doesn't need to
-- join back to job_line_items just to know whether a row is a product or labor.
alter table job_checklist_items
  add column if not exists source_line_item_id uuid references job_line_items(id) on delete set null,
  add column if not exists item_type text check (item_type is null or item_type in ('labor', 'product', 'fee'));

create index if not exists job_checklist_items_source_line_item_id_idx
  on job_checklist_items(source_line_item_id);

-- No RLS change needed: job_checklist_items already has RLS covering this
-- table; nullable columns don't change who can read/write existing rows.
