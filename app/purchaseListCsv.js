// Aggregates product line items by supplier for a purchasing list, downloaded as CSV.
export function exportPurchaseListCSV(items, docNumber) {
  const products = (items ?? []).filter(i => i.type === 'product');
  if (products.length === 0) { alert('No hay líneas de producto para exportar.'); return; }

  const groups = new Map();
  for (const it of products) {
    const vendor = it.vendor || 'Sin asignar';
    const price = Number(it.unit_price) || 0;
    const key = `${vendor}|||${it.description}|||${price}`;
    const existing = groups.get(key);
    if (existing) existing.quantity += Number(it.quantity) || 0;
    else groups.set(key, { vendor, description: it.description, price, quantity: Number(it.quantity) || 0 });
  }

  const rows = [...groups.values()].sort((a, b) => a.vendor.localeCompare(b.vendor) || a.description.localeCompare(b.description));

  const csvRows = [['Suplidor', 'Descripcion', 'Cantidad', 'Precio Unitario', 'Total']];
  let currentVendor = null;
  let vendorSubtotal = 0;
  let grandTotal = 0;

  const flushVendorSubtotal = () => {
    if (currentVendor !== null) {
      csvRows.push(['', '', '', `Subtotal ${currentVendor}`, vendorSubtotal.toFixed(2)]);
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
  csvRows.push(['', '', '', 'TOTAL', grandTotal.toFixed(2)]);

  const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${docNumber}_Lista_Compra.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
