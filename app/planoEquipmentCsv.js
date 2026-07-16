import { getEquipmentType } from './equipmentIcons';

// Counts placed floor-plan markers by Add Element category / element,
// summing each marker's `quantity` (a marker can represent more than one
// physical unit), and cable runs with footage (if the plan has a scale
// defined), then downloads a CSV.
export function exportEquipmentListCSV(markers, elementTypes, customIcons, cables, feetPerPixel, cableLengthFeet, planName) {
  if (!markers?.length) { alert('No hay equipos colocados para exportar.'); return; }

  // system_name -> (element name -> quantity)
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
      cat.set(el.name, (cat.get(el.name) || 0) + qty);
    } else if (m.equipment_type) {
      const t = getEquipmentType(m.equipment_type);
      if (!t) continue;
      legacy.set(t.label, (legacy.get(t.label) || 0) + qty);
    }
  }

  const rows = [];
  for (const [systemName, elements] of byCategory) {
    rows.push([systemName, '']);
    for (const [name, qty] of elements) rows.push([`  ${name}`, qty]);
  }
  if (legacy.size > 0) {
    rows.push(['Sin categoría', '']);
    for (const [label, qty] of legacy) rows.push([`  ${label}`, qty]);
  }
  for (const ic of customIcons) {
    const count = markers.filter(m => m.custom_icon_id === ic.id).length;
    if (count > 0) rows.push([ic.name, count]);
  }

  const total = markers.reduce((sum, m) => sum + (m.quantity ?? 1), 0);
  const csvRows = [['Tipo de Equipo', 'Cantidad'], ...rows, ['', ''], ['TOTAL EQUIPOS', total]];

  if (cables?.length) {
    csvRows.push(['', '']);
    csvRows.push(['Cableado', feetPerPixel ? 'Pies' : 'Sin escala definida']);
    let totalFeet = 0;
    cables.forEach((c, i) => {
      const feet = feetPerPixel ? cableLengthFeet(c) : null;
      if (feet != null) totalFeet += feet;
      csvRows.push([c.label || `Cable ${i + 1}`, feet != null ? feet.toFixed(1) : '—']);
    });
    if (feetPerPixel) csvRows.push(['TOTAL PIETAJE', totalFeet.toFixed(1)]);
  }

  const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${planName}_Equipos.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
