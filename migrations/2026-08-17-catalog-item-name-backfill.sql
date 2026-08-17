-- Backfill de datos (no cambia el esquema).
--
-- Históricamente el catálogo se llenó poniendo el nombre legible del ítem en
-- `item_code` y dejando `name` vacío. Como las vistas caen en `name || description`,
-- el ítem se veía bien en el catálogo, pero al añadirlo a una factura/estima/propuesta
-- el título de la línea terminaba siendo una copia de la descripción — la misma
-- oración impresa dos veces (ver INV-1036, 2026-08-17).
--
-- El render ya tolera esas líneas (lib/lineItemTitle.js) y los selectores ya no
-- duplican al crear líneas nuevas. Esto solo arregla el dato de origen para que
-- las líneas nuevas salgan con título corto + descripción larga.
--
-- Afecta ~27 ítems: 19 de Labor y 9 de Productos, menos los excluidos abajo.
-- Es idempotente: correrlo dos veces no hace nada la segunda vez.

-- 1) Previsualizar exactamente qué filas se van a tocar antes de aplicar.
select type, item_code, description, price
  from catalog_items
 where (name is null or trim(name) = '')
   and item_code is not null
   and trim(item_code) <> ''
   -- Excluye los ítems cuyo código YA es igual a la descripción (p. ej. "Electric Job").
   -- Copiarles el código al nombre recrearía el duplicado que estamos eliminando;
   -- esos hay que corregirlos a mano decidiendo un código corto real.
   and trim(item_code) is distinct from trim(description)
 order by type, item_code;

-- 2) Aplicar.
update catalog_items
   set name = trim(item_code)
 where (name is null or trim(name) = '')
   and item_code is not null
   and trim(item_code) <> ''
   and trim(item_code) is distinct from trim(description);

-- Nota: los códigos quedan intactos a propósito. El importador CSV del catálogo
-- hace upsert emparejando por `item_code` (app/catalogo/CatalogoClient.js), así que
-- renombrarlos rompería el round-trip con cualquier CSV exportado antes.

-- Para revertir:
--   update catalog_items set name = null where name = item_code;
