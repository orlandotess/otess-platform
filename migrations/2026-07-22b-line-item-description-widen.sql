-- Bug fix: the description field on line items was widened in the UI
-- (removed the 200-char limit, made it multi-line) but the database columns
-- were still `character varying(200)`, so any description over 200 chars
-- fails the whole line-item insert with "value too long for type character
-- varying(200)" — discovered while testing the title/description feature
-- from migrations/2026-07-22-line-item-title.sql. This widens the same 4
-- tables to unlimited `text` so long descriptions actually save.
--
-- Safe to re-run: ALTER COLUMN TYPE to the same type is a no-op.

alter table invoice_line_items alter column description type text;
alter table job_line_items alter column description type text;
alter table proposal_line_items alter column description type text;
alter table estimate_line_items alter column description type text;
