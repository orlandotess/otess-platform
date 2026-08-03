-- Seed de los 11 fees de Portal.io. Correr DESPUÉS de
-- 2026-08-02-fees-tax-category.sql (necesita la columna tax_category y el
-- valor 'fee' en el check constraint de catalog_items.type).
--
-- Los precios de Portal.io son Dealer Price (costo) — van en `costo`, no en
-- `precio`. `price` se deja en 0 a propósito: el precio de venta se define
-- con margen desde /catalogo, no se importa aquí (spec, sección 5).
--
-- Dos huecos marcados "verificar con Aeronet" en el spec, cargados tal cual
-- por decisión explícita: Aeronet Equipment Install sin costo (null en vez
-- de inventar un número), y Fiber 500/500 + Fiber 250/250 ambos a $999.00
-- (posible error de Portal.io, no se asume cuál).
--
-- Safe to re-run: cada insert se guarda contra item_code, no duplica si ya existe.

insert into catalog_items (type, item_code, name, description, price, costo, tax_category, recurrencia, termino_meses, internal_only)
select v.type, v.item_code, v.name, v.description, v.price, v.costo, v.tax_category, v.recurrencia, v.termino_meses, false
from (values
  ('fee', 'FEE-001', 'Aeronet Equipment Install',              'Aeronet Equipment Install',              0::numeric, null::numeric, 'labor',     'unica',   null::int),
  ('fee', 'FEE-002', 'Enterprise DNA Fiber 500/500',           'Enterprise DNA Fiber 500/500',           0::numeric, 999.00::numeric, 'labor',   'mensual', 36),
  ('fee', 'FEE-003', 'DNA Fiber 250/250',                      'DNA Fiber 250/250',                      0::numeric, 999.00::numeric, 'labor',   'mensual', 36),
  ('fee', 'FEE-004', 'Product Procurement — Shipping & Freight','Product Procurement — Shipping & Freight',0::numeric, 40.80::numeric,  'product', 'unica',   null::int),
  ('fee', 'FEE-005', 'Servicio Mensual Gestión Infraestructura','Servicio Mensual Gestión Infraestructura',0::numeric, 500.00::numeric, 'labor',   'mensual', null::int),
  ('fee', 'FEE-006', 'Licencia 3CX Annual',                    'Licencia 3CX Annual',                    0::numeric, 425.00::numeric, 'product', 'anual',   null::int),
  ('fee', 'FEE-007', 'Soporte Técnico Mensual',                'Soporte Técnico Mensual',                0::numeric, 1500.00::numeric,'labor',   'mensual', null::int),
  ('fee', 'FEE-008', 'Annual Hosting 3CX',                     'Annual Hosting 3CX',                     0::numeric, 295.00::numeric, 'labor',   'anual',   null::int),
  ('fee', 'FEE-009', 'Setup Fee 3CX',                          'Setup Fee 3CX',                          0::numeric, 2500.00::numeric,'labor',   'unica',   null::int),
  ('fee', 'FEE-010', 'Trámite de permisos y cumplimiento',     'Trámite de permisos y cumplimiento',     0::numeric, 500.00::numeric, 'labor',   'unica',   null::int),
  ('fee', 'FEE-011', 'Reembolso permisos OGPe/municipio',      'Reembolso permisos OGPe/municipio, pass-through a costo exacto con recibo adjunto', 0::numeric, 0.00::numeric, 'reembolso', 'unica', null::int),
  ('fee', 'FEE-012', 'Travel — On-Site Service',                'Travel — On-Site Service',               0::numeric, 100.00::numeric, 'labor',   'unica',   null::int)
) as v(type, item_code, name, description, price, costo, tax_category, recurrencia, termino_meses)
where not exists (select 1 from catalog_items ci where ci.item_code = v.item_code);
