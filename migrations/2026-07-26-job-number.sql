-- Documents the `job_number` column on `jobs` (format "JOB-####", assigned
-- sequentially in app/trabajos/nuevo/page.js when a job is created). This
-- column already exists in production — it was added directly in Supabase
-- Studio before this migrations/ convention existed — this file just backfills
-- the schema history so it's reproducible.
--
-- Safe to re-run: IF NOT EXISTS guard on the column add.

alter table jobs add column if not exists job_number text;
