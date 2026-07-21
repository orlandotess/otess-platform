-- Per-marker color override, independent of the shared element_types
-- catalog color. element_types.system_color is intentionally shared/
-- read-only across the whole org (consistent category color coding), so
-- this lets a user tag individual icon instances on one plan (e.g. by
-- zone or circuit) without touching that shared catalog.
-- Rendered as a colored ring around the marker; null keeps the default
-- category-color ring.
-- Safe to re-run: uses IF NOT EXISTS.

alter table floor_plan_markers add column if not exists custom_color text;
