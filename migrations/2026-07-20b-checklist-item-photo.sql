-- Adds an optional single photo per job_checklist_items row, stored as a
-- path in the existing 'Job-photos' storage bucket (same bucket already used
-- by job_notes, job_line_items, and expenses receipts). No table already has
-- this column, so this is additive only.
alter table job_checklist_items add column if not exists photo_url text;

-- No RLS change needed: job_checklist_items already has RLS covering this
-- table (see otess-rls-rollout-summary memory); a new nullable text column
-- doesn't change who can read/write existing rows.
