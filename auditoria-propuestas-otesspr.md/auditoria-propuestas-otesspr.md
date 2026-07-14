# Auditoría — Módulo Propuestas (app.otesspr.com)

Objetivo: antes de construir, confirmar **qué ya existe** en otesspr y qué es realmente nuevo. Cada bloque indica qué revisar, el resultado esperado según el spec, y la **decisión** que desbloquea (extender vs. construir de cero). Marca el hallazgo real en cada casilla.

> Excluido de esta fase: QuickBooks (por instrucción del cliente) y Catálogo (lo llena el usuario).

---

## A. Estructura general del módulo

- [x] ¿Qué secciones tiene hoy la propuesta? (Portal.io: Cover Page, About Us, Project Description, Areas & Items, Financial Summary, Payment Schedule, Payment Requests, Profit Analysis, Project Terms)
  → **6 de 9 completas:**
  | # | Sección Portal.io | ¿Existe? | Ubicación |
  |---|---|---|---|
  | 1 | Cover Page | ✅ | [`ProposalDocument.js:122-153`](app/propuestas/ProposalDocument.js:122) + foto/nota en [`public-client.js:85-116`](app/propuesta/[token]/public-client.js:85) |
  | 2 | About Us | ✅ | [`ProposalDocument.js:155-159`](app/propuestas/ProposalDocument.js:155) (`companyInfo?.about_us` o `DEFAULT_ABOUT_US`) |
  | 3 | Project Description | ❌ | No existe — solo `intro_note` genérico y `option.description` por opción, sin sección dedicada |
  | 4 | Areas & Items | ✅ | [`ProposalDocument.js:163-228`](app/propuestas/ProposalDocument.js:163) + [`public-client.js:139-183`](app/propuesta/[token]/public-client.js:139) |
  | 5 | Financial Summary | ✅ | [`ProposalDocument.js:230-254`](app/propuestas/ProposalDocument.js:230) (solo en documento/PDF, no en tarjeta pública) |
  | 6 | Payment Schedule | ✅ | [`ProposalDocument.js:256-275`](app/propuestas/ProposalDocument.js:256), construido en [`PropuestaForm.js:767-782`](app/propuestas/PropuestaForm.js:767), tabla `proposal_payments` |
  | 7 | Payment Requests | ❌ | No existe — sin flujo de solicitud/registro de pago vinculado a la propuesta (no confundir con el calendario planificado de Payment Schedule) |
  | 8 | Profit Analysis | ❌ | No existe dentro del módulo — el dato (`supplier_price`) sí está disponible y se usa en `app/accounting/rentabilidad/page.js`, pero ese módulo no está vinculado a `proposals` |
  | 9 | Project Terms | ✅ | [`ProposalDocument.js:276-280`](app/propuestas/ProposalDocument.js:276), editable en [`PropuestaForm.js:787-788`](app/propuestas/PropuestaForm.js:787) |
- [x] ¿Cuáles faltan respecto a Portal.io?
  → **Project Description, Payment Requests, Profit Analysis.** De los tres, Project Description es el más barato de cerrar (un campo de texto libre más, mismo patrón que `intro_note`/`terms`). Payment Requests y Profit Analysis son features nuevas de mayor alcance (la segunda ya tiene el dato base — `supplier_price` — solo falta la sección/vista).

**Decisión:** el "gap" real frente a Portal.io son 3 secciones, no toda la estructura — las 6 restantes ya están construidas y solo entran en los puntos B-H de esta auditoría (kebabs, estados, exports, etc). Quedan fuera del orden de build priorizado actual y deben añadirse como ítems nuevos si el cliente las confirma como prioritarias.

---

## B. Kebab a nivel de ítem

- [x] ¿Dónde vive el componente del ítem y su menú kebab? (ruta del archivo)
  → **Existe.** [`app/LineItemRow.js:203-243`](app/LineItemRow.js:203) — botón `⋮` (`setMenuOpen`) con panel absoluto. Se invoca desde `PropuestaForm.js` (líneas 554 y 572, tanto para el ítem principal como para accesorios anidados vía `isAccessory`).
- [x] Opciones actuales confirmadas por spec: "Marcar exento de IVU", "Descuento ($)". ¿Hay otras?
  → **Coinciden exactamente con el spec**, más dos opcionales que solo aparecen si el padre pasa el handler correspondiente:
    - "☐ Marcar exento de IVU" / "☑ Exento de IVU" (línea 208-211, siempre presente)
    - "Descuento ($)" (línea 212-218, solo si se pasa `onDiscountChange`)
    - "Área" (línea 219-228, solo si se pasa `onAreaChange` — no usado hoy en Propuestas, sí en Trabajos)
    - "Suplidor" (línea 229-238, solo si se pasa `onVendorChange` — no usado hoy en Propuestas)
  → En Propuestas (`PropuestaForm.js:587-590`) solo se conectan `exempt`/`discount`; `area` y `vendor` no se pasan ahí, así que en el kebab de Propuestas hoy solo aparecen las dos opciones del spec.
