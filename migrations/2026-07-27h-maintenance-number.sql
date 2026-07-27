-- Adds a human-readable maintenance_number to recurring_maintenances (format
-- "MNT-####"), assigned sequentially in app/mantenimientos/MantenimientoForm.js
-- when a plan is created — same pattern as jobs.job_number and
-- service_tickets.ticket_number (see 2026-07-26-job-number.sql and
-- 2026-07-27g-ticket-number.sql).
--
-- Backfills existing plans in creation order starting at MNT-1001.
-- Safe to re-run: IF NOT EXISTS guard on the column add, backfill only
-- touches rows where maintenance_number is still null.

alter table recurring_maintenances add column if not exists maintenance_number text;

with numbered as (
  select id, row_number() over (order by created_at) + 1000 as n
  from recurring_maintenances
  where maintenance_number is null
)
update recurring_maintenances t
set maintenance_number = 'MNT-' || numbered.n
from numbered
where t.id = numbered.id;
