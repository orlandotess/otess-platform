-- Adds a per-line-item warranty expiration date to Trabajos line items, so
-- each installed product can carry its own warranty (equipment warranties
-- vary by manufacturer, unlike the flat "1 año" labor warranty text already
-- shown on invoice/estimate terms). Scoped to job_line_items only — warranty
-- applies once a product is actually installed, not while quoting on
-- estimates/proposals, so those tables are left untouched.
--
-- Safe to re-run: IF NOT EXISTS guard on the column add.

alter table job_line_items add column if not exists warranty_expires_at date;
