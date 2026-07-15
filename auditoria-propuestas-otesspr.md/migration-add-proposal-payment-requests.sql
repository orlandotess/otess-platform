-- Adds Payment Requests (Portal.io parity, audit Sección A) — tracks whether
-- a Payment Schedule line has actually been requested from / marked paid by
-- the client. One request per schedule line (unique on payment_id). Internal
-- only: never surfaced on the public proposal link. Tracking is manual —
-- QuickBooks is excluded from this phase, so "pagado" is set by hand.
-- Run in the Supabase SQL editor.

create table if not exists proposal_payment_requests (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  payment_id uuid not null unique references proposal_payments(id) on delete cascade,
  amount numeric not null,
  status text not null default 'solicitado' check (status in ('solicitado', 'pagado')),
  requested_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- Same OFFICE3 tier as proposals and its other child tables (proposal_options,
-- proposal_line_items, proposal_payments) — admin/secretaria/vendedor, tecnico
-- excluded since /propuestas isn't in tecnico's allowed routes. Reuses the
-- existing auth_role() security-definer helper (see company_settings_rls).
create policy "proposal_payment_requests_office3_select" on proposal_payment_requests
  for select using (auth_role() in ('admin', 'secretaria', 'vendedor'));
create policy "proposal_payment_requests_office3_insert" on proposal_payment_requests
  for insert with check (auth_role() in ('admin', 'secretaria', 'vendedor'));
create policy "proposal_payment_requests_office3_update" on proposal_payment_requests
  for update using (auth_role() in ('admin', 'secretaria', 'vendedor'));
create policy "proposal_payment_requests_office3_delete" on proposal_payment_requests
  for delete using (auth_role() in ('admin', 'secretaria', 'vendedor'));
