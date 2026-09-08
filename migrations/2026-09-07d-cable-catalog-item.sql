-- El tipo de cable se ordena por un producto del catálogo ("Planos").
--
-- La lista del plano ya sale por artículo, con código, suplidor y precio — pero
-- el cable no. Se calcula bien (pies estimados + trazados, redondeado a cajas)
-- y ahí se queda: "42 cajas de Cat6 Riser Blue", sin código y sin precio. En un
-- estimado eso son mil y pico de dólares que había que escribir a mano.
--
-- cable_types.catalog_item_id — el producto con el que se compran las cajas de
-- ESE tipo de cable. Null = como hasta ahora, solo pies y cajas. El precio y el
-- suplidor salen del catálogo, igual que todo lo demás en la lista; aquí solo
-- se guarda cuál es.
--
-- Sin RLS nueva: cable_types ya tiene sus cuatro políticas
-- (migrations/2026-07-15-cable-types.sql). Se puede correr de nuevo.

alter table cable_types add column if not exists catalog_item_id uuid null references catalog_items(id) on delete set null;

comment on column cable_types.catalog_item_id is 'Producto del catálogo con el que se compran las cajas de este tipo de cable; null = solo pies y cajas, sin código ni precio.';
