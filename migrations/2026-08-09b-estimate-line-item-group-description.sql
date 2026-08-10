-- Lets a top-level estimate line item carry a manual override for how its
-- title-group renders on the client-facing estimate. Materials added by the
-- cable/tubo calculator share a `title` and collapse into one row via
-- groupItemsForDisplay() (app/estimados/[id]/page.js), auto-listing each
-- material as "Nx Description, ...". This column lets a user replace that
-- auto-generated text with custom wording for the printed/sent estimate,
-- without touching the underlying materials, quantities, or costs.
--
-- Safe to re-run: add column if not exists.

alter table estimate_line_items add column if not exists group_description text;
