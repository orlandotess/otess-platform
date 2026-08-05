-- Multi-contact support for jobs and solicitudes, each with a free-text
-- "cargo" (role/title) — e.g. "Omar Figueroa" with cargo "Project Manager".
-- Mirrors the job_technicians/solicitud_technicians junction pattern, plus
-- an update policy so an already-added row can be edited in place (e.g.
-- swap to a different contact or fix the cargo) instead of remove+re-add.
-- contact_id is an optional link back
-- to client_contacts (when the row was picked from the client's contact
-- list); name/phone/email are always stored directly on the row so manually
-- typed contacts work the same as picked ones.
--
-- The old scalar jobs.contact_id/contact_name/contact_phone/contact_email
-- and solicitudes.contact_id/contact_name/contact_phone/contact_email
-- columns are left in place (still referenced by historical rows / other
-- reports) but are no longer written to by the UI.
--
-- Tier: jobs/job_technicians are ALL4 (admin, secretaria, vendedor, tecnico
-- — técnico needs read access via the Crew App, see otess-rls-rollout-
-- summary memory), so job_contacts matches. solicitudes/solicitud_technicians
-- are OFFICE3 (admin, secretaria, vendedor — técnico excluded, see
-- 2026-07-15b-solicitudes-rls.sql) and the Crew App's solicitud view doesn't
-- surface contacts, so solicitud_contacts stays OFFICE3-only.
--
-- Safe to re-run: uses IF NOT EXISTS / DROP+CREATE for policies.

create table if not exists job_contacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  contact_id uuid references client_contacts(id) on delete set null,
  name text not null,
  phone text,
  email text,
  cargo text,
  created_at timestamptz not null default now()
);

alter table job_contacts enable row level security;

drop policy if exists job_contacts_select on job_contacts;
create policy job_contacts_select on job_contacts for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists job_contacts_insert on job_contacts;
create policy job_contacts_insert on job_contacts for insert
  with check (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists job_contacts_update on job_contacts;
create policy job_contacts_update on job_contacts for update
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists job_contacts_delete on job_contacts;
create policy job_contacts_delete on job_contacts for delete
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));

create table if not exists solicitud_contacts (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references solicitudes(id) on delete cascade,
  contact_id uuid references client_contacts(id) on delete set null,
  name text not null,
  phone text,
  email text,
  cargo text,
  created_at timestamptz not null default now()
);

alter table solicitud_contacts enable row level security;

drop policy if exists solicitud_contacts_select on solicitud_contacts;
create policy solicitud_contacts_select on solicitud_contacts for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists solicitud_contacts_insert on solicitud_contacts;
create policy solicitud_contacts_insert on solicitud_contacts for insert
  with check (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists solicitud_contacts_update on solicitud_contacts;
create policy solicitud_contacts_update on solicitud_contacts for update
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists solicitud_contacts_delete on solicitud_contacts;
create policy solicitud_contacts_delete on solicitud_contacts for delete
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));
