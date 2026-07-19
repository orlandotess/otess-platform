-- Stores the picked client property's name alongside calendar_events.address,
-- mirroring jobs.property_name, so the daily agenda email can show a real
-- property name instead of raw lat/lng coordinates when the address was
-- resolved from a pasted Google Maps link.
alter table calendar_events add column if not exists property_name text;

-- No RLS change needed: same tier as the existing address column (see
-- otess-rls-rollout-summary memory).
