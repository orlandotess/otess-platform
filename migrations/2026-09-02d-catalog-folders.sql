-- Carpetas del catálogo, con nombre editable, para Labor y Productos.
--
-- Es una tabla y no un texto en el ítem justo por lo de "nombre editable":
-- así renombrar una carpeta se hace en un sitio y los ítems de adentro se
-- enteran solos, en vez de reescribir N filas y arriesgar que un "Camaras" sin
-- tilde parta la carpeta en dos.
--
-- Un ítem vive en una carpeta o en ninguna (`folder_id` nullable): una carpeta
-- es un lugar, no una etiqueta.
create table if not exists catalog_folders (
  id uuid primary key default gen_random_uuid(),
  -- La carpeta pertenece a una pestaña: las de Labor y las de Productos no se
  -- parecen en nada, y compartirlas llenaría las dos de carpetas vacías.
  type text not null check (type in ('labor', 'product')),
  name text not null,
  -- Mismo orden manual que los ítems (ver 2026-09-02c-catalog-sort-order.sql).
  sort_order integer,
  created_at timestamptz not null default now()
);

alter table catalog_folders enable row level security;

drop policy if exists "catalog_folders_read" on catalog_folders;
create policy "catalog_folders_read"
  on catalog_folders for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));

drop policy if exists "catalog_folders_all_office" on catalog_folders;
create policy "catalog_folders_all_office"
  on catalog_folders for all
  using (auth_role() in ('admin', 'secretaria', 'vendedor'))
  with check (auth_role() in ('admin', 'secretaria', 'vendedor'));

-- `on delete set null`, nunca cascade: borrar una carpeta saca los ítems de
-- ella, no los borra.
alter table catalog_items
  add column if not exists folder_id uuid null references catalog_folders(id) on delete set null;

create index if not exists catalog_items_folder_id_idx on catalog_items (folder_id);