- [x] ¿El kebab está bien posicionado y es reutilizable, o está acoplado al render del ítem?
  → **Totalmente reutilizable, ya no es específico de Propuestas.** `LineItemRow` es un componente compartido consumido por 8 formularios: `propuestas/PropuestaForm.js`, `trabajos/nuevo/page.js`, `trabajos/[id]/JobTabs.js`, `ordenes-cambio/ChangeOrderForm.js`, `facturas/nueva/NuevaFacturaForm.js`, `facturas/recurrentes/nueva/NuevaFacturaRecurrenteForm.js`, `facturas/recurrentes/[id]/RecurringInvoiceDetailClient.js`, `estimados/nueva/NuevaEstimaForm.js`. Cada opción del menú se muestra u oculta condicionalmente según qué `on*Change` prop reciba, por lo que añadir una opción nueva de Portal.io implica editar un solo archivo y no rompe a los demás consumidores.

**Decisión:** el kebab de ítem se **extiende** (ya existe, patrón sólido y compartido). Esfuerzo: **bajo** — añadir una opción nueva es un bloque más dentro del `menuOpen` panel de `LineItemRow.js`, sin tocar los 8 lugares que lo consumen. No se detectaron opciones de Portal.io pendientes más allá de exento/descuento en el spec actual — falta comparar contra la lista completa de opciones de ítem de Portal.io.js si existe una más extensa.

---

## C. Kebab a nivel de área + "Area Total"

- [x] ¿Existe un menú kebab por área? (Portal.io sí; en otesspr **no está confirmado**)
  → **No existe.** [`PropuestaForm.js:541-608`](app/propuestas/PropuestaForm.js:541) — cada área solo tiene un input de nombre y un botón "× Quitar área" (línea 548), sin ningún `⋮`.
- [x] ¿Se muestra un "Area Total" calculado al final de cada área?
  → **Parcial — existe pero solo en las vistas de solo-lectura, no en el editor.** `ProposalDocument.js:156` (`{area.name} Total: {fmt(areaTotal)}`) y `propuesta/[token]/public-client.js:156-158` ya calculan y muestran el total por área — se ve en el PDF, en el detalle admin (que embebe `ProposalDocument`) y en la vista pública del cliente. Pero en `PropuestaForm.js` (el formulario donde se **construye** la propuesta) no hay ningún total visible por área — solo el "Total venta" de la opción completa, al final de todas las áreas (línea 611).
- [x] ¿Existen botones "+ Add Item" / "+ Add Labor" por área?
  → **No, es un solo botón genérico.** `+ Línea` (línea 605) agrega un ítem vacío donde luego se elige el tipo (Labor/Producto) dentro del propio row — no hay dos botones separados como en Portal.io.

**Decisión:** el kebab de área **se construye nuevo** (reusando el patrón visual del kebab de ítem/global, ya validado en el punto B y D). El "Area Total" **no es nuevo cálculo** — la lógica ya existe en `ProposalDocument.js` y `public-client.js`, solo falta **replicarla en `PropuestaForm.js`** (esfuerzo bajo, es la misma fórmula `reduce` ya escrita dos veces). "+ Add Item" / "+ Add Labor" como botones separados: esfuerzo bajo, es solo dividir el `+ Línea` actual en dos botones que precargan el `item_type`.

---

## D. Menú global de 3 puntos de la propuesta

- [x] ¿Existe un menú kebab global a nivel de propuesta? (spec: **no confirmado con este nivel de opciones**)
  → **Existe.** [`detail-client.js:117-144`](app/propuestas/[id]/detail-client.js:117) — botón `⋮` con panel absoluto, mismo patrón visual que el kebab de ítem.
- [x] Si existe, ¿qué opciones tiene hoy?
  → 🔗 Copiar link del cliente · 👁 Vista previa · 🖨️ Descargar PDF (uno por cada opción de la propuesta). El envío/reenvío vive **fuera** del menú, como botón suelto junto al badge de estado.
