-- Cajas/carretes de cable dentro de Inventario: cada caja física tiene un
-- pietaje total y un pietaje restante que baja con el uso, a diferencia de
-- location_stock (un solo agregado por producto+ubicación, sin saber cuántas
-- cajas hay ni cuánto le queda a cada una) y de location_stock_units (equipo
-- serializado, presencia binaria por unidad — no aplica a algo que se consume
-- parcialmente como el cable).
--
-- El agregado en location_stock y catalog_items.stock_quantity se mantiene en
-- sincronía automáticamente desde las funciones de abajo (nunca se escribe
-- directo desde el cliente), igual que ya hace adjust_catalog_stock.
--
-- Safe to re-run: if not exists / drop+create.

create table if not exists location_stock_reels (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete restrict,
  catalog_item_id uuid not null references catalog_items(id),
  code text null,
  total_footage numeric not null,
  remaining_footage numeric not null,
  photo_path text null,
  notes text null,
  created_by text null,
  created_at timestamptz not null default now()
);

create index if not exists location_stock_reels_location_id_idx on location_stock_reels(location_id);
create index if not exists location_stock_reels_catalog_item_id_idx on location_stock_reels(catalog_item_id);

alter table location_stock_reels enable row level security;

-- ALL4: técnicos agregan/descuentan cajas desde el Crew App en campo, oficina
-- lo mismo desde /catalogo, igual que location_stock_units.
drop policy if exists "location_stock_reels_all_all4" on location_stock_reels;
create policy "location_stock_reels_all_all4"
  on location_stock_reels for all
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'))
  with check (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));

-- Registrar una caja nueva: crea la fila y suma el pietaje total al agregado
-- (location_stock + catalog_items.stock_quantity), como si fuera stock recibido.
create or replace function add_stock_reel(
  p_catalog_item_id uuid,
  p_location_id uuid,
  p_total_footage numeric,
  p_code text default null,
  p_photo_path text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reel_id uuid;
begin
  if p_total_footage is null or p_total_footage <= 0 then
    raise exception 'El pietaje total debe ser mayor a 0';
  end if;

  insert into location_stock_reels (location_id, catalog_item_id, code, total_footage, remaining_footage, photo_path, notes, created_by)
  values (p_location_id, p_catalog_item_id, p_code, p_total_footage, p_total_footage, p_photo_path, p_notes, auth.email())
  returning id into v_reel_id;

  insert into location_stock (location_id, catalog_item_id, quantity)
  values (p_location_id, p_catalog_item_id, p_total_footage)
  on conflict (location_id, catalog_item_id)
  do update set quantity = location_stock.quantity + p_total_footage;

  update catalog_items
  set stock_quantity = coalesce(stock_quantity, 0) + p_total_footage
  where id = p_catalog_item_id;

  insert into inventory_transactions (catalog_item_id, delta, reason, invoice_id, created_by, location_id)
  values (p_catalog_item_id, p_total_footage, 'Caja de cable agregada', null, auth.email(), p_location_id);

  return v_reel_id;
end;
$$;

grant execute on function add_stock_reel(uuid, uuid, numeric, text, text, text) to authenticated;

-- Descontar pies usados de una caja específica. No bloquea si queda negativo
-- (misma filosofía que adjust_catalog_stock: la UI advierte, no impide) —
-- pasarse de la cuenta real de la caja es señal de que hay que corregir el
-- pietaje total, no un estado que la función deba prohibir.
create or replace function use_reel_footage(
  p_reel_id uuid,
  p_footage numeric,
  p_reason text default 'Uso de campo'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_catalog_item_id uuid;
begin
  if p_footage is null or p_footage <= 0 then
    raise exception 'Los pies usados deben ser mayor a 0';
  end if;

  select location_id, catalog_item_id into v_location_id, v_catalog_item_id
  from location_stock_reels where id = p_reel_id;

  if v_catalog_item_id is null then
    raise exception 'Caja % no encontrada', p_reel_id;
  end if;

  update location_stock_reels
  set remaining_footage = remaining_footage - p_footage
  where id = p_reel_id;

  insert into location_stock (location_id, catalog_item_id, quantity)
  values (v_location_id, v_catalog_item_id, -p_footage)
  on conflict (location_id, catalog_item_id)
  do update set quantity = location_stock.quantity - p_footage;

  update catalog_items
  set stock_quantity = stock_quantity - p_footage
  where id = v_catalog_item_id and stock_quantity is not null;

  insert into inventory_transactions (catalog_item_id, delta, reason, invoice_id, created_by, location_id)
  values (v_catalog_item_id, -p_footage, p_reason, null, auth.email(), v_location_id);
end;
$$;

grant execute on function use_reel_footage(uuid, numeric, text) to authenticated;

-- Eliminar una caja (vacía, dañada, error de captura): resta solo lo que le
-- quedaba (remaining_footage), no el total — lo ya consumido ya se descontó
-- del agregado vía use_reel_footage cuando se usó.
create or replace function delete_stock_reel(
  p_reel_id uuid,
  p_reason text default 'Caja de cable eliminada'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_catalog_item_id uuid;
  v_remaining numeric;
begin
  select location_id, catalog_item_id, remaining_footage into v_location_id, v_catalog_item_id, v_remaining
  from location_stock_reels where id = p_reel_id;

  if v_catalog_item_id is null then
    return;
  end if;

  delete from location_stock_reels where id = p_reel_id;

  if v_remaining <> 0 then
    insert into location_stock (location_id, catalog_item_id, quantity)
    values (v_location_id, v_catalog_item_id, -v_remaining)
    on conflict (location_id, catalog_item_id)
    do update set quantity = location_stock.quantity - v_remaining;

    update catalog_items
    set stock_quantity = stock_quantity - v_remaining
    where id = v_catalog_item_id and stock_quantity is not null;

    insert into inventory_transactions (catalog_item_id, delta, reason, invoice_id, created_by, location_id)
    values (v_catalog_item_id, -v_remaining, p_reason, null, auth.email(), v_location_id);
  end if;
end;
$$;

grant execute on function delete_stock_reel(uuid, text) to authenticated;
