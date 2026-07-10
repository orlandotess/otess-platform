// Counts placed floor-plan markers by equipment type, and cable runs with
// footage (if the plan has a scale defined), and downloads a CSV.
export function exportEquipmentListCSV(markers, equipmentTypes, customIcons, cables, feetPerPixel, cableLengthFeet, planName) {
  if (!markers?.length) { alert('No hay equipos colocados para exportar.'); return; }

  const rows = [];
  for (const t of equipmentTypes) {
    const count = markers.filter(m => m.equipment_type === t.key).length;
    if (count > 0) rows.push([t.label, count]);
  }
  for (const ic of customIcons) {
    const count = markers.filter(m => m.custom_icon_id === ic.id).length;
    if (count > 0) rows.push([ic.name, count]);
  }

  const total = markers.length;
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
