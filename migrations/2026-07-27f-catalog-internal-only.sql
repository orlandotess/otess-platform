-- Flag para marcar un ítem del catálogo (labor o producto) como "interno":
-- sigue existiendo normal en Catálogo, Inventario y las cajas de cable
-- (location_stock_reels), pero desaparece del picker de línea en los 4
-- documentos de cara al cliente (Factura, Estima, Propuesta, Orden de
-- Cambio), para que material de tracking interno (ej. cable en cajas) no se
-- pueda seleccionar por accidente al facturarle a un cliente.
--
-- Deliberadamente NO se filtra el fetch completo de catalog_items en esos
-- formularios, solo la lista de opciones del picker (catalogOptions) — así
-- una factura/estima/propuesta/orden vieja que ya tenía un ítem ahora
-- marcado interno sigue resolviendo su ubicación/stock correctamente al
-- editarla o eliminarla (adjust_catalog_stock sigue necesitando encontrar
-- el catalog_item completo, no solo lo que aparece en el dropdown).
--
-- Safe to re-run: add column if not exists.

alter table catalog_items add column if not exists internal_only boolean not null default false;
