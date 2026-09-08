-- Propuestas y trabajos guardan cuál artículo del catálogo es cada línea.
--
-- Estimados ya lo guarda (estimate_line_items.catalog_item_id) y por eso la
-- lista de un plano entra ahí completa: código, suplidor, precio y el enlace de
-- vuelta al producto. En propuestas y trabajos la línea era solo texto — el
-- comentario en app/propuestas/PropuestaForm.js lo decía sin rodeos: "Propuestas
-- no trackea catalog_item_id en su línea, así que no hay nada que enlazar de
-- vuelta". Importar un plano ahí perdía justo lo que fuimos a buscar.
--
-- Una columna en cada tabla, igual que en estimados: null = línea escrita a
-- mano, que es lo que son todas las que existen hoy.
--
-- Ojo con lo que esto destraba del otro lado: las dos formas crean un producto
-- de catálogo cuando una línea tiene título y no tiene enlace. Con la columna
-- ya se puede saltar las que sí lo tienen, en vez de crear un duplicado con el
-- nombre del producto metido en item_code.
--
-- Sin RLS nueva: las dos tablas ya tienen sus políticas. Se puede correr de
-- nuevo.

alter table proposal_line_items add column if not exists catalog_item_id uuid null references catalog_items(id) on delete set null;
alter table job_line_items add column if not exists catalog_item_id uuid null references catalog_items(id) on delete set null;

comment on column proposal_line_items.catalog_item_id is 'Artículo del catálogo que es esta línea; null = escrita a mano.';
comment on column job_line_items.catalog_item_id is 'Artículo del catálogo que es esta línea; null = escrita a mano.';
