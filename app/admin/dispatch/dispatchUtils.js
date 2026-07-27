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

const PR_DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE });

// Fecha (YYYY-MM-DD) en hora de Puerto Rico, para comparar contra el `day` del board.
export function dayPR(iso) {
  return PR_DATE_FMT.format(new Date(iso));
}

// Posición y ancho de un job dentro de una fila del Gantt, en px, recortado a la
// ventana visible. Compartido entre GanttRow y la fila de "Sin técnico".
export function jobPosition(job) {
  if (!job.scheduled_start) return null;
  const startMin = minutesOfDayPR(job.scheduled_start);
  const rawEndMin = job.scheduled_end ? minutesOfDayPR(job.scheduled_end) : startMin + 60;
  const clampedStart = Math.max(startMin, HORA_INICIO * 60);
  const clampedEnd = Math.min(rawEndMin > startMin ? rawEndMin : startMin + 60, HORA_FIN * 60);
  if (clampedStart >= HORA_FIN * 60 || clampedEnd <= HORA_INICIO * 60) return null;
  const left = ((clampedStart - HORA_INICIO * 60) / SLOT_MINUTOS) * SLOT_WIDTH;
  const width = Math.max(((clampedEnd - clampedStart) / SLOT_MINUTOS) * SLOT_WIDTH, SLOT_WIDTH / 2);
  return { left, width };
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
