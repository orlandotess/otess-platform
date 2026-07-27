-- Técnico can now add line items (with área/vendor/photo) from the mobile
-- solicitud detail view reached through the Crew App, but solicitud_line_items
-- is still OFFICE3-only (see 2026-07-15b-solicitudes-rls.sql) — same gap as
-- solicitudes/solicitud_technicians/solicitud_notes before it. Same split-tier
-- pattern, broad grant not scoped per-row.
--
-- Safe to re-run: uses DROP+CREATE for policies.

drop policy if exists solicitud_line_items_select_tecnico on solicitud_line_items;
create policy solicitud_line_items_select_tecnico on solicitud_line_items for select
  using (auth_role() = 'tecnico');

drop policy if exists solicitud_line_items_insert_tecnico on solicitud_line_items;
create policy solicitud_line_items_insert_tecnico on solicitud_line_items for insert
  with check (auth_role() = 'tecnico');

drop policy if exists solicitud_line_items_delete_tecnico on solicitud_line_items;
create policy solicitud_line_items_delete_tecnico on solicitud_line_items for delete
  using (auth_role() = 'tecnico');
