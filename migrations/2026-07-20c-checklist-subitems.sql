-- Adds optional sub-items (children) to job_checklist_items. A row with
-- parent_item_id set is a sub-item of another row in the same table
-- (single level of nesting expected; UI does not offer nesting a sub-item
-- further). Deleting a parent removes its sub-items automatically.
alter table job_checklist_items
  add column if not exists parent_item_id uuid references job_checklist_items(id) on delete cascade;

create index if not exists job_checklist_items_parent_item_id_idx
  on job_checklist_items(parent_item_id);

-- No RLS change needed: job_checklist_items already has RLS covering this
-- table (see otess-rls-rollout-summary memory); a new nullable self-FK
-- column doesn't change who can read/write existing rows.
