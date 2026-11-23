-- Marca de "este producto es cable" en el catálogo, para el botón
-- "🧵 Cable box" de Labor & Productos → Productos, que enseña solo los cables.
--
-- Antes no había forma de saberlo: se adivinaba porque el producto tenía cajas
-- registradas (location_stock_reels), así que un cable nuevo sin cajas no
-- salía en ninguna lista de cable. Ahora la oficina lo marca con el check
-- "🧵 Es cable" al crear o editar el producto.
--
-- Relleno inicial: se marcan los productos que ya tienen al menos una caja,
-- menos los patch cables (misma regla que lib/cableBoxes.js: "patch" en el
-- nombre, la descripción o el código), que no son cajas de cable.
--
-- Tier: sin cambio. catalog_items no recibe RLS nueva; la oficina ya la
-- actualiza desde Catálogo.
--
-- Safe to re-run: el relleno solo corre la primera vez (cuando se crea la
-- columna), así que no vuelve a marcar lo que alguien haya desmarcado.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'catalog_items' and column_name = 'is_cable'
  ) then
    alter table catalog_items add column is_cable boolean not null default false;

    update catalog_items ci
       set is_cable = true
     where ci.type = 'product'
       and exists (select 1 from location_stock_reels r where r.catalog_item_id = ci.id)
       and concat_ws(' ', ci.name, ci.description, ci.item_code) !~* 'patch';
  end if;
end $$;
