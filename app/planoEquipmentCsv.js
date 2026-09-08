import { getEquipmentType } from './equipmentIcons';
import {
  buildPurchaseList, buildCableTotals, getMarkerElement, isRackMarker, markerProductId,
} from './planoItems';

// Counts placed floor-plan markers by Add Element category / element, summing
// each marker's `quantity` (a marker can represent more than one physical
// unit), and cable runs with footage (if the plan has a scale defined), then
// downloads a CSV. Accessories attached to those markers (a faceplate insert
// on a jack, see migrations/2026-09-02-marker-accessories.sql) are totalled in
// their own block instead of counting as equipment; their quantity is per unit
// of the marker, so it multiplies by the marker's own, and each one is broken
// down by the element it came from. Plan-level materials (a rack, ties —
// migrations/2026-09-06-plan-materials-and-idf.sql) and the derived telecom
// room get blocks of their own.
//
// Those blocks are the audit trail — where each thing came from. The one at
// the end is the order: buildPurchaseList (app/planoItems.js) adds an article
// up across all of them, and the same function feeds the plan's list into an
// estimate, so the CSV and the estimate can never disagree.
export function exportEquipmentListCSV(markers, elementTypes, customIcons, cables, feetPerPixel, cableLengthFeet, planName, t, tEquipmentTypes, accessories = [], catalogProducts = [], cableTypes = [], planMaterials = [], telecomRooms = []) {
  if (!markers?.length) { alert(t('noEquipmentAlert')); return; }

  const productById = id => (id ? catalogProducts.find(p => p.id === id) : null);
  const productName = product => product.name || product.item_code || '';
  const legacyLabel = key => {
    const eqType = key ? getEquipmentType(key) : null;
    return eqType ? tEquipmentTypes(eqType.key) : null;
  };

  // system_name -> (element name -> { total, byProduct: Map(catalogItemId|null -> qty) })
  const byCategory = new Map();
  // markers placed before the Add Element catalog existed (no element_id yet)
  const legacy = new Map();

  for (const m of markers) {
    if (m.custom_icon_id) continue; // counted separately below
    const qty = m.quantity ?? 1;
    const el = getMarkerElement(m, elementTypes);
    if (el) {
      if (!byCategory.has(el.system_name)) byCategory.set(el.system_name, new Map());
      const cat = byCategory.get(el.system_name);
      if (!cat.has(el.name)) cat.set(el.name, { total: 0, byProduct: new Map() });
      const entry = cat.get(el.name);
      entry.total += qty;
      const productKey = markerProductId(m, elementTypes);
      entry.byProduct.set(productKey, (entry.byProduct.get(productKey) || 0) + qty);
    } else if (m.equipment_type) {
      const label = legacyLabel(m.equipment_type);
      if (label) legacy.set(label, (legacy.get(label) || 0) + qty);
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

  // Which element each material's units came from, so the purchase list can be
  // checked against the plan: "52 faceplates = 41 Network Jack + 11 Camera".
  const sourceLabel = m => {
    if (m.custom_icon_id) return customIcons.find(ic => ic.id === m.custom_icon_id)?.name || t('uncategorized');
    const el = getMarkerElement(m, elementTypes);
    return el?.name || legacyLabel(m.equipment_type) || t('uncategorized');
  };

  // A rack's accessories are its room's items, listed in the telecom-room block
  // below — counting them here too would order every patch cord twice.
  const accessoryTally = new Map();
  for (const m of markers) {
    if (isRackMarker(m, elementTypes)) continue;
    const markerQty = m.quantity ?? 1;
    const source = sourceLabel(m);
    for (const a of accessories.filter(ac => ac.marker_id === m.id)) {
      const key = a.catalog_item_id || a.name.toLowerCase();
      if (!accessoryTally.has(key)) {
        accessoryTally.set(key, { label: a.name, product: productById(a.catalog_item_id), qty: 0, sources: new Map() });
      }
      const entry = accessoryTally.get(key);
      const units = (a.quantity ?? 1) * markerQty;
      entry.qty += units;
      entry.sources.set(source, (entry.sources.get(source) || 0) + units);
    }
  }
  if (accessoryTally.size > 0) {
    csvRows.push(['', '', '']);
    csvRows.push([t('accessories'), '', '']);
    for (const { label, product, qty, sources } of accessoryTally.values()) {
      csvRows.push([`  ${label}`, product?.item_code || '', qty]);
      // One source is no breakdown — the line above already says it.
      if (sources.size < 2) continue;
      for (const [source, units] of [...sources.entries()].sort((a, b) => b[1] - a[1])) {
        csvRows.push([`    ${source}`, '', units]);
      }
    }
  }

  if (planMaterials.length > 0) {
    csvRows.push(['', '', '']);
    csvRows.push([t('extraMaterials'), '', '']);
    let materialUnits = 0;
    let materialCost = 0;
    let pricedLines = 0;
    for (const mat of planMaterials) {
      const product = productById(mat.catalog_item_id);
      const qty = mat.quantity ?? 1;
      materialUnits += qty;
      // A free-typed material has no catalog price; the count of what was
      // priced rides along with the total so it can't read as the whole list.
      if (product?.price != null) { materialCost += Number(product.price) * qty; pricedLines += 1; }
      csvRows.push([`  ${mat.name}`, product?.item_code || '', qty]);
    }
    csvRows.push([t('extraMaterialsTotal', { lines: planMaterials.length }), '', materialUnits]);
    if (pricedLines > 0) {
      csvRows.push([t('extraMaterialsCost', { priced: pricedLines, lines: planMaterials.length }), '', materialCost.toFixed(2)]);
    }
  }

  // One block per rack: each one terminates its own drops and is sized on its
  // own, so the list can be pulled rack by rack in the field.
  for (const room of telecomRooms) {
    if (room.drops === 0 && room.items.length === 0) continue;
    csvRows.push(['', '', '']);
    csvRows.push([room.name ? t('telecomRoomNamed', { name: room.name }) : t('telecomRoomUnassigned'), '', '']);
    // A line the rack doesn't need was excluded on purpose; leaving it out of
    // the purchase list is the whole point of excluding it.
    const shows = line => !(room.hidden || []).includes(line);
    if (shows('keystones')) {
      csvRows.push([`  ${t('keystoneJacks')}`, '', room.drops]);
      // Named from the drops themselves, so the room and the floor can't drift.
      for (const k of room.keystones || []) {
        const product = productById(k.productId);
        csvRows.push([`    ${product ? `${product.item_code} ${productName(product)}` : t('noProduct')}`, product?.item_code || '', k.count]);
      }
    }
    if (shows('panels')) csvRows.push([`  ${t('patchPanels', { ports: room.ports })}`, productById(room.panelItemId)?.item_code || '', room.panels]);
    if (shows('switches')) csvRows.push([`  ${t('switches', { ports: room.switchPorts })}`, productById(room.switchItemId)?.item_code || '', room.switches]);
    if (shows('managers')) csvRows.push([`  ${t('cableManagers')}`, productById(room.managerItemId)?.item_code || '', room.managers]);
    for (const item of room.items) csvRows.push([`  ${item.name}`, item.code, item.quantity]);
    csvRows.push([`    ${t('patchPanelSpare', { spare: room.spare, units: room.rackUnits })}`, '', '']);
  }

  const cableTotals = buildCableTotals({ markers, cables: cables ?? [], cableTypes, cableLengthFeet, feetPerPixel });
  if (cableTotals.length > 0) {
    csvRows.push(['', '', '']);
    csvRows.push([t('cabling'), '', t('feet')]);
    for (const { name, feetPerBox, estimated, traced, total: feet, boxes } of cableTotals) {
      csvRows.push([`  ${name}`, '', Math.round(feet)]);
      if (estimated > 0 && traced > 0) {
        csvRows.push([`    ${t('cableEstimated')}`, '', Math.round(estimated)]);
        csvRows.push([`    ${t('cableTraced')}`, '', Math.round(traced)]);
      }
      csvRows.push([`    ${t('boxesOf', { size: feetPerBox })}`, '', boxes]);
    }
  }

  if (cables?.length) {
    csvRows.push(['', '', '']);
    csvRows.push([t('tracedRuns'), '', feetPerPixel ? t('feet') : t('noScaleDefined')]);
    let totalFeet = 0;
    cables.forEach((c, i) => {
      const feet = feetPerPixel ? cableLengthFeet(c) : null;
      if (feet != null) totalFeet += feet;
      csvRows.push([c.label || t('cableDefaultLabel', { number: i + 1 }), '', feet != null ? feet.toFixed(1) : '—']);
    });
    if (feetPerPixel) csvRows.push([t('totalFootage'), '', totalFeet.toFixed(1)]);
  }

  // ── The purchase list itself ────────────────────────────────────────────
  // Everything above, added up by article and grouped by supplier — the one
  // block that gets handed to whoever places the order. Cable stays out of it
  // on purpose: it is bought by the box, and it already has its own block.
  const purchase = buildPurchaseList({
    markers, elementTypes, accessories, planMaterials, customIcons, catalogProducts,
    rooms: telecomRooms, legacyLabel,
    labels: {
      noProduct: t('noProduct'),
      extraMaterials: t('extraMaterials'),
      telecomRoom: t('telecomRoom'),
      keystones: t('keystoneJacks'),
      patchPanel: ports => t('patchPanels', { ports }),
      switch: ports => t('switches', { ports }),
      cableManagers: t('cableManagers'),
    },
  });
  if (purchase.length > 0) {
    csvRows.push(['', '', '']);
    csvRows.push([t('purchaseList'), '', '']);
    csvRows.push([t('columnType'), t('columnCode'), t('columnQuantity'), t('columnVendor'), t('columnUnitPrice'), t('columnLineTotal')]);

    let currentVendor = null;
    let vendorSubtotal = 0;
    let grandTotal = 0;
    let units = 0;
    let priced = 0;
    let noProduct = 0;
    const flushVendor = () => {
      if (currentVendor !== null) csvRows.push(['', '', '', t('vendorSubtotal', { vendor: currentVendor }), '', vendorSubtotal.toFixed(2)]);
    };
    for (const line of purchase) {
      const vendor = line.vendor || t('noVendor');
      if (vendor !== currentVendor) {
        flushVendor();
        currentVendor = vendor;
        vendorSubtotal = 0;
      }
      units += line.quantity;
      if (!line.code) noProduct += 1;
      const lineTotal = line.price != null ? line.price * line.quantity : null;
      if (lineTotal != null) { vendorSubtotal += lineTotal; grandTotal += lineTotal; priced += 1; }
      csvRows.push([
        line.label, line.code, line.quantity, vendor,
        line.price != null ? line.price.toFixed(2) : '',
        lineTotal != null ? lineTotal.toFixed(2) : '',
      ]);
    }
    flushVendor();
    csvRows.push([t('purchaseTotal', { lines: purchase.length }), '', units]);
    csvRows.push([t('purchaseCost', { priced, lines: purchase.length }), '', '', '', '', grandTotal.toFixed(2)]);
    // What is still not linked to the catalog: those lines carry no code, no
    // supplier and no price, so saying how many keeps the totals honest.
    if (noProduct > 0) csvRows.push([t('purchaseNoProduct', { count: noProduct }), '', '']);
    csvRows.push([t('purchaseCableNote'), '', '']);
  }

  // Every row is padded to the widest one so the purchase list's supplier and
  // price columns line up with the rest of the file, and an embedded quote is
  // doubled (RFC 4180) — catalog names carry inch marks (Patch panel 19").
  const width = Math.max(...csvRows.map(row => row.length));
  const csvContent = csvRows
    .map(row => [...row, ...Array(width - row.length).fill('')]
      .map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
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
