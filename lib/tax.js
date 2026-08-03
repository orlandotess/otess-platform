// Motor de IVU — fuente única de verdad. Reemplaza el objeto `TAX` hardcodeado
// que hoy está duplicado en 11 formularios (trabajos, facturas, facturas
// recurrentes, estimados, órdenes de cambio, solicitudes) y generaliza
// financialBreakdown() de app/propuestas/ProposalDocument.js a 3 categorías.
//
// Principio: `type`/`item_type` (labor/product/fee) es dónde se muestra una
// línea. `tax_category` (labor/product/reembolso) es cómo se grava. Un fee
// puede tener cualquier tax_category — nunca se infiere de `type`.

const CATEGORY_LABELS = {
  labor: 'Labor / servicio',
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

function lineBase(linea) {
  const qty = Number(linea.quantity ?? 1);
  const price = Number(linea.unit_price ?? linea.price ?? 0);
  const discount = Number(linea.discount_amount ?? 0);
  return qty * price - discount;
}

function isExempt(linea) {
  return Boolean(linea.exempt_reason ?? linea.exempt);
}

function rateFor(taxRules, clientType, category) {
  const rule = (taxRules ?? []).find(
    r => r.client_type === clientType && r.line_item_type === category
  );
  return rule?.rate ?? FALLBACK_RATE;
}

// Tasa efectiva de una sola línea (respeta exempt_reason/exempt) — para
// cuando un formulario necesita persistir tax_rate/tax_amount por línea,
// además del agregado que da calcularIVU. Misma lógica de resolución,
// expuesta para no duplicarla en cada formulario.
export function tasaParaLinea(linea, clientType, taxRules) {
  const cat = normalizeCategory(linea.tax_category ?? linea.type ?? linea.item_type);
  return isExempt(linea) ? 0 : rateFor(taxRules, clientType, cat);
}

// calcularIVU(lineas, clientType, taxRules)
// clientType: 'b2b' | 'final'
// taxRules: filas crudas de la tabla tax_rules (client_type, line_item_type, rate)
//
// Devuelve { categorias: [{codigo, nombre, base, tasa, impuesto}], subtotal, ivu, total }
// Siempre las 3 categorías, en el mismo orden, aunque la base sea cero.
export function calcularIVU(lineas, clientType, taxRules) {
  const buckets = Object.fromEntries(CATEGORY_ORDER.map(c => [c, { base: 0, impuesto: 0 }]));

  (lineas ?? []).forEach(linea => {
    const cat = normalizeCategory(linea.tax_category ?? linea.type ?? linea.item_type);
    const base = lineBase(linea);
    const rate = isExempt(linea) ? 0 : rateFor(taxRules, clientType, cat);
    buckets[cat].base += base;
    buckets[cat].impuesto += base * rate;
  });

  // Redondeo una sola vez, al final — acumular sin redondear por categoría
  // evita descuadres de centavos entre el documento y /accounting.
  const categorias = CATEGORY_ORDER.map(codigo => {
    const { base, impuesto } = buckets[codigo];
    return {
      codigo,
      nombre: CATEGORY_LABELS[codigo],
      base: round2(base),
      tasa: rateFor(taxRules, clientType, codigo),
      impuesto: round2(impuesto),
    };
  });

  const subtotal = round2(categorias.reduce((s, c) => s + c.base, 0));
  const ivu = round2(categorias.reduce((s, c) => s + c.impuesto, 0));

  return { categorias, subtotal, ivu, total: round2(subtotal + ivu) };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
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