- [x] Confirmar presencia/ausencia de cada una: Change Status, Clone Proposal, Order Parts, Download, Archive, Copy Client Link, Preview, Client View Settings.
  → **Presentes:** Copy Client Link ✓, Preview ✓, Download ✓ (parcial — PDF por opción, sin CSV, ver bloque H).
  → **Ausentes** (cero resultados en el módulo): Change Status (no hay acción explícita, solo enviar/reenviar; falta además la acción de rechazo — ver D.1), Clone Proposal, Archive, Client View Settings. Order Parts diferido aparte (depende de Orders).

**Decisión:** el menú global **se extiende** (ya existe el patrón, reutilizable — mismo estilo que el kebab de ítem). Faltan 4 acciones nuevas dentro del panel ya existente: Change Status, Clone Proposal, Archive, Client View Settings. Esfuerzo por acción: Archive y Change Status bajo-medio (solo un update de status/columna nueva); Clone Proposal medio (hay que copiar options + line items + payments); Client View Settings ver detalle abajo.

### D.2 Client View Settings — requisito confirmado: navegación por secciones bloqueadas
- [x] ¿Qué controla hoy la vista del cliente? ¿Existe algún tipo de flujo por pasos/secciones?
  → **No existe ningún gate.** [`propuesta/[token]/public-client.js`](app/propuesta/[token]/public-client.js) renderiza **todo en una sola página de scroll libre**: foto de portada → nota → tarjetas de opciones (con áreas/ítems ya expandidos) → documento PDF embebido → firma/aprobar (líneas 71-204). El cliente puede saltar directo al botón "Aprobar propuesta" sin haber recorrido nada — no hay estado de progreso, ni pasos, ni acordeón.
- [x] Requisito del cliente: que el cliente tenga que **terminar una sección por completo para poder avanzar a la siguiente**, similar a Portal.io.

**Decisión:** **funcionalidad nueva, no extensión.** Requiere reestructurar `public-client.js` de scroll único a un flujo por pasos con estado de progreso. **Esfuerzo: medio-alto.**

- [x] **Resuelto:** el gate es un botón **"Siguiente" explícito** (no scroll-detection).
- [x] **Resuelto:** el progreso **no persiste** — reinicia cada vez que se abre el link. Estado local (`useState`), sin BD ni migración.

**D queda cerrado.** Pasos definidos para `public-client.js`: (1) Portada + selección de opción, (2) Documento completo de la propuesta (About Us, Areas & Items, Financial Summary, Payment Schedule, Terms — lo que hoy ya se renderiza de un tirón), (3) Firma + Aprobar. Cada paso se desbloquea con "Siguiente" tras el anterior.

### D.1 Change Status (prioritario)
- [x] ¿Existe un campo de estado en la propuesta? ¿Qué valores admite hoy?
  → **Existe**, `proposals.status`, hoy 5 valores: `borrador`, `enviada`, `vista`, `aprobada`, `rechazada` ([`propuestas/page.js:8-9`](app/propuestas/page.js:8), duplicado en [`detail-client.js:9-10`](app/propuestas/[id]/detail-client.js:9)). `rechazada` está **muerto**: aparece en los mapas de label/badge y en guards (`status !== 'rechazada'`), pero ninguna ruta API ni botón lo asigna — solo existen `api/propuestas/enviar` y `api/propuestas/aprobar`. El mismo patrón de dead code se repite en Órdenes de Cambio (`ChangeOrderActions.js:53` define `updateStatus()` sin ningún botón que la invoque), así que es un fix compartido entre ambos módulos.
- [x] Portal.io usa 7 estados con color: Draft (gris), Expired (gris), Submitted (amarillo), Changes Required (amarillo), Accepted (verde), Declined (rojo), Completed (negro).
  → Faltan 3 valores frente al spec: **`expirada` real**, **`cambios_requeridos`**, **`completada`**. Hoy "expirado" es **calculado al vuelo** comparando `valid_until` contra `new Date()` (`propuesta/[token]/page.js:22`, `api/propuestas/aprobar/route.js:21`) — nunca se persiste en `status`, por eso el listado admin sigue mostrando "Enviada"/"Vista" en una propuesta ya vencida.
  → Colores: badges gris/azul/ámbar/verde/rojo ya existen en `globals.css:435-439`; falta variante **negra** para "Completada" (una línea de CSS).
- [x] ¿El modelo de datos ya soporta esos 7 valores o hay que migrar el enum/columna?
  → **No hay que migrar ningún enum.** `status` es texto libre validado solo en JS (arrays `['borrador','enviada','vista'].includes(status)` repetidos en `PropuestaForm.js:279`, `detail-client.js:104`, `editar/page.js:27`) — no se encontró ningún `CHECK`/tipo enum versionado en el repo para esta columna. Agregar los 3 valores nuevos es solo tocar esos arrays y los mapas de label/color; no requiere migración de esquema.

