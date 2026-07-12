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
