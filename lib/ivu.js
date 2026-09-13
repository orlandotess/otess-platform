// Computes the IVU breakdown for a single invoice straight off its own
// stored fields (subtotal_labor, tax_labor, subtotal_products, tax_products)
// rather than invoice_line_items - line items aren't reliably populated for
// every invoice, which was silently under-reporting IVU for any invoice
// missing them even though the invoice itself has the real numbers.
export function computeInvoiceIVU(inv) {
  const laborSub = Number(inv.subtotal_labor ?? 0);
  const laborTax = Number(inv.tax_labor ?? 0);
  const laborRate = laborSub > 0 ? laborTax / laborSub : null;
  const isB2B = inv.clients?.client_type === 'b2b';
  const prodSub = Number(inv.subtotal_products ?? 0);
  const prodTax = Number(inv.tax_products ?? 0);
  // Estatal/Municipal only break out the 11.5% ("Final") base - the 4% B2B
  // labor rate is a single combined rate with no state/municipal split.
  const finalBase = prodTax + (isB2B ? 0 : laborTax);
  const estatal = finalBase * (10.5 / 11.5);
  const municipal = finalBase * (1 / 11.5);
  const totalIVU = laborTax + prodTax;
  const totalFactura = Number(inv.total ?? (laborSub + laborTax + prodSub + prodTax));
  return { laborSub, laborTax, laborRate, isB2B, prodSub, prodTax, estatal, municipal, totalIVU, totalFactura };
}

// Synthesizes Labor/Productos summary rows from the invoice's own aggregate
// columns for invoices whose invoice_line_items insert failed (see
// computeInvoiceIVU above) - so the itemized table on the invoice view,
// public link, and email never renders blank next to a real total.
export function fallbackLineItems(inv) {
  const items = [];
  const laborSub = Number(inv.subtotal_labor ?? 0);
  const prodSub = Number(inv.subtotal_products ?? 0);
  if (laborSub > 0) {
    const tax = Number(inv.tax_labor ?? 0);
    items.push({
      id: 'fallback-labor',
      description: 'Labor',
      type: 'labor',
      quantity: 1,
      unit_price: laborSub,
      msrp: null,
      supplier_price: null,
      tax_rate: tax / laborSub,
      line_total: laborSub,
      tax_amount: tax,
    });
  }
  if (prodSub > 0) {
    const tax = Number(inv.tax_products ?? 0);
    items.push({
      id: 'fallback-product',
      description: 'Productos',
      type: 'product',
      quantity: 1,
      unit_price: prodSub,
      msrp: null,
      supplier_price: null,
      tax_rate: tax / prodSub,
      line_total: prodSub,
      tax_amount: tax,
    });
  }
  return items;
}

// Splits each invoice's IVU across the dates its money actually came in, so a
// deposit reports its share in the month it was collected instead of the whole
// invoice landing in whatever month it was finally paid off. Returns
// [{ invoiceId, date, fraction }] - fraction is the slice of that invoice's IVU
// earned on that date.
//
// Retenciones are not collection events: their stored `fecha` is the invoice's
// issue date, not the day money moved, so treating them as one would sneak
// accrual back into a cash-basis report. Instead the share they cover rides
// along with the last payment, once the invoice is settled - otherwise that
// slice of IVU would never be reported at all.
//
// `prorateFrom` (YYYY-MM-DD) keeps already-filed periods untouched: anything
// earned before it is carried forward onto the first payment on or after it,
// rather than being restated into a month that's already been declared. An
// invoice with no payment on or after the cutoff keeps the old behaviour -
// all of its IVU on its final payment, and only once it's settled.
export function buildIVUCollectionEvents(invoices, paymentsByInvoice, retainedByInvoice = {}, { prorateFrom } = {}) {
  const events = [];
  for (const inv of invoices ?? []) {
    if (inv.status === 'cancelled') continue;
    const total = Number(inv.total ?? 0);
    if (total <= 0) continue;
    const pays = (paymentsByInvoice[inv.id] ?? [])
      .filter(p => p.paid_at)
      .sort((a, b) => (a.paid_at < b.paid_at ? -1 : 1));
    if (!pays.length) continue;

    const collected = pays.reduce((a, p) => a + Number(p.amount ?? 0), 0) + Number(retainedByInvoice[inv.id] ?? 0);
    const settled = collected >= total - 0.01;

    // Slice per payment, never letting the running total exceed the full IVU
    // (an overpaid invoice still only owes 100% of its tax).
    const slices = [];
    let assigned = 0;
    for (const p of pays) {
      const fraction = Math.min(Number(p.amount ?? 0) / total, 1 - assigned);
      if (fraction > 0) { slices.push({ date: p.paid_at, fraction }); assigned += fraction; }
    }
    // The remainder is what retención covered - only real once the invoice is
    // settled, so an open invoice keeps it pending instead of over-reporting.
    if (settled && assigned < 0.9999 && slices.length) {
      slices[slices.length - 1].fraction += 1 - assigned;
    }

    if (!prorateFrom) { slices.forEach(s => events.push({ invoiceId: inv.id, ...s })); continue; }

    const firstAfter = slices.find(s => s.date >= prorateFrom);
    if (!firstAfter) {
      // Nothing collected on or after the cutoff: fall back to the old rule so
      // closed periods keep reporting exactly what they reported before.
      if (settled) events.push({ invoiceId: inv.id, date: slices[slices.length - 1].date, fraction: slices.reduce((a, s) => a + s.fraction, 0) });
      continue;
    }
    const carried = slices.filter(s => s.date < prorateFrom).reduce((a, s) => a + s.fraction, 0);
    for (const s of slices) {
      if (s.date < prorateFrom) continue;
      events.push({ invoiceId: inv.id, date: s.date, fraction: s === firstAfter ? s.fraction + carried : s.fraction });
    }
  }
  return events;
}
