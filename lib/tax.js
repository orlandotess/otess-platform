// Motor de IVU — fuente única de verdad. Reemplaza el objeto `TAX` hardcodeado
// que hoy está duplicado en 11 formularios (trabajos, facturas, facturas
// recurrentes, estimados, órdenes de cambio, solicitudes) y generaliza
// financialBreakdown() de app/propuestas/ProposalDocument.js a 3 categorías.
//
// Principio: `type`/`item_type` (labor/product/fee) es dónde se muestra una
// línea. `tax_category` (labor/product/reembolso) es cómo se grava. Un fee
// puede tener cualquier tax_category — nunca se infiere de `type`.
//
// Segundo principio, desde 2026-09-21: una línea guarda su tasa en `tax_rate`
// al crearse y desde entonces ESA es su tasa. Cambiar la tasa vigente no puede
// reescribir lo que ya se cotizó o se facturó, ni siquiera al reeditar el
// documento. Ver migrations/2026-09-21b-congelar-ivu-lineas.sql (el congelado)
// y 2026-09-21-tax-rules-history.sql (las vigencias de tax_rules).

const CATEGORY_LABELS = {
  labor: 'Labor',
  product: 'Producto',
  reembolso: 'Reembolso a costo',
};

const CATEGORY_ORDER = ['labor', 'product', 'reembolso'];

// Tasa de respaldo si una línea no tiene tax_category reconocible, o si
// tax_rules no tiene fila para esa combinación — mismo valor por defecto
// que ya usaban los TAX maps hardcodeados (`?? 0.115`) en todos los módulos.
const FALLBACK_RATE = 0.115;

function normalizeCategory(cat) {
  return CATEGORY_ORDER.includes(cat) ? cat : 'product';
}

export function categoriaDeLinea(linea) {
  return normalizeCategory(linea.tax_category ?? linea.type ?? linea.item_type);
}

function lineBase(linea) {
  const qty = Number(linea.quantity ?? 1);
  const price = Number(linea.unit_price ?? linea.price ?? 0);
  const discount = Number(linea.discount_amount ?? 0);
  return qty * price - discount;
}

function isExempt(linea) {
  return Boolean(linea.exempt_reason ?? linea.exempt);
}

// Las vigencias de tax_rules son `date`, o sea 'YYYY-MM-DD' en crudo, así que
// la comparación es de texto y ambos lados tienen que estar en ese formato.
// Un Date se lee en hora local a propósito: a las 8pm en PR, toISOString() ya
// daría el día siguiente y una tasa que entra mañana aplicaría esta noche.
// Sin fecha se resuelve al dia de hoy, nunca "la ultima vigencia": una tasa
// registrada por adelantado no debe aplicar antes de su fecha solo porque la
// pantalla que la consulta no sepa de que dia es el documento.
//
// Siempre en hora de Puerto Rico, no en la del servidor: Vercel corre en UTC,
// y un documento creado a las 9pm del 31 de diciembre caeria en enero — con la
// tasa del ano siguiente. Mismo formateador en-CA/America/Puerto_Rico que ya
// usan los crons (app/api/*/run/route.js) para sacar "hoy".
const diaPR = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Puerto_Rico', year: 'numeric', month: '2-digit', day: '2-digit',
});

function diaClave(fecha) {
  // Una fecha pelada ('2026-12-31') ya viene sin hora y se usa tal cual: es el
  // dia que el usuario escogio, no un instante que haya que reinterpretar.
  if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  const d = !fecha ? new Date() : fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return diaPR.format(new Date());
  return diaPR.format(d);
}

// La fila de tax_rules vigente en `dia`: la de mayor effective_from que no sea
// posterior. Una fila sin effective_from (porque el select no la pidió) se
// trata como vigente desde siempre, para que una pantalla que todavía no traiga
// la columna siga dando la tasa de hoy en vez de quedarse sin regla.
function tasaDeReglas(taxRules, clientType, category, dia) {
  let vigente = null;
  for (const r of taxRules ?? []) {
    if (r.client_type !== clientType || r.line_item_type !== category) continue;
    const desde = r.effective_from ? String(r.effective_from).slice(0, 10) : '';
    if (desde > dia) continue;
    if (!vigente || desde > vigente.desde) vigente = { desde, rate: r.rate };
  }
  return vigente ? vigente.rate : null;
}

