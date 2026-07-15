# Orden de build priorizado — Módulo Propuestas

**AUDITORÍA CERRADA (2026-07-15).** Los 3 gaps de Sección A (Project Description, Profit Analysis, Payment Requests) y todo el resto del orden de build de Portal.io-parity están construidos y verificados en vivo. Único ítem fuera de alcance: **Order Parts**, diferido porque depende del módulo Orders (ver `auditoria-orders-otesspr.md` para esa auditoría, iniciada por separado).

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
- ~~Project Description (sección faltante, Sección A de la auditoría)~~ — migración `alter table proposals add column if not exists project_description text` corrida por el usuario; campo agregado en `PropuestaForm.js` y cableado en `cloneProposal` (`detail-client.js`). **Decisión del usuario: nunca debe llegar al cliente** — no vive en `ProposalDocument.js` (que es lo que ven el link público y el PDF Cliente), sino como bloque solo-admin en `detail-client.js`, etiquetado "(interno, no visible al cliente)". Verificado en vivo: se guarda, persiste, aparece en el panel admin, no aparece en el documento/PDF ni en `public-client.js` (confirmado por grep — cero referencias), ítem de prueba limpiado (PROP-1005 restaurada a su estado original).
- ~~Profit Analysis (sección faltante, Sección A de la auditoría)~~ — sin migración, `supplier_price` ya existía. Nuevo helper `profitBreakdown()` en `ProposalDocument.js` (junto a `financialBreakdown`, mismo criterio de costo que `rentabilidad/page.js`: ítems sin `supplier_price` se excluyen del costo en vez de contarse como $0). Igual que Project Description, **nunca vive en `ProposalDocument.js`** — es una tarjeta solo-admin en `detail-client.js`, una por opción, etiquetada "(interno, no visible al cliente)". Verificado en vivo en PROP-1003: Venta $1,905 / Costo $60 / Ganancia $1,845 / Margen 96.9%, no aparece en el documento/PDF embebido debajo. No se tocó ningún dato de la propuesta (solo lectura), nada que limpiar.
- ~~Payment Requests (sección faltante, Sección A de la auditoría)~~ — migración nueva tabla `proposal_payment_requests` (RLS OFFICE3, reusa `auth_role()`) corrida por el usuario. Decisiones del usuario: (1) ligada a una línea del Payment Schedule existente, no libre/ad-hoc; (2) sí envía email real al cliente al solicitar (ruta nueva `/api/propuestas/solicitar-pago`, mismo patrón que `/api/propuestas/enviar`); (3) 100% interno — nunca visible en `public-client.js`, ni siquiera el estado. Tarjeta "Solicitudes de pago" en `detail-client.js` solo aparece cuando la propuesta ya tiene `approved_option_id` (una opción elegida por el cliente) y tiene Payment Schedule; por cada línea: "Solicitar pago" → "↻ Reenviar solicitud" + "Marcar pagado" (manual, QuickBooks excluido de esta fase) → badge "Pagado". Verificado en vivo de punta a punta con una propuesta de prueba (PROP-1008): creada → enviada → aprobada vía el link público real (flujo de 3 pasos) → solicitud de pago creada y email enviado sin error (`success:true`, sin warning) → marcada pagada → confirmado que no aparece en ningún punto del link público ni del documento embebido. Propuesta de prueba eliminada al terminar (cascade delete se llevó también su fila de `proposal_payment_requests`).

Los 3 gaps de Sección A (Project Description, Profit Analysis, Payment Requests) están completos. **No queda pendiente real de esta auditoría.**

## Historial de cambios de prioridad (contexto, ya no aplica al día de hoy)

- Menú global subió al #1 original por ser el más barato y desbloquear dónde viven Change Status/Clone/Archive — cumplido.
- Kebab de ítem y de área se separaron: el de ítem (exento/descuento) ya existía: el de área se construyó nuevo — cumplido.
- Archive se independizó de Clone por ser mecánicamente más parecido a Change Status — cumplido.
- CSV se separó de "Download" por ser más barato sin motor de plantillas nuevo — cumplido.
- Drag-and-drop y Bulk toolbar se dejaron al final por ser 100% nuevos — cumplido, ambos construidos.
- Los 3 gaps de Sección A (Project Description, Profit Analysis, Payment Requests) se agregaron después de cerrar esa sección de la auditoría — los tres ya se construyeron.
