# Módulo Compras (Orders) — plan y decisiones

Nace del ítem "Order Parts" que quedó diferido en `auditoria-propuestas-otesspr.md` (dependía de un módulo Orders que no existía). Confirmado con el usuario 2026-07-15, sin spec previo de Portal.io — decisiones tomadas directamente con el cliente.

## Decisiones

1. **Propósito:** tracking de órdenes de compra reales a proveedores — qué se pidió, a quién, si ya llegó. Extiende la Lista de Compra CSV que ya existía (`app/purchaseListCsv.js`, usada en Estimados/Trabajos).
2. **Modelo de proveedor:** tabla real `vendors` (nombre, contacto, email, teléfono), no solo texto libre. El campo `vendor` de texto libre en `proposal_line_items`/`job_line_items`/etc. sigue existiendo tal cual — Compras hace *match* por nombre (case-insensitive) contra `vendors` y **crea el proveedor automáticamente** si no existe, para no bloquear el flujo por falta de catálogo de proveedores pre-llenado.
3. **Origen de órdenes:** Propuestas aprobadas (opción elegida por el cliente) y Trabajos. Estimados y creación manual quedaron fuera de esta fase.
4. **Alcance:** módulo completo — nueva sección "Compras" en el sidebar (`/compras`), lista + detalle, con su propio CRUD de proveedores.

## Modelo de datos

- `vendors` — proveedores reales.
- `purchase_orders` — una orden por proveedor distinto encontrado en el documento de origen (una propuesta/trabajo con productos de 2 proveedores genera 2 órdenes, nunca una mezclada — mismo criterio de agrupación que `purchaseListCsv.js`). Guarda `source_type`/`source_id`/`source_label` para saber de dónde salió, sin necesitar join polimórfico.
- `purchase_order_items` — líneas de cada orden, con referencia opcional al ítem de origen (`source_line_item_id`, sin FK real porque el origen es polimórfico entre `proposal_line_items` y `job_line_items`).

Estados: `pendiente` → `ordenado` → `recibido` (+ `cancelado`). Sin QuickBooks ni integración de envío real al proveedor en esta fase — "ordenado"/"recibido" se marcan a mano, mismo patrón que Payment Requests en Propuestas.

## Permisos

RLS nivel OFFICE3 (admin/secretaria/vendedor) en las 3 tablas nuevas, igual que `proposals` y sus tablas hijas — expone costos (`unit_price` = `supplier_price` del ítem de origen), mismo nivel de sensibilidad que Profit Analysis. Técnico queda excluido por el default-deny de `middleware.js` (`/compras` no está en `TECNICO_ALLOWED`), sin necesidad de tocar el middleware.

## Generación (`lib/generatePurchaseOrders.js`)

Función compartida, llamada desde Propuestas (`detail-client.js`, solo si `approved_option_id` existe) y Trabajos (`JobTabs.js`). Recibe los ítems ya normalizados a una forma común (`{ description, quantity, unit_price, supplier_price, vendor, id, isProduct }`) — importante: `proposal_line_items` usa la columna `item_type` pero `job_line_items` usa `type`, así que la normalización pasa por el llamador, no por la función compartida.
