// Full line-item data dump for a proposal — every option, every item (parts
// and labor, parents and accessories), one row each. Distinct from
// purchaseListCsv.js, which is a vendor-grouped shopping list of products
// only; this is the raw "Proposal Data" export.
export function exportProposalDataCSV(options, proposalNumber) {
  const csvRows = [['Opcion', 'Area', 'Tipo', 'Descripcion', 'Cantidad', 'Precio Unitario', 'Descuento', 'Exento IVU', 'Total']];

  for (const opt of options ?? []) {
    const items = (opt.items ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    let optionTotal = 0;
    for (const it of items) {
      const isAccessory = !!it.parent_item_id;
      const quantity = Number(it.quantity) || 0;
      const unitPrice = Number(it.unit_price) || 0;
      const discount = Number(it.discount_amount) || 0;
      const lineTotal = isAccessory ? 0 : (quantity * unitPrice - discount);
      optionTotal += lineTotal;
      csvRows.push([
        opt.name,
        it.area || 'General',
        it.item_type === 'product' ? 'Producto' : 'Labor',
        `${isAccessory ? '  ↳ ' : ''}${it.description ?? ''}`,
        quantity,
        unitPrice.toFixed(2),
        discount.toFixed(2),
        it.exempt_reason ? 'Si' : 'No',
        lineTotal.toFixed(2),
      ]);
    }
    csvRows.push(['', '', '', '', '', '', '', `Total ${opt.name}`, optionTotal.toFixed(2)]);
  }

  const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${proposalNumber}_Datos.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
