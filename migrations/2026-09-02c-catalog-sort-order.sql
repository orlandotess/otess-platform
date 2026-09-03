-- Orden manual del catálogo (Labor & Productos).
--
-- Hasta ahora la lista salía por `created_at desc` — lo más reciente primero —
-- y no había forma de colocar los ítems en el orden en que se trabajan. Cada
-- ítem guarda ahora su posición con huecos de 1000, así que mover una fila es
-- normalmente un solo UPDATE (el punto medio entre sus dos vecinos) y solo
-- hace falta renumerar cuando el hueco se agota.
alter table catalog_items add column if not exists sort_order integer;

-- Backfill: se respeta el orden que la página venía mostrando, para que nadie
-- vea el catálogo barajado la primera vez que abra después de la migración.
with ordenados as (
  select id, (row_number() over (order by created_at desc)) * 1000 as pos
  from catalog_items
)
update catalog_items c
   set sort_order = o.pos
  from ordenados o
 where o.id = c.id
   and c.sort_order is null;

create index if not exists catalog_items_type_sort_order_idx
  on catalog_items (type, sort_order);
