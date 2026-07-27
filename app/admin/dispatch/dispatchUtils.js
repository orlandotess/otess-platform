import { APP_TIMEZONE } from '../../../lib/datetimeLocal';

// Ventana visible del Gantt: día completo (12am–12am) en bloques de 30 min.
export const HORA_INICIO = 0;
export const HORA_FIN = 24;
export const SLOT_MINUTOS = 30;
export const SLOT_WIDTH = 64;

const TECH_COLORS = ['#2a4cb5', '#e0972c', '#2f7d5c', '#7c3aed', '#c1501f', '#0891b2', '#be185d', '#4b5563'];

export function techColor(index) {
  return TECH_COLORS[index % TECH_COLORS.length];
}

const PR_TIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
});

// Minutos desde medianoche en hora de Puerto Rico, a partir de un timestamptz ISO.
// No se puede restar un offset fijo a mano porque el servidor puede correr en cualquier TZ.
export function minutesOfDayPR(iso) {
  const parts = PR_TIME_FMT.formatToParts(new Date(iso));
  const h = parseInt(parts.find(p => p.type === 'hour').value, 10) % 24;
  const m = parseInt(parts.find(p => p.type === 'minute').value, 10);
  return h * 60 + m;
}

// Puerto Rico usa AST (UTC-4) todo el año, sin horario de verano — el offset fijo es seguro aquí.
export function slotToIso(day, hour, minute) {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${day}T${hh}:${mm}:00-04:00`).toISOString();
}

export function todayPR() {
  return new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function formatHourLabel(h) {
  const period = h < 12 ? 'am' : 'pm';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:00${period}`;
}

export const STATUS_BADGE = {
  estimate:    { cls: 'badge-gray',  label: 'Estimado' },
  scheduled:   { cls: 'badge-blue',  label: 'Programado' },
  in_progress: { cls: 'badge-amber', label: 'En progreso' },
  completed:   { cls: 'badge-green', label: 'Completado' },
  cancelled:   { cls: 'badge-red',   label: 'Cancelado' },
};

export const STATUS_TINT = {
  estimate: 'var(--badge-gray-bg)',
  scheduled: 'var(--badge-blue-bg)',
  in_progress: 'var(--badge-amber-bg)',
  completed: 'var(--badge-green-bg)',
  cancelled: 'var(--badge-red-bg)',
};
