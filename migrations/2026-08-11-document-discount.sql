-- Descuento a nivel de documento (no de línea) con nota editable, para
-- estimados, facturas y propuestas. Se aplica DESPUÉS del IVU sobre el
-- total ya calculado (ver lib/tax.js:aplicarDescuento) — discount_value es
-- el número que el usuario escribió (monto en $ o porcentaje según
-- discount_type), nunca el monto ya restado.
--
-- estimates.total / invoices.total se guardan CON el descuento ya aplicado
-- (total final a cobrar), para que /accounting y el balance de pagos no
-- necesiten cambios. Proposals no persiste totales (se calculan al vuelo),
-- así que solo necesita las 3 columnas de descuento.

alter table estimates add column if not exists discount_type text;
alter table estimates add column if not exists discount_value numeric;
alter table estimates add column if not exists discount_note text;

alter table invoices add column if not exists discount_type text;
alter table invoices add column if not exists discount_value numeric;
alter table invoices add column if not exists discount_note text;

alter table proposals add column if not exists discount_type text;
alter table proposals add column if not exists discount_value numeric;
alter table proposals add column if not exists discount_note text;
