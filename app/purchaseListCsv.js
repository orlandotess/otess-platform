// Aggregates product line items by supplier for a purchasing list, downloaded as CSV.
export function exportPurchaseListCSV(items, docNumber, t) {
  const products = (items ?? []).filter(i => i.type === 'product');
  if (products.length === 0) { alert(t('noProductsAlert')); return; }

  const groups = new Map();
  for (const it of products) {
    const vendor = (it.vendor || t('unassignedVendor')).trim();
    const description = (it.description || '').trim();
    const price = Number(it.unit_price) || 0;
    const key = `${vendor.toLowerCase()}|||${description.toLowerCase()}|||${price}`;
    const existing = groups.get(key);
    if (existing) existing.quantity += Number(it.quantity) || 0;
    else groups.set(key, { vendor, description, price, quantity: Number(it.quantity) || 0 });
  }

  const rows = [...groups.values()].sort((a, b) => a.vendor.localeCompare(b.vendor) || a.description.localeCompare(b.description));

  const csvRows = [[t('columnVendor'), t('columnDescription'), t('columnQuantity'), t('columnUnitPrice'), t('columnTotal')]];
  let currentVendor = null;
  let vendorSubtotal = 0;
  let grandTotal = 0;

  const flushVendorSubtotal = () => {
    if (currentVendor !== null) {
      csvRows.push(['', '', '', t('vendorSubtotalLabel', { vendor: currentVendor }), vendorSubtotal.toFixed(2)]);
    }
  };

  for (const row of rows) {
    if (row.vendor !== currentVendor) {
      flushVendorSubtotal();
      currentVendor = row.vendor;
      vendorSubtotal = 0;
    }
    const lineTotal = row.quantity * row.price;
    vendorSubtotal += lineTotal;
    grandTotal += lineTotal;
    csvRows.push([row.vendor, row.description, row.quantity, row.price.toFixed(2), lineTotal.toFixed(2)]);
  }
  flushVendorSubtotal();
  csvRows.push(['', '', '', t('grandTotalLabel'), grandTotal.toFixed(2)]);

  // Descriptions here carry inch marks (Tubo pvc 1"), and an embedded quote has
  // to be doubled inside a quoted CSV field (RFC 4180) or the field ends early.
  const csvContent = csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${docNumber}_${t('filenameSuffix')}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
