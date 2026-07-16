-- Enables RLS with real policies on the solicitudes tables, matching the
-- project-wide convention (see otess-rls-rollout-summary / policy-rls-required
-- memories: every table must have RLS on, never disabled to unblock a save).
-- These tables landed as RLS-enabled-with-zero-policies automatically via
-- trg_force_rls_on_new_tables (deny-all until policies are added), which is
-- why client-side inserts failed until now.
--
-- Tier: OFFICE3 (admin, secretaria, vendedor — tecnico excluded), same tier
-- as proposals/estimates, because /solicitudes is not in middleware.js's
-- TECNICO_ALLOWED list. Reuses the existing auth_role() security-definer
-- helper rather than redefining a role check.
--
-- Safe to re-run: uses DROP+CREATE for policies.

alter table solicitudes enable row level security;
alter table solicitud_line_items enable row level security;
alter table solicitud_notes enable row level security;

drop policy if exists solicitudes_select on solicitudes;
create policy solicitudes_select on solicitudes for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists solicitudes_insert on solicitudes;
create policy solicitudes_insert on solicitudes for insert
  with check (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists solicitudes_update on solicitudes;
create policy solicitudes_update on solicitudes for update
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists solicitudes_delete on solicitudes;
create policy solicitudes_delete on solicitudes for delete
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));

drop policy if exists solicitud_line_items_select on solicitud_line_items;
create policy solicitud_line_items_select on solicitud_line_items for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists solicitud_line_items_insert on solicitud_line_items;
create policy solicitud_line_items_insert on solicitud_line_items for insert
  with check (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists solicitud_line_items_update on solicitud_line_items;
create policy solicitud_line_items_update on solicitud_line_items for update
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists solicitud_line_items_delete on solicitud_line_items;
create policy solicitud_line_items_delete on solicitud_line_items for delete
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));

drop policy if exists solicitud_notes_select on solicitud_notes;
create policy solicitud_notes_select on solicitud_notes for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists solicitud_notes_insert on solicitud_notes;
create policy solicitud_notes_insert on solicitud_notes for insert
  with check (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists solicitud_notes_update on solicitud_notes;
create policy solicitud_notes_update on solicitud_notes for update
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists solicitud_notes_delete on solicitud_notes;
create policy solicitud_notes_delete on solicitud_notes for delete
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));
