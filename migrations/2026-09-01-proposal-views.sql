-- Historial de aperturas de la propuesta pública, equivalente a
-- estimate_views / invoice_views. `proposals.viewed_at` ya existía pero solo
-- guarda la PRIMERA apertura (y voltea el status a 'vista'); esta tabla lleva
-- el conteo y la fecha de cada apertura, que es lo que alimenta la
-- notificación "👁️ Propuesta PROP-#### fue abierta" en la bandeja y el
-- correo de aviso a services@otesspr.com.
--
-- A diferencia de estimate_views/invoice_views, el FK va con `on delete
-- cascade`: así borrar una propuesta limpia sus vistas solo, sin el
-- `delete().eq(...)` manual que EstimateActions/InvoiceActions tienen que
-- hacer antes de borrar el documento padre.
--
-- Tier: la escritura viene de app/propuesta/[token]/page.js, que corre con el
-- service role (bypassa RLS) porque el cliente que abre el enlace es anónimo.
-- La lectura es de oficina, igual que las otras tablas del dashboard. RLS con
-- policies explícitas es obligatorio: las tablas nuevas quedan
-- RLS-enabled-con-cero-policies (deny-all) por trg_force_rls_on_new_tables
-- hasta que se agreguen (ver 2026-07-15b-solicitudes-rls.sql).
--
-- Safe to re-run: usa IF NOT EXISTS / DROP+CREATE para policies.

create table if not exists proposal_views (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  viewed_at timestamptz not null default now()
);

create index if not exists proposal_views_proposal_id_idx on proposal_views(proposal_id);
create index if not exists proposal_views_viewed_at_idx on proposal_views(viewed_at);

alter table proposal_views enable row level security;

drop policy if exists proposal_views_select on proposal_views;
create policy proposal_views_select on proposal_views for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists proposal_views_delete on proposal_views;
create policy proposal_views_delete on proposal_views for delete
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));

-- Sin policy de insert/update a propósito: la única escritura es la del
-- service role desde la página pública, que no pasa por RLS.
