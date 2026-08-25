// Rolls every product line on a document — parents and their bundled accessories
// alike — into one row per material: how many the whole job needs and what they
// add up to. This is the pivot side of a takeoff worksheet, and it deliberately
// differs from the purchase list (app/purchaseListCsv.js), which groups by
// supplier *and* price so the same material bought at two prices lands on two
// rows. Here a material is one row no matter where it sits or what it cost, and
// the per-area quantities hang off it as columns.
export function buildMaterialSummary(items, generalAreaLabel) {
  const products = (items ?? []).filter(i => i.type === 'product' && (i.description || '').trim());
  const areas = [];
  const groups = new Map();

  for (const it of products) {
    const description = it.description.trim();
    const key = description.toLowerCase();
    const area = (it.area || '').trim() || generalAreaLabel;
    if (!areas.includes(area)) areas.push(area);

    const quantity = Number(it.quantity) || 0;
    const unitPrice = Number(it.unit_price) || 0;
    // An accessory whose price is folded into its parent's brings its quantity
    // here — the warehouse pulls it either way — but no money, and it is not
    // "unpriced": it is paid for somewhere else. See normalizeForSummary().
    const priceElsewhere = !!it.price_included_elsewhere;

    let row = groups.get(key);
    if (!row) {
      row = { description, quantity: 0, lineTotal: 0, byArea: {}, prices: new Set(), vendor: (it.vendor || '').trim() };
      groups.set(key, row);
    }
    row.quantity += quantity;
    row.byArea[area] = (row.byArea[area] || 0) + quantity;
    if (!priceElsewhere) {
      row.lineTotal += quantity * unitPrice;
      row.prices.add(unitPrice);
    }
    if (!row.vendor && it.vendor) row.vendor = it.vendor.trim();
  }

  const rows = [...groups.values()]
    .map(({ prices, ...row }) => ({
      ...row,
      // One price everywhere prints as that price. A material that was quoted at
      // two different prices has no single unit price to show, so its row leaves
      // that column blank and lets Total carry the real money.
      unitPrice: prices.size === 1 ? [...prices][0] : null,
      // Every occurrence of this material is paid for through a parent line,
      // so there is no price of its own to report.
      priceElsewhere: prices.size === 0,
      // Flags a material that is going out free somewhere — the quiet way a
      // takeoff under-quotes. `some`, not `every`: priced in one area and
      // forgotten in another is exactly the case worth catching.
      unpriced: [...prices].some(p => p === 0),
    }))
    .sort((a, b) => a.description.localeCompare(b.description));

  return {
    rows,
    areas,
    totalQuantity: rows.reduce((s, r) => s + r.quantity, 0),
    grandTotal: rows.reduce((s, r) => s + r.lineTotal, 0),
    unpricedCount: rows.filter(r => r.unpriced).length,
  };
}

// job_line_items and proposal_line_items both fold a bundled accessory's price
// into its parent's, and proposals name the type column `item_type`. This maps
// either one onto what buildMaterialSummary expects. Estimates skip it: there
// an accessory is billed on its own line, so its price is its own.
export function normalizeForSummary(items, { typeField = 'type', dropCalculatorGroups = false } = {}) {
  const list = items ?? [];
  const byId = new Map(list.map(i => [i.id, i]));
  return list
    // A calculator group header is the sum of its materials, not a material.
    // Dropping it leaves its children carrying the real money, which is why
    // they are not treated as priced-elsewhere below.
    .filter(it => !(dropCalculatorGroups && it.from_calculator && !it.parent_item_id))
    .map(it => {
      const parent = it.parent_item_id ? byId.get(it.parent_item_id) : null;
      return {
        ...it,
        type: it[typeField],
        price_included_elsewhere: !!parent && parent.combine_price !== false && !parent.from_calculator,
      };
    });
}

export function exportMaterialSummaryCSV(items, docNumber, t, generalAreaLabel) {
  const { rows, areas, totalQuantity, grandTotal } = buildMaterialSummary(items, generalAreaLabel);
  if (rows.length === 0) { alert(t('noProductsAlert')); return; }

  // Area columns only earn their width when there is more than one area to
  // compare; a single-area document just gets Material / Cantidad / Precio.
  const multiArea = areas.length > 1;
  const csvRows = [
    [t('columnMaterial'), ...(multiArea ? areas : []), t('columnQuantity'), t('columnUnitPrice'), t('columnTotal')],
    ...rows.map(r => [
      r.description,
      ...(multiArea ? areas.map(a => r.byArea[a] ?? '') : []),
      r.quantity,
      r.unitPrice == null ? t('mixedPrice') : r.unitPrice.toFixed(2),
      r.lineTotal.toFixed(2),
    ]),
    [t('grandTotalLabel'), ...(multiArea ? areas.map(() => '') : []), totalQuantity, '', grandTotal.toFixed(2)],
  ];

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
