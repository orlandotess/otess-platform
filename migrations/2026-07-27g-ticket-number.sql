-- Adds a human-readable ticket_number to service_tickets (format "TCK-####"),
-- assigned sequentially in app/boletos/nuevo/NuevoBoletoForm.js and
-- app/api/service-tickets/inbound/route.js when a ticket is created — same
-- pattern as jobs.job_number (see 2026-07-26-job-number.sql).
--
-- Backfills existing tickets in creation order starting at TCK-1001.
-- Safe to re-run: IF NOT EXISTS guard on the column add, backfill only
-- touches rows where ticket_number is still null.

alter table service_tickets add column if not exists ticket_number text;

with numbered as (
  select id, row_number() over (order by created_at) + 1000 as n
  from service_tickets
  where ticket_number is null
)
update service_tickets t
set ticket_number = 'TCK-' || numbered.n
from numbered
where t.id = numbered.id;
