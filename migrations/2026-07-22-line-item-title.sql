-- Adds an optional `title` field to line items across Facturas, Propuestas,
-- Trabajos and Estimados. Existing `description` stays as the long/detailed
-- text; `title` is a short heading shown above it (e.g. "Access Control
-- System Installation") so admins can write longer, itemized descriptions
-- without losing a scannable label on the invoice/proposal/job/estimate.
--
-- Safe to re-run: IF NOT EXISTS guards on every column add.

alter table invoice_line_items add column if not exists title text;
alter table job_line_items add column if not exists title text;
alter table proposal_line_items add column if not exists title text;
alter table estimate_line_items add column if not exists title text;
