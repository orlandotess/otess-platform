-- Portal.io-style item notes: any existing line item can carry a free-text
-- note that renders under it on the client-facing document (proposal,
-- estimate, invoice, change order) and in the internal view. It's a plain
-- annotation — it never affects quantities, pricing, tax or totals — so the
-- column is nullable everywhere and every row already saved keeps rendering
-- exactly as before.
--
-- Same column on every line-item table so LineItemRow's `note`/`onNoteChange`
-- props work identically wherever the shared row is used.
--
-- Safe to re-run: add column if not exists.

alter table proposal_line_items add column if not exists note text;
alter table estimate_line_items add column if not exists note text;
alter table invoice_line_items add column if not exists note text;
alter table job_line_items add column if not exists note text;
alter table solicitud_line_items add column if not exists note text;
alter table change_order_line_items add column if not exists note text;

-- Recurring invoice templates too, so a note written once on the template
-- lands on every invoice the cron generates (see app/api/recurring-invoices/run).
alter table recurring_invoice_items add column if not exists note text;
