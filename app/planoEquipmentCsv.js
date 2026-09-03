import { getEquipmentType } from './equipmentIcons';

// Counts placed floor-plan markers by Add Element category / element,
// summing each marker's `quantity` (a marker can represent more than one
// physical unit), and cable runs with footage (if the plan has a scale
// defined), then downloads a CSV. Accessories attached to those markers
// (a faceplate insert on a jack, see migrations/2026-09-02-marker-accessories.sql)
// are totalled in their own block instead of counting as equipment; their
// quantity is per unit of the marker, so it multiplies by the marker's own.
export function exportEquipmentListCSV(markers, elementTypes, customIcons, cables, feetPerPixel, cableLengthFeet, planName, t, tEquipmentTypes, accessories = [], catalogProducts = []) {
  if (!markers?.length) { alert(t('noEquipmentAlert')); return; }

  const productById = id => (id ? catalogProducts.find(p => p.id === id) : null);
  const productName = product => product.name || product.item_code || '';

  // system_name -> (element name -> { total, byProduct: Map(catalogItemId|null -> qty) })
  const byCategory = new Map();
  // markers placed before the Add Element catalog existed (no element_id yet)
  const legacy = new Map();

  for (const m of markers) {
    if (m.custom_icon_id) continue; // counted separately below
    const qty = m.quantity ?? 1;
    if (m.element_id) {
      const el = elementTypes.find(et => et.id === m.element_id);
      if (!el) continue;
      if (!byCategory.has(el.system_name)) byCategory.set(el.system_name, new Map());
      const cat = byCategory.get(el.system_name);
      if (!cat.has(el.name)) cat.set(el.name, { total: 0, byProduct: new Map() });
      const entry = cat.get(el.name);
      entry.total += qty;
      const productKey = m.catalog_item_id || null;
      entry.byProduct.set(productKey, (entry.byProduct.get(productKey) || 0) + qty);
    } else if (m.equipment_type) {
      const eqType = getEquipmentType(m.equipment_type);
      if (!eqType) continue;
      const label = tEquipmentTypes(eqType.key);
      legacy.set(label, (legacy.get(label) || 0) + qty);
    }
  }

  // Rows are [label, item code, quantity]: the code column is what makes the
  // export usable as a purchase list.
  const rows = [];
  for (const [systemName, elements] of byCategory) {
    rows.push([systemName, '', '']);
    for (const [name, entry] of elements) {
      rows.push([`  ${name}`, '', entry.total]);
      // Only break an element down when at least one of its markers names a
      // product — otherwise the extra line would just repeat the element.
      if (![...entry.byProduct.keys()].some(Boolean)) continue;
      for (const [productId, qty] of entry.byProduct) {
        const product = productById(productId);
        rows.push(product ? [`    ${productName(product)}`, product.item_code, qty] : [`    ${t('noProduct')}`, '', qty]);
      }
    }
  }
  if (legacy.size > 0) {
    rows.push([t('uncategorized'), '', '']);
    for (const [label, qty] of legacy) rows.push([`  ${label}`, '', qty]);
  }
  for (const ic of customIcons) {
    const count = markers.filter(m => m.custom_icon_id === ic.id).length;
    if (count > 0) rows.push([ic.name, '', count]);
  }

  const total = markers.reduce((sum, m) => sum + (m.quantity ?? 1), 0);
  const csvRows = [[t('columnType'), t('columnCode'), t('columnQuantity')], ...rows, ['', '', ''], [t('totalEquipment'), '', total]];

  const accessoryTally = new Map();
  for (const m of markers) {
    const markerQty = m.quantity ?? 1;
    for (const a of accessories.filter(ac => ac.marker_id === m.id)) {
      const key = a.catalog_item_id || a.name.toLowerCase();
      if (!accessoryTally.has(key)) {
        accessoryTally.set(key, { label: a.name, code: productById(a.catalog_item_id)?.item_code || '', qty: 0 });
      }
      accessoryTally.get(key).qty += (a.quantity ?? 1) * markerQty;
    }
  }
  if (accessoryTally.size > 0) {
    csvRows.push(['', '', '']);
    csvRows.push([t('accessories'), '', '']);
    for (const { label, code, qty } of accessoryTally.values()) csvRows.push([`  ${label}`, code, qty]);
  }

  if (cables?.length) {
    csvRows.push(['', '', '']);
    csvRows.push([t('cabling'), '', feetPerPixel ? t('feet') : t('noScaleDefined')]);
    let totalFeet = 0;
    cables.forEach((c, i) => {
      const feet = feetPerPixel ? cableLengthFeet(c) : null;
      if (feet != null) totalFeet += feet;
      csvRows.push([c.label || t('cableDefaultLabel', { number: i + 1 }), '', feet != null ? feet.toFixed(1) : '—']);
    });
    if (feetPerPixel) csvRows.push([t('totalFootage'), '', totalFeet.toFixed(1)]);
  }

  const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${planName}_${t('filenameSuffix')}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
