# Orden de build priorizado — Módulo Propuestas

Reemplaza la lista "Siguiente paso tras la auditoría" del documento original (`auditoria-propuestas-otesspr.md`), basado en los hallazgos reales de la auditoría de código.

> **Actualización 2026-07-14:** en una sesión posterior a la auditoría original ya se construyó y verificó en vivo casi todo el orden de abajo (ver commits en `main` y memoria `propuestas_portal_io_parity_build`). Este documento ahora separa **lo ya hecho** de **lo que queda realmente pendiente**, para no reabrir trabajo terminado.

## ✅ Ya construido y verificado en vivo (no repetir)

1. ~~Menú global de 3 puntos~~ — construido en `detail-client.js` (Copiar link, Vista previa, Clonar, Archivar, Cambiar estado, Descargar en 5 formatos, CSV).
2. ~~Change Status (8 estados + rechazo)~~ — commit `f49ddf4`.
3. ~~Kebab de área + Area Total en vivo~~ — commit `0be6571`.
4. ~~Clone Proposal~~ — commit `069190f`.
5. ~~Archive (soft-delete, con migración `archived_at`)~~ — commit `ecd5ead`.
6. ~~CSV Proposal Data + PDF Factura~~ — commit `9938921`.
7. ~~PDF Instalador + Warehouse Pick List~~ — commit `cb1a665`.
8. ~~Drag-and-drop entre áreas~~ — commit `878555e`.
9. ~~Bulk toolbar (selección múltiple)~~ — commit `e3ff8d0`.
10. ~~Client View Settings — flujo de 3 pasos en la vista pública~~ — commit `5d2fcbd`.

## ✅ Recién construido y verificado en vivo (2026-07-14)

- ~~Conectar campo `vendor` en el kebab de ítem~~ — migración `alter table proposal_line_items add column if not exists vendor text` corrida por el usuario; cableado en `PropuestaForm.js` (emptyItem, itemsToAreas, vendorOptions, handleCatalogSelect, handleSave) y en `cloneProposal` (`detail-client.js`). Verificado en vivo: se guarda, se recarga al editar, ítem de prueba limpiado (PROP-1005 restaurada a su estado original). Solo aparece en ítems tipo "Producto", igual que en Trabajos/Estimados.

## Pendiente real

1. **Project Description (sección faltante, Sección A de la auditoría)**
   Esfuerzo: bajo. No hay campo dedicado a describir el alcance del proyecto — solo `intro_note` genérico y `option.description` por opción. Mismo patrón que `terms`/`intro_note`: un campo de texto más en `PropuestaForm.js`, columna nueva en `proposals` (o `proposal_options`), y su bloque en `ProposalDocument.js` y `public-client.js`.

2. **Profit Analysis (sección faltante, Sección A de la auditoría)**
   Esfuerzo: bajo-medio. El dato ya existe (`supplier_price` por ítem, usado en `app/accounting/rentabilidad/page.js`) — falta la **vista** dentro de Propuestas (margen = venta vs. costo, por opción y total). Sin migración. **Solo-lectura y solo en el documento admin — nunca debe exponerse en `public-client.js`**, es información interna de costo/margen.

3. **Payment Requests (sección faltante, Sección A de la auditoría)**
   Esfuerzo: alto. No confundir con Payment Schedule (calendario planificado, ya existe): es un flujo real de solicitud/registro de pago contra la propuesta — no hay tabla, API ni UI hoy. Requiere modelo de datos nuevo (`proposal_payment_requests` con estado propio) y decidir si notifica al cliente y si aparece en `public-client.js`. El más caro de los tres gaps de Sección A — depende de decisiones de producto (QuickBooks excluido de esta fase, tracking sería manual).

## Historial de cambios de prioridad (contexto, ya no aplica al día de hoy)

- Menú global subió al #1 original por ser el más barato y desbloquear dónde viven Change Status/Clone/Archive — cumplido.
- Kebab de ítem y de área se separaron: el de ítem (exento/descuento) ya existía: el de área se construyó nuevo — cumplido.
- Archive se independizó de Clone por ser mecánicamente más parecido a Change Status — cumplido.
- CSV se separó de "Download" por ser más barato sin motor de plantillas nuevo — cumplido.
- Drag-and-drop y Bulk toolbar se dejaron al final por ser 100% nuevos — cumplido, ambos construidos.
- Los 3 gaps de Sección A (Project Description, Profit Analysis, Payment Requests) se agregaron después de cerrar esa sección de la auditoría — son el único trabajo real que queda.
