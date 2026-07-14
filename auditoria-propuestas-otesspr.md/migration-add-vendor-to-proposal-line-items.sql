-- Adds the vendor/supplier field to proposal line items, mirroring the
-- existing `vendor` column already used on job_line_items / estimate_line_items.
-- Run this in the Supabase SQL editor, then confirm with the app that saving
-- a proposal item's "Suplidor" field persists and reloads correctly.

alter table proposal_line_items add column if not exists vendor text;
