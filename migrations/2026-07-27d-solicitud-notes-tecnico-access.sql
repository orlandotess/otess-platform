-- Crew App detail view for a solicitud assessment now lets the técnico add
-- visit notes/photos (mirrors calendar_event_notes/task_notes), but
-- solicitud_notes is still OFFICE3-only (see 2026-07-15b-solicitudes-rls.sql)
-- — técnico needs select/insert/delete here too, same split-tier pattern as
-- 2026-07-27c-solicitud-tecnico-access.sql, broad grant not scoped per-row
-- (consistent with how técnico already accesses job_notes).
--
-- Safe to re-run: uses DROP+CREATE for policies.

drop policy if exists solicitud_notes_select_tecnico on solicitud_notes;
create policy solicitud_notes_select_tecnico on solicitud_notes for select
  using (auth_role() = 'tecnico');

drop policy if exists solicitud_notes_insert_tecnico on solicitud_notes;
create policy solicitud_notes_insert_tecnico on solicitud_notes for insert
  with check (auth_role() = 'tecnico');

drop policy if exists solicitud_notes_delete_tecnico on solicitud_notes;
create policy solicitud_notes_delete_tecnico on solicitud_notes for delete
  using (auth_role() = 'tecnico');
