-- Allow storing additional phone numbers (with a label) alongside the existing
-- single `phone` column on clients and client_contacts. The original `phone`
-- column stays as the primary number so every other page that reads
-- client.phone / contact.phone keeps working unchanged.
alter table clients add column if not exists extra_phones jsonb not null default '[]'::jsonb;
alter table client_contacts add column if not exists extra_phones jsonb not null default '[]'::jsonb;
