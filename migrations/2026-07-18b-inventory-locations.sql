-- Upgrade de Inventario: jerarquía de ubicaciones (Almacén > Zona > Estante > Bin,
-- más Sitios y Vans como raíces) y stock por ubicación, inspirado en apps tipo
-- Specifi.io. Antes de esto, stock era un solo número global en
-- catalog_items.stock_quantity (ver scratchpad/inventory_migration.sql, ya vivo
-- en prod). Esta migración agrega la jerarquía y convierte el stock en algo
-- rastreable por ubicación, sin romper los 2 call sites existentes de
-- adjust_catalog_stock (facturas nuevas y cancelación/borrado de facturas).
--
-- Alcance explícito NO incluido aquí (ver plan): selector de ubicación por
-- línea de factura/estima, consumo de stock desde estimas, vínculo de "Sitios"
-- a jobs/clientes reales, acceso de rol tecnico (no está en middleware.js
-- TECNICO_ALLOWED).
--
-- Safe to re-run: usa if not exists / drop+create para funciones y políticas.

-- 1. Jerarquía de ubicaciones (adjacency list, profundidad arbitraria).
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid null references locations(id) on delete restrict,
  type text not null check (type in ('warehouse', 'site', 'van', 'zone', 'shelf', 'bin')),
  name text not null,
  code text null,
  is_active boolean not null default true,
  notes text null,
  created_by text null,
  created_at timestamptz not null default now()
);

create index if not exists locations_parent_id_idx on locations(parent_id);

alter table locations enable row level security;

drop policy if exists "locations_all_office3" on locations;
create policy "locations_all_office3"
  on locations for all
  using (auth_role() in ('admin', 'secretaria', 'vendedor'))
  with check (auth_role() in ('admin', 'secretaria', 'vendedor'));

-- 2. Cantidad de cada producto por ubicación. Fuente de verdad para el
-- desglose; catalog_items.stock_quantity sigue siendo el agregado (mantenido
-- en lockstep por adjust_catalog_stock, nunca escrito directo por el cliente).
create table if not exists location_stock (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete restrict,
  catalog_item_id uuid not null references catalog_items(id),
  quantity numeric not null default 0,
  unique (location_id, catalog_item_id)
);

alter table location_stock enable row level security;

-- Sin check de quantity >= 0: misma filosofía que ya existe en
-- adjust_catalog_stock (la UI advierte stock insuficiente, no bloquea).
drop policy if exists "location_stock_all_office3" on location_stock;
create policy "location_stock_all_office3"
  on location_stock for all
  using (auth_role() in ('admin', 'secretaria', 'vendedor'))
  with check (auth_role() in ('admin', 'secretaria', 'vendedor'));

-- 3. Ubicación "de origen" de un producto: de aquí se descuenta por defecto
-- al facturar (no hay selector de ubicación por línea de factura en v1).
alter table catalog_items add column if not exists default_location_id uuid null references locations(id) on delete set null;

-- 4. Auditoría de movimientos: qué ubicación afectó cada ajuste, y qué pares
-- de filas pertenecen a la misma transferencia.
alter table inventory_transactions add column if not exists location_id uuid null references locations(id) on delete set null;
alter table inventory_transactions add column if not exists transfer_group_id uuid null;

-- 5. Redefinir adjust_catalog_stock con un 5to parámetro p_location_id.
-- IMPORTANTE: hay que dropear la firma vieja antes de crear la nueva, porque
-- Postgres identifica funciones por (nombre, tipos de argumentos) — si solo
-- se agrega un parámetro con create or replace, queda una función *nueva* al
-- lado de la vieja de 4 argumentos, y PostgREST (lo que usa supabase.rpc())
-- puede tirar "ambiguous function" en los 2 call sites existentes que llaman
-- con los 4 argumentos originales. Con el drop first, solo queda una función,
-- y esos 2 call sites siguen funcionando igual gracias al default null.
drop function if exists adjust_catalog_stock(uuid, numeric, uuid, text);

create function adjust_catalog_stock(
  p_catalog_item_id uuid,
  p_delta numeric,
  p_invoice_id uuid,
  p_reason text,
  p_location_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update catalog_items
  set stock_quantity = stock_quantity + p_delta
  where id = p_catalog_item_id
    and stock_quantity is not null;

  if p_location_id is not null then
    insert into location_stock (location_id, catalog_item_id, quantity)
    values (p_location_id, p_catalog_item_id, p_delta)
    on conflict (location_id, catalog_item_id)
    do update set quantity = location_stock.quantity + excluded.quantity;
  end if;

  insert into inventory_transactions (catalog_item_id, delta, reason, invoice_id, created_by, location_id)
  values (p_catalog_item_id, p_delta, p_reason, p_invoice_id, auth.email(), p_location_id);
end;
$$;

grant execute on function adjust_catalog_stock(uuid, numeric, uuid, text, uuid) to authenticated;

-- 6. Transferir stock existente entre 2 ubicaciones (no cambia el agregado
-- global, solo redistribuye). Distinto de adjust_catalog_stock: recibir stock
-- nuevo o dar de baja stock es un ajuste de una sola ubicación, no una
-- transferencia entre dos.
create or replace function transfer_stock(
  p_catalog_item_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_quantity numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := gen_random_uuid();
begin
  if p_from_location_id is null or p_to_location_id is null then
    raise exception 'transfer_stock requiere p_from_location_id y p_to_location_id';
  end if;

  insert into location_stock (location_id, catalog_item_id, quantity)
  values (p_from_location_id, p_catalog_item_id, -p_quantity)
  on conflict (location_id, catalog_item_id)
  do update set quantity = location_stock.quantity - p_quantity;

  insert into location_stock (location_id, catalog_item_id, quantity)
  values (p_to_location_id, p_catalog_item_id, p_quantity)
  on conflict (location_id, catalog_item_id)
  do update set quantity = location_stock.quantity + p_quantity;

  insert into inventory_transactions (catalog_item_id, delta, reason, invoice_id, created_by, location_id, transfer_group_id)
  values (p_catalog_item_id, -p_quantity, p_reason, null, auth.email(), p_from_location_id, v_group_id);

  insert into inventory_transactions (catalog_item_id, delta, reason, invoice_id, created_by, location_id, transfer_group_id)
  values (p_catalog_item_id, p_quantity, p_reason, null, auth.email(), p_to_location_id, v_group_id);
end;
$$;

grant execute on function transfer_stock(uuid, uuid, uuid, numeric, text) to authenticated;

-- 7. Backfill: darle a cada producto con stock trackeado una ubicación
-- "Legacy" cuya cantidad arranca igual al agregado ya existente. Es una
-- copia puntual (insert directo), NUNCA vía adjust_catalog_stock — esa
-- función aplica el valor como un delta, así que usarla acá duplicaría el
-- agregado (50 + 50 = 100). Con este insert directo, el invariante
-- "agregado == suma(location_stock)" queda correcto desde el día uno.
insert into locations (type, name, code)
select 'warehouse', 'Sin Ubicación (Legacy)', 'LEGACY'
where not exists (select 1 from locations where code = 'LEGACY');

insert into location_stock (location_id, catalog_item_id, quantity)
select l.id, ci.id, ci.stock_quantity
from catalog_items ci
cross join (select id from locations where code = 'LEGACY') l
where ci.type = 'product' and ci.stock_quantity is not null and ci.stock_quantity <> 0
on conflict (location_id, catalog_item_id) do nothing;

update catalog_items ci
set default_location_id = (select id from locations where code = 'LEGACY')
where ci.type = 'product' and ci.stock_quantity is not null and ci.default_location_id is null;