// Resolvedor de tasa de UN documento. Orden, de mayor a menor prioridad:
//
//   1. la tasa congelada en la línea (`tax_rate`) — un documento ya creado no
//      cambia de tasa nunca, ni al reeditarlo. Se ignora si la línea cambió de
//      categoría después de congelarse (ver `tax_rate_cat` abajo).
//   2. la tasa que ya usan las otras líneas de su misma categoría en ESTE
//      documento — una línea agregada a una factura vieja se grava como el
//      resto de esa factura, no a la tasa de hoy. Criterio de facturación
//      confirmado: una factura no lleva dos tasas de labor conviviendo.
//   3. la tasa de tax_rules vigente en la fecha del documento.
//   4. FALLBACK_RATE.
//
// `exento` se aplica siempre al final y nunca se congela: es un atributo de la
// línea que se puede cambiar después, no parte de la tasa.
//
// `tax_rate_cat` solo existe en el estado de los formularios: es la categoría
// que tenía la línea cuando se congeló su tasa. Si el usuario le cambia la
// categoría a una línea vieja (labor → product, que para un B2B va de 4% a
// 11.5%), la tasa congelada deja de corresponderle y se vuelve a resolver.
export function crearResolvedorDeTasa({ lineas, clientType, taxRules, fecha } = {}) {
  const dia = diaClave(fecha);

  const congelada = linea => {
    if (linea.tax_rate == null || linea.tax_rate === '') return null;
    if (linea.tax_rate_cat && linea.tax_rate_cat !== categoriaDeLinea(linea)) return null;
    const n = Number(linea.tax_rate);
    return Number.isFinite(n) ? n : null;
  };

  const heredadas = {};
  for (const linea of lineas ?? []) {
    const rate = congelada(linea);
    if (rate == null) continue;
    const cat = categoriaDeLinea(linea);
    if (heredadas[cat] == null) heredadas[cat] = rate;
  }

  return function tasa(linea) {
    if (isExempt(linea)) return 0;
    const propia = congelada(linea);
    if (propia != null) return propia;
    const cat = categoriaDeLinea(linea);
    if (heredadas[cat] != null) return heredadas[cat];
    return tasaDeReglas(taxRules, clientType, cat, dia) ?? FALLBACK_RATE;
  };
}

// Tasa efectiva de una sola línea — para cuando un formulario necesita
// persistir tax_rate/tax_amount por línea, además del agregado que da
// calcularIVU. Pasa el documento completo en `opts.lineas` para que una línea
// nueva herede la tasa del documento; sin eso resuelve contra tax_rules.
export function tasaParaLinea(linea, clientType, taxRules, opts) {
  return crearResolvedorDeTasa({
    lineas: opts?.lineas, clientType, taxRules, fecha: opts?.fecha,
  })(linea);
}

