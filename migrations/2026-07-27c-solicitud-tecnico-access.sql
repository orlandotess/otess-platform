-- The new Crew App "Evaluaciones" section (app/crew/page.js) reads solicitudes
-- assigned to the logged-in técnico and lets them mark the on-site assessment
-- complete. solicitudes/solicitud_technicians are currently OFFICE3-only
-- (admin, secretaria, vendedor — see 2026-07-15b-solicitudes-rls.sql), which
-- silently blocks técnico reads/writes. Layers técnico SELECT+UPDATE on top of
-- the existing OFFICE3 policies, same split-tier pattern as locations/
-- location_stock for Inventario (see otess-rls-rollout-summary memory,
-- 2026-07-18 addition) — a broad grant, not scoped per-row, matching how
-- técnico already gets full access to jobs/job_technicians: the Crew App's
-- own queries (technician_id / junction filters) are what actually scope what
-- a técnico sees, not RLS row ownership, per the project's established
-- decision not to build per-technician row scoping.
--
-- Safe to re-run: uses DROP+CREATE for policies.

drop policy if exists solicitudes_select_tecnico on solicitudes;
create policy solicitudes_select_tecnico on solicitudes for select
  using (auth_role() = 'tecnico');

drop policy if exists solicitudes_update_tecnico on solicitudes;
create policy solicitudes_update_tecnico on solicitudes for update
  using (auth_role() = 'tecnico');

drop policy if exists solicitud_technicians_select_tecnico on solicitud_technicians;
create policy solicitud_technicians_select_tecnico on solicitud_technicians for select
  using (auth_role() = 'tecnico');
