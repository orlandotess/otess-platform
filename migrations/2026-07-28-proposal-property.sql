-- Propuestas didn't have a job-site property at all (only the client's billing
-- address via client_addresses). Mirrors estimates.property_id — a pure FK into
-- client_properties, no denormalized name/street/city columns — since "new
-- property" is saved straight into client_properties from the form instead of
-- duplicating address fields onto proposals.
alter table proposals add column if not exists property_id uuid references client_properties(id) on delete set null;
