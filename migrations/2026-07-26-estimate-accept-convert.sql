-- Adds client-facing acceptance and admin "convert to job" tracking to
-- estimates. The client accepts on the public /estimado/[id] page (status
-- draft|sent|accepted|cancelled|converted, was draft|sent|cancelled); staff
-- then convert the accepted estimate into a job from /estimados/[id],
-- optionally scheduling it in the same step. Mirrors solicitudes'
-- converted_to_job_id pattern (2026-07-15-solicitudes.sql).
--
-- Safe to re-run: IF NOT EXISTS guards on every column add.

alter table estimates add column if not exists accepted_at timestamptz;
alter table estimates add column if not exists converted_to_job_id uuid references jobs(id) on delete set null;
