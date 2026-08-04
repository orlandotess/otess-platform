-- Lets one contact (e.g. a building owner or property manager) be linked to
-- multiple properties without duplicating the client_contacts row. The
-- existing client_contacts.property_id stays as-is (the contact's primary/
-- creation-time property); this junction table is for ADDITIONAL links shown
-- in a property's "Contactos asociados" list via a "+ Agregar contacto
-- existente" picker.
--
-- Tier: ALL4 (admin, secretaria, vendedor, tecnico), matching client_contacts
-- and client_properties (see otess-rls-rollout-summary memory). New tables
-- land RLS-enabled-with-zero-policies via trg_force_rls_on_new_tables, so
-- explicit policies are required here.

create table if not exists client_property_contacts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references client_properties(id) on delete cascade,
  contact_id uuid not null references client_contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (property_id, contact_id)
);

alter table client_property_contacts enable row level security;

drop policy if exists client_property_contacts_select on client_property_contacts;
create policy client_property_contacts_select on client_property_contacts for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists client_property_contacts_insert on client_property_contacts;
create policy client_property_contacts_insert on client_property_contacts for insert
  with check (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists client_property_contacts_delete on client_property_contacts;
create policy client_property_contacts_delete on client_property_contacts for delete
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
