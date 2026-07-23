-- Tracks whether the one-time "warranty about to expire" admin email has
-- already gone out for a line item, so the daily cron
-- (app/api/warranty-reminders/run) doesn't re-notify on every run.
--
-- Safe to re-run: IF NOT EXISTS guard on the column add.

alter table job_line_items add column if not exists warranty_reminder_sent_at timestamptz;
