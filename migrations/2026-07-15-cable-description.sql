-- Adds a free-text description to individual cable runs, separate from the
-- cable's title — floor_plan_cables.label already existed (from the
-- original floor_plans_migration.sql) but was never exposed in the editor
-- UI until now; this migration only adds the new description column.
-- Safe to re-run.

alter table floor_plan_cables add column if not exists description text null;
