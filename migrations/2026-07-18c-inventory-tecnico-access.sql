-- Da acceso de lectura al rol "tecnico" sobre locations/location_stock, para el
-- nuevo tab "Inventario" del Crew App (app/crew/page.js). Antes de esto solo
-- admin/secretaria/vendedor podían ver estas tablas (ver nota de alcance en
-- 2026-07-18b-inventory-locations.sql: "acceso de rol tecnico... no está en
-- middleware.js TECNICO_ALLOWED" — eso sigue así a propósito, el tab vive
-- dentro de /crew, que ya está permitido).
--
-- Solo se agrega SELECT. Los ajustes de stock desde el Crew App pasan por
-- adjust_catalog_stock/transfer_stock, ambas security definer, así que ya
-- bypasean RLS sin necesitar policy de escritura aparte — mismo patrón que
-- catalog_items (lectura ALL4, escritura OFFICE3, ver memoria de RLS).
--
-- Safe to re-run: drop + create.

drop policy if exists "locations_select_all4" on locations;
create policy "locations_select_all4"
  on locations for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));

drop policy if exists "location_stock_select_all4" on location_stock;
create policy "location_stock_select_all4"
  on location_stock for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