**Decisión:** el campo de estado **se extiende** (no se migra ningún enum). Trabajo real: (1) agregar 3 valores nuevos + persistir "expirada" en vez de calcularla, (2) implementar la acción de **rechazo** que hoy no existe para Propuestas (y arreglar el mismo hueco en Órdenes de Cambio de paso), (3) variante de badge negro. **Esfuerzo: medio.** Alto valor de negocio (visibilidad real de pipeline) — va dentro del menú kebab global del punto D, como acción "Change Status".

---

## E. Drag-and-drop entre áreas

- [x] ¿Se puede hoy mover un ítem de un área a otra? (spec: **no confirmado**)
  → **No existe.** Solo se puede editar el texto del campo "Área" de un ítem manualmente vía el kebab de `LineItemRow` (y ni eso está conectado en Propuestas — ver punto B). No hay arrastrar-soltar en ningún lado del builder.
- [x] ¿Ya hay alguna librería DnD en el proyecto? (dnd-kit, react-beautiful-dnd)
  → **No.** `grep` en `package.json` no encontró ninguna dependencia de drag-and-drop.
- [x] ¿Cómo se persiste el **orden** de los ítems dentro de un área? (¿campo `position`/`order`? ¿array ordenado?)
  → **Ya existe y ya funciona:** `proposal_line_items.sort_order`, reasignado secuencialmente en cada guardado según el orden del array local `opt.areas[].items[]` ([`PropuestaForm.js:358-402`](app/propuestas/PropuestaForm.js:358)). El **área en sí no tiene orden persistido propio** — el orden de las áreas al reabrir para editar se deriva implícitamente de qué área tiene los `sort_order` más bajos (`itemsToAreas()` reconstruye agrupando por el orden de aparición). Los accesorios (`parent_item_id`) siempre se guardan con la misma `area` que su ítem padre, porque físicamente viven en el mismo array `area.items` que él.

**Decisión:** se **construye nuevo** (no hay ninguna base existente), pero **sin migración de BD** — el modelo de `sort_order` ya soporta reordenar y trasladar entre áreas, es 100% trabajo de frontend (estado local + drag events). Esfuerzo real más bajo de lo que sugería la duda original sobre "trabajo de backend". Voy a implementar con HTML5 drag-and-drop nativo (sin librería nueva) moviendo el ítem padre + sus accesorios como un bloque contiguo, ya que los accesorios no tienen sentido separados de su padre.

---

## F. Selección múltiple / bulk toolbar

- [x] ¿Existe selección de varios ítems a la vez?
  → **No existe.** Cero checkboxes ni estado de selección en `PropuestaForm.js` ni en el listado (`propuestas/page.js`).
- [x] ¿Hay alguna toolbar de acciones en lote?
  → **No existe.**

**Decisión:** confirmado nuevo, sin nada que extender. Es pulido → última prioridad de la fase.

---

## G. Modelo de datos (clave para DnD, Order Parts y Combined Price)

> Nota: no se encontró `CREATE TABLE` versionado en el repo para estas tablas (la carpeta `migrations/` solo tiene `2026-07-13-add-address-to-tasks.sql`) — el esquema base se creó directo en Supabase. Análisis basado en las queries reales del código.

- [x] ¿Cómo se relacionan Propuesta → Área → Ítem en el esquema? (tablas/relaciones)
  → `proposals (1)→(N) proposal_options` [FK `proposal_id`] `→(N) proposal_line_items` [FK `option_id`] ([`propuestas/[id]/page.js:12`](app/propuestas/[id]/page.js:12)). `proposal_payments` cuelga aparte de `proposals` (Payment Schedule). **No existe tabla `proposal_areas`** — "área" es un campo de texto libre dentro de `proposal_line_items` ([`PropuestaForm.js:449,471`](app/propuestas/PropuestaForm.js:449); agrupado client-side vía `groupByArea` en [`ProposalDocument.js:12-26`](app/propuestas/ProposalDocument.js:12)).
- [x] ¿Existe campo de orden por ítem dentro del área?
  → **Confirmado**, `proposal_line_items.sort_order` ([`PropuestaForm.js:460,482`](app/propuestas/PropuestaForm.js:460)). `proposal_options.sort_order` también existe. **El área en sí no tiene orden propio** — su posición se deriva del primer ítem que aparece con esa área (sin columna `area_sort_order` ni tabla separada).