// calcularIVU(lineas, clientType, taxRules, opts)
// clientType: 'b2b' | 'final'
// taxRules: filas crudas de la tabla tax_rules (client_type, line_item_type,
//           rate, effective_from)
// opts.fecha: fecha del documento, para resolver la vigencia de una línea que
//           todavía no tiene tasa congelada. Sin ella se resuelve al día de hoy.
// opts.descuento: { type: 'amount'|'percent', value } — descuento de documento
//           que se resta ANTES del IVU (ver descuentoAntesDeIVU abajo). Sin él
//           (o en documentos viejos 'after_tax') las bases salen completas.
//
// Devuelve { categorias: [{codigo, nombre, base, tasa, impuesto}], subtotal,
//            subtotalBruto, descuento, ivu, total }
// `base`/`subtotal` ya vienen con el descuento restado; `subtotalBruto` es la
// suma de las líneas antes del descuento y `descuento` el monto restado.
// Siempre las 3 categorías, en el mismo orden, aunque la base sea cero.
export function calcularIVU(lineas, clientType, taxRules, opts) {
  const tasa = crearResolvedorDeTasa({ lineas, clientType, taxRules, fecha: opts?.fecha });
  const buckets = Object.fromEntries(CATEGORY_ORDER.map(c => [c, { base: 0, impuesto: 0 }]));

  const bruto = (lineas ?? []).reduce((s, l) => s + lineBase(l), 0);
  const descuento = montoDescuento(bruto, opts?.descuento);
  // El descuento se reparte proporcional a la base de cada línea: cada una
  // conserva su tasa (exentas, labor B2B al 4%, producto al 11.5%), y la
  // retención — que sale de subtotal_labor — queda sobre la labor neta.
  const factor = bruto > 0 ? (bruto - descuento) / bruto : 1;

  (lineas ?? []).forEach(linea => {
    const cat = categoriaDeLinea(linea);
    const base = lineBase(linea) * factor;
    buckets[cat].base += base;
    buckets[cat].impuesto += base * tasa(linea);
  });

  // Redondeo una sola vez, al final — acumular sin redondear por categoría
  // evita descuadres de centavos entre el documento y /accounting.
  const categorias = CATEGORY_ORDER.map(codigo => {
    const { base, impuesto } = buckets[codigo];
    return {
      codigo,
      nombre: CATEGORY_LABELS[codigo],
      base: round2(base),
      // La tasa que se muestra en el desglose es la que de verdad se está
      // aplicando en este documento, no la vigente hoy.
      tasa: tasa({ tax_category: codigo }),
      impuesto: round2(impuesto),
    };
  });

  // Con descuento, el reparte puede dejar las bases redondeadas un centavo
  // fuera de (bruto - descuento). El centavo va a la categoría más grande para
  // que "subtotal antes de descuento - descuento" cuadre exacto en el papel.
  const subtotalBruto = round2(bruto);
  if (descuento > 0) {
    const objetivo = round2(subtotalBruto - descuento);
    const diff = round2(objetivo - categorias.reduce((s, c) => s + c.base, 0));
    if (diff !== 0) {
      const mayor = categorias.reduce((a, c) => (c.base > a.base ? c : a), categorias[0]);
      mayor.base = round2(mayor.base + diff);
    }
  }

  const subtotal = round2(categorias.reduce((s, c) => s + c.base, 0));
  const ivu = round2(categorias.reduce((s, c) => s + c.impuesto, 0));

  return { categorias, subtotal, subtotalBruto, descuento, ivu, total: round2(subtotal + ivu) };
}

