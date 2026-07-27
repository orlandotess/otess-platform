-- Multi-technician support for solicitudes (mirrors calendar_event_technicians /
-- job_technicians). Lets "Evaluación en sitio" have 1+ technicians assigned.
-- Run this in the Supabase SQL editor.
--
-- Tier: OFFICE3 (admin, secretaria, vendedor — tecnico excluded), same as the
-- rest of solicitudes/solicitud_line_items/solicitud_notes (see
-- 2026-07-15b-solicitudes-rls.sql), since /solicitudes is not in
-- middleware.js's TECNICO_ALLOWED list.
--
-- Safe to re-run: uses IF NOT EXISTS / DROP+CREATE for policies.

alter table solicitudes add column if not exists technician_id uuid references technicians(id) on delete set null;

create table if not exists solicitud_technicians (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references solicitudes(id) on delete cascade,
  technician_id uuid not null references technicians(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (solicitud_id, technician_id)
);

alter table solicitud_technicians enable row level security;

drop policy if exists solicitud_technicians_select on solicitud_technicians;
create policy solicitud_technicians_select on solicitud_technicians for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));

drop policy if exists solicitud_technicians_insert on solicitud_technicians;
create policy solicitud_technicians_insert on solicitud_technicians for insert
  with check (auth_role() in ('admin', 'secretaria', 'vendedor'));

drop policy if exists solicitud_technicians_delete on solicitud_technicians;
create policy solicitud_technicians_delete on solicitud_technicians for delete
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));