- [x] ¿Los ítems pueden tener accesorios/labor auto-vinculados como adjuntos? ("Combined Price" en Portal.io)
  → **Sí**, vía `proposal_line_items.parent_item_id` (self-FK, [`PropuestaForm.js:472`](app/propuestas/PropuestaForm.js:472)). Los hijos se insertan con `unit_price: 0`, `msrp: null`, `supplier_price: null` — sin precio propio, va incluido en el padre. En [`ProposalDocument.js:198`](app/propuestas/ProposalDocument.js:198) se muestra la etiqueta **"Combined Price"** cuando `it.children.length > 0`, y los hijos se listan debajo sin columna de precio (línea 211). El concepto de Portal.io **ya está implementado**, solo con ese nombre en inglés hardcodeado.
- [x] ¿Hay campo de proveedor/costo por ítem? (relevante para el futuro "Order Parts" → módulo Orders)
  → Existe **costo** (`supplier_price`, numeric nullable) y **MSRP** (`msrp`) además del `unit_price` de venta. **No existe columna `vendor`/proveedor como texto** — se registra el costo pero no *quién* es el proveedor (esto es lo que el punto 6 del orden de build ["conectar `vendor`"] resolvería, ya que el prop existe en `LineItemRow` pero no está cableado en Propuestas).

**Decisión:** el modelo soporta DnD sin migración (ya cubierto en punto E). "Order Parts" **sí requeriría** trabajo de esquema si se quiere registrar *quién* es el proveedor por ítem (hoy solo hay costo, no proveedor) — el punto 6 del orden de build es un primer paso pero conecta un campo de texto libre, no una relación real a una tabla de proveedores; si "Order Parts" necesita agrupar por proveedor real (no texto libre), eso sí sería un gap de modelo nuevo a evaluar cuando se aborde el módulo Orders. "Combined Price" ya está resuelto, no es trabajo pendiente.

---

## H. Exportación existente (PDF / CSV) — confirmado por el usuario probando el kebab en vivo

- [x] ¿Existe hoy generación de PDF o CSV de la propuesta? ¿Con qué librería/servicio?
  → **Existe, pero un solo formato.** Motor: `html2pdf.js` client-side vía [`lib/openPdfPreview.js`](lib/openPdfPreview.js) — renderiza a PDF el DOM de `#proposal-doc-${optId}`, que es siempre el mismo componente [`ProposalDocument.js`](app/propuestas/ProposalDocument.js) (el documento cliente). No hay parámetro de modo/variante ni ningún export a CSV.
- [x] Formatos objetivo (Portal.io): PDF Cliente, PDF Instalador, PDF Factura, PDF Warehouse Pick List, CSV Proposal Data.
  → **Solo existe "PDF Cliente"** (uno por cada opción de la propuesta, ya visible en el kebab bajo "Descargar PDF"). Faltan los 4 restantes: PDF Instalador, PDF Factura, PDF Warehouse Pick List, CSV Proposal Data — ninguno tiene ni plantilla ni lógica hoy.

**Decisión:** el motor (`html2pdf.js`) **se reutiliza** — no hay que introducir una librería nueva, solo nuevas plantillas/DOM que apunten al mismo `openPdfPreview()`. La CSV es aparte (no pasa por PDF, es descarga directa de datos tabulares — patrón ya usado en el punto de "Purchase list" de Estimates/Trabajos, reusable aquí). Esfuerzo por formato:
- **PDF Factura**: bajo — es básicamente el PDF cliente con estructura de factura, reutiliza casi todo `ProposalDocument.js`.
- **CSV Proposal Data**: bajo — mismo patrón que el CSV de purchase list ya existente en el codebase.
- **PDF Instalador**: medio — plantilla nueva sin precios, con datos operativos (ubicación/área, notas de instalación) que hoy no todos se muestran en el documento cliente.
- **PDF Warehouse Pick List**: medio-alto — es el que más lógica nueva requiere: agrupar/ordenar por proveedor o ubicación de bodega para picking, dato que hoy no existe estructurado para ese propósito.

---

## Cómo registrar hallazgos

Para cada casilla, anota: **existe / no existe / parcial**, la **ruta del archivo o componente**, y una nota de esfuerzo (bajo / medio / alto). Con eso cada punto del spec queda clasificado como **extender** o **construir**, y podemos priorizar la fase de Propuestas con estimaciones reales.

## Siguiente paso tras la auditoría
Con los resultados, ordenar el build por valor/independencia:
1. Change Status (7 estados + colores)
2. Kebab de ítem/área + Area Total
3. Clone Proposal / Archive
4. Download (PDF/CSV)
5. Drag-and-drop entre áreas
6. Bulk toolbar

*Diferido a fase aparte: Order Parts (depende del módulo Orders, sección 3).*
