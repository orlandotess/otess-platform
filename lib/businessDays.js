// Solo cubre sábado/domingo — no hay tabla de feriados de Puerto Rico todavía.
export function nextBusinessDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() + 2);
  else if (day === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}
