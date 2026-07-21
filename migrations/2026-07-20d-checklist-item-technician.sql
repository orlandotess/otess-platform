-- Adds an optional single technician assignment per job_checklist_items row.
-- Assignment is scoped in the UI to technicians already on the job
-- (job_technicians), but the FK itself doesn't enforce that -- it just
-- points at the technicians table.
alter table job_checklist_items
  add column if not exists assigned_technician_id uuid references technicians(id) on delete set null;

create index if not exists job_checklist_items_assigned_technician_id_idx
  on job_checklist_items(assigned_technician_id);

-- No RLS change needed: job_checklist_items already has RLS covering this
-- table (see otess-rls-rollout-summary memory); a new nullable FK column
-- doesn't change who can read/write existing rows.
