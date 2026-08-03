-- Portal.io-style sub items: an accessory (parent_item_id child) can now be
-- priced on its own instead of always folding into the parent's "Combined
-- Price". This flag lives on the PARENT row and applies to all of its
-- children collectively — mirrors Portal's single per-item "Combine Prices"
-- toggle rather than a per-accessory switch. Existing rows default to true
-- so every proposal already saved keeps rendering exactly as before.
alter table proposal_line_items add column if not exists combine_price boolean not null default true;
