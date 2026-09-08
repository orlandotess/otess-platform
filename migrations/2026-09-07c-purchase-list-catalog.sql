-- El plano exporta artículos del catálogo, no nombres de elemento ("Planos").
--
-- La lista de items sale hoy con el nombre del elemento ("Network Jack") y solo
-- baja al producto cuando alguien se lo asignó marcador por marcador. Un plano
-- de 200 tomas donde nadie escogió producto exporta 200 líneas sin código: no
-- sirve para comprar. Y en el cuarto, el cable manager es la única línea que
-- ni siquiera tiene dónde escoger producto.
--
-- 1) element_types.default_catalog_item_id — el producto con el que se ordena
--    ese elemento cuando el marcador no trae uno propio. El marcador manda
--    siempre; esto es el que se usa si nadie dijo otra cosa, así que una sola
--    decisión le pone código a todos los planos que vengan. Se pone desde el
--    panel del marcador (⭐) — de ahí la política de update.
--
-- 2) element_types update — la tabla solo tenía SELECT (2026-07-16b), o sea que
--    ningún cliente podía escribirle. Se abre a OFFICE3 (admin, secretaria,
--    vendedor) y no a técnico: escoger con qué producto se ordena un elemento
--    es decisión de compras, no de quien dibuja el plano. El botón también
--    está escondido para técnico, la política es la que lo hace cumplir.
--
-- 3) floor_plan_markers.rack_cable_manager_item_id — el producto del cable
--    manager de ESE rack, igual que rack_patch_panel_item_id y
--    rack_switch_item_id (migrations/2026-09-07b-rack-products.sql). Sin él la
--    línea de managers nunca podía llevar código al CSV.
--
-- Se puede correr de nuevo sin problema.

alter table element_types add column if not exists default_catalog_item_id uuid null references catalog_items(id) on delete set null;

comment on column element_types.default_catalog_item_id is 'Producto del catálogo con el que se ordena este elemento cuando el marcador no trae uno propio. El marcador manda; esto es el fallback.';

drop policy if exists "element_types_update_office" on element_types;
create policy "element_types_update_office" on element_types for update
  using (auth_role() in ('admin', 'secretaria', 'vendedor'))
  with check (auth_role() in ('admin', 'secretaria', 'vendedor'));

alter table floor_plan_markers add column if not exists rack_cable_manager_item_id uuid null references catalog_items(id) on delete set null;

comment on column floor_plan_markers.rack_cable_manager_item_id is 'Producto del catálogo con el que se ordenan los cable managers de ESTE rack; null = sin producto, solo la cantidad.';
