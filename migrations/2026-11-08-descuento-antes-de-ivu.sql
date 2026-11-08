-- El descuento de documento pasa a restarse ANTES del IVU (lib/tax.js:
-- calcularIVU con opts.descuento). Un descuento dado al vender baja la base
-- gravable, así que el IVU, la retención (10% sobre subtotal_labor) y el
-- informe de IVU tienen que salir del monto neto.
--
-- discount_applies: 'before_tax' (regla nueva) | 'after_tax' (cálculo viejo).
--   Los documentos que YA tienen descuento se marcan 'after_tax' para que
--   conserven exactamente el total que se envió/declaró, aun si se reeditan.
--   null se lee como 'before_tax' (ver lib/tax.js:modoDescuento).
--
-- discount_amount: el monto en $ restado de la base antes del IVU. Las vistas
--   lo necesitan para pintar "Subtotal antes de descuento" y "Descuento" sin
--   recalcular, porque subtotal_products/subtotal_labor ahora se guardan netos.
--   Proposals no persiste totales, así que solo necesita discount_applies.
--
-- Correr ANTES de desplegar el código: sin esta columna, los formularios
-- fallan al guardar y los documentos viejos con descuento se leerían como
-- 'before_tax'.

alter table estimates add column if not exists discount_applies text;
alter table estimates add column if not exists discount_amount numeric;
alter table invoices  add column if not exists discount_applies text;
alter table invoices  add column if not exists discount_amount numeric;
alter table proposals add column if not exists discount_applies text;

update estimates set discount_applies = 'after_tax' where discount_value > 0 and discount_applies is null;
update invoices  set discount_applies = 'after_tax' where discount_value > 0 and discount_applies is null;
update proposals set discount_applies = 'after_tax' where discount_value > 0 and discount_applies is null;
