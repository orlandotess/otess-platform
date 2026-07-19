-- Equipo serializado dentro de Inventario: unidades individuales con serial
-- number único + foto propia, separado del stock por cantidad que ya existe
-- en location_stock (cables, mounts, etc. siguen contándose por cantidad —
-- esto es para equipo donde importa CUÁL unidad física es: cámaras, NVRs,
-- paneles...). Usado desde el Crew App (tab Inventario) y el panel de admin
-- (/inventario).
--
-- Fotos van al bucket "Job-photos" que ya existe (mismo patrón que usa
-- job_notes), bajo el prefijo "inventory/", así que no hace falta bucket ni
-- policies de storage nuevos.
--
-- Safe to re-run: if not exists / drop+create.

create table if not exists location_stock_units (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete restrict,
  catalog_item_id uuid not null references catalog_items(id),
  serial_number text not null,
  photo_path text null,
  notes text null,
  created_by text null,
  created_at timestamptz not null default now(),
  unique (serial_number)
);

create index if not exists location_stock_units_location_id_idx on location_stock_units(location_id);
create index if not exists location_stock_units_catalog_item_id_idx on location_stock_units(catalog_item_id);

alter table location_stock_units enable row level security;

-- ALL4: tanto técnicos (agregan equipo al recibirlo/instalarlo desde el
-- Crew App) como oficina (desde /inventario) pueden crear/editar/eliminar,
-- igual que job_notes/job_checklist_items.
drop policy if exists "location_stock_units_all_all4" on location_stock_units;
create policy "location_stock_units_all_all4"
  on location_stock_units for all
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'))
  with check (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
