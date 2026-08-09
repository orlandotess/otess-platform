-- "Gestiones": tareas manuales de seguimiento para la bandeja de entrada del
-- dashboard — complementan los ítems automáticos de "Acción requerida"
-- (solicitudes sin cotizar, trabajos sin asignar, facturas sin enviar/vencidas)
-- con pendientes que no viven en ninguna otra tabla, ej. "llamar a fulano
-- para seguimiento". A diferencia de los ítems automáticos, se marcan
-- completadas a mano en vez de desaparecer solas cuando cambia el dato de
-- origen.
--
-- Tier: OFFICE3 (admin, secretaria, vendedor — tecnico excluido), igual que
-- solicitudes, porque el dashboard "/" no está en TECNICO_ALLOWED
-- (middleware.js). RLS con policies explícitas es obligatorio: las tablas
-- nuevas quedan RLS-enabled-con-cero-policies (deny-all) por
-- trg_force_rls_on_new_tables hasta que se agreguen (ver 2026-07-15b-
-- solicitudes-rls.sql).
--
-- Safe to re-run: usa IF NOT EXISTS / DROP+CREATE para policies.

create table if not exists gestiones (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null default 'otro'
    check (type in ('llamada', 'visita', 'cobro', 'seguimiento', 'recordatorio', 'otro')),

  client_id uuid references clients(id) on delete set null,

  due_date date,

  assigned_to_id uuid references profiles(id) on delete set null,
  assigned_to_name text,
  created_by_id uuid references profiles(id) on delete set null,
  created_by_name text,

  completed boolean not null default false,
  completed_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists gestiones_completed_idx on gestiones(completed);
create index if not exists gestiones_client_id_idx on gestiones(client_id);
create index if not exists gestiones_due_date_idx on gestiones(due_date);

alter table gestiones enable row level security;

drop policy if exists gestiones_select on gestiones;
create policy gestiones_select on gestiones for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists gestiones_insert on gestiones;
create policy gestiones_insert on gestiones for insert
  with check (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists gestiones_update on gestiones;
create policy gestiones_update on gestiones for update
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));
drop policy if exists gestiones_delete on gestiones;
create policy gestiones_delete on gestiones for delete
  using (auth_role() in ('admin', 'secretaria', 'vendedor'));