// Monto en $ de un descuento de documento sobre `base`: un % de la base o un
// monto fijo, nunca negativo ni mayor que la base (un descuento más grande que
// el documento lo deja en $0).
function montoDescuento(base, descuento) {
  const value = Number(descuento?.value ?? 0);
  const b = Number(base ?? 0);
  if (!value || value <= 0 || b <= 0) return 0;
  const monto = round2(descuento.type === 'percent' ? b * (value / 100) : value);
  return Math.min(monto, round2(b));
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Descuento a nivel de documento (no de línea), con nota editable. Desde
// 2026-11-08 se resta ANTES del IVU: un descuento dado al vender baja la base
// que se grava, así que el IVU, la retención (10% sobre subtotal_labor) y el
// informe de IVU salen del monto neto. Se pasa a calcularIVU como
// opts.descuento.
//
// Los documentos que ya tenían descuento antes de ese día quedaron marcados
// `discount_applies = 'after_tax'` (migrations/2026-11-08-descuento-antes-de-ivu.sql)
// y conservan el cálculo viejo — restado del total ya con IVU — para no
// cambiarle el monto a nada que ya se envió o se declaró. Todo lo demás
// (incluido null) es 'before_tax'.
export function modoDescuento(doc) {
  if (doc?.discount_applies === 'after_tax') return 'after_tax';
  // Factura/estimado con descuento guardado por el código viejo DESPUÉS de
  // correr la migración (pasó con INV-1067 el 2026-11-08): sin marca y sin
  // discount_amount, con subtotales completos y el descuento restado del total.
  // El código nuevo siempre escribe discount_applies cuando hay descuento, así
  // que esa combinación solo puede ser del cálculo viejo. Propuestas no tienen
  // discount_amount (ni la llave), y ahí null con descuento sí es 'before_tax'.
  if (doc && 'discount_amount' in doc && !doc.discount_applies
      && Number(doc.discount_value) > 0 && doc.discount_amount == null) {
    return 'after_tax';
  }
  return 'before_tax';
}

// Cálculo viejo ('after_tax'): resta el descuento del total ya con IVU.
// discountType: 'amount' | 'percent'.
export function aplicarDescuento(total, discountType, discountValue) {
  const rawTotal = round2(Number(total ?? 0));
  const discountAmount = montoDescuento(rawTotal, { type: discountType, value: discountValue });
  return { discountAmount, finalTotal: round2(rawTotal - discountAmount) };
}

// Totales de un documento a partir de sus líneas, con el descuento en el modo
// que le toca. Lo usan los formularios (factura/estimado) y TaxBreakdown para
// que el papel y lo que se guarda salgan del mismo cálculo.
//
// Devuelve el resultado de calcularIVU más { modo, descuento, total }, donde
// `descuento` es el monto en $ restado (antes o después del IVU según `modo`).
export function totalesDeDocumento(lineas, clientType, taxRules, { fecha, discountType, discountValue, discountApplies } = {}) {
  const modo = discountApplies === 'after_tax' ? 'after_tax' : 'before_tax';
  const desc = { type: discountType, value: discountValue };
  if (modo === 'before_tax') {
    return { ...calcularIVU(lineas, clientType, taxRules, { fecha, descuento: desc }), modo };
  }
  const r = calcularIVU(lineas, clientType, taxRules, { fecha });
  const { discountAmount, finalTotal } = aplicarDescuento(r.total, discountType, discountValue);
  return { ...r, modo, descuento: discountAmount, total: finalTotal };
}

// Lo que una vista de solo lectura (página, PDF, correo) necesita para pintar
// el descuento de un documento ya guardado (factura o estimado), sin volver a
// calcular el IVU: { modo, monto, subtotalBruto }.
//   before_tax: monto = discount_amount guardado; subtotalBruto = subtotales
//               netos guardados + ese monto.
//   after_tax:  monto = (subtotales + IVU) - total, como siempre se mostró.
export function descuentoGuardado(doc) {
  const sub = Number(doc?.subtotal_products ?? 0) + Number(doc?.subtotal_labor ?? 0);
  const tax = Number(doc?.tax_products ?? 0) + Number(doc?.tax_labor ?? 0);
  if (!(Number(doc?.discount_value) > 0)) return { modo: null, monto: 0, subtotalBruto: round2(sub) };
  const modo = modoDescuento(doc);
  if (modo === 'after_tax') {
    return { modo, monto: round2(sub + tax - Number(doc.total ?? 0)), subtotalBruto: round2(sub) };
  }
  const monto = round2(Number(doc.discount_amount ?? 0));
  return { modo, monto, subtotalBruto: round2(sub + monto) };
}

// Desglose Estatal 10.5% / Municipal 1%, usado solo en /accounting — nunca
// en estimados/facturas/propuestas. Solo la porción del IVU cobrada al
// 11.5% combinado tiene este desglose: Producto siempre, Labor solo cuando
// el cliente es "final" (B2B Labor se cobra al 4% plano, sin desglose).
// Mismo criterio que lib/ivu.js:computeInvoiceIVU (no se toca ese archivo —
// sigue siendo necesario para facturas legacy sin línea items).
export function desgloseEstatalMunicipal(categorias, clientType) {
  const productTax = categorias.find(c => c.codigo === 'product')?.impuesto ?? 0;
  const laborTax = categorias.find(c => c.codigo === 'labor')?.impuesto ?? 0;
  const finalBase = productTax + (clientType === 'b2b' ? 0 : laborTax);
  return {
    estatal: round2(finalBase * (10.5 / 11.5)),
    municipal: round2(finalBase * (1 / 11.5)),
  };
}
