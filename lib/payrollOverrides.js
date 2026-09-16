// Shared helpers for applying daily_hour_overrides (per-day manual hour
// corrections made in the admin Timesheet, e.g. a forgotten clock-out or an
// absence) on top of raw time_entries. Every page that computes payroll or
// labor cost from time_entries must go through these so a correction made in
// Timesheet is reflected everywhere pay is calculated, not just there.
import { computeHours, prDayKey, payWeekStart } from './hours';

export function indexDayOverrides(dayOverrides, technicianId) {
  const map = {};
  dayOverrides.filter(o => o.technician_id === technicianId).forEach(o => { map[o.work_date] = o; });
  return map;
}

// Splits a Wed–Tue pay week into regular/overtime hours (first 40h/week are
// regular). `byDay` is raw hours keyed by 'YYYY-MM-DD' for every day with
// activity in that week. Days present in `dayOverrides` use the override's
// own regular/overtime split directly instead of raw clocked time, but still
// count toward the 40h cumulative for the rest of the week.
export function splitRegularOvertime(byDay, dayOverrides = {}) {
  let regular = 0, overtime = 0, cumulative = 0;
  Object.keys(byDay).sort().forEach(day => {
    const override = dayOverrides[day];
    let dayRegular, dayOvertime, hours;
    if (override) {
      dayRegular = Number(override.regular_hours_override ?? 0);
      dayOvertime = Number(override.overtime_hours_override ?? 0);
      hours = dayRegular + dayOvertime;
    } else {
      hours = byDay[day];
      dayRegular = Math.min(hours, Math.max(0, 40 - cumulative));
      dayOvertime = hours - dayRegular;
    }
    regular += dayRegular;
    overtime += dayOvertime;
    cumulative += hours;
  });
  return { regular, overtime };
}

// Returns effective hours per entry (same order/length as `entries`),
// substituting any per-day override for that technician/date. When a day has
// several entries (e.g. split across jobs), the override total is
// distributed proportionally to each entry's raw share of that day.
export function effectiveEntryHours(entries, dayOverrides) {
  const overrideMap = {};
  dayOverrides.forEach(o => { overrideMap[`${o.technician_id}|${o.work_date}`] = o; });

  const rawHours = entries.map(e => e.clocked_out_at ? computeHours(e.clocked_in_at, e.clocked_out_at, e.lunch_minutes).hours : 0);
  const dayTotals = {};
  entries.forEach((e, i) => {
    const key = `${e.technician_id}|${prDayKey(e.clocked_in_at)}`;
    dayTotals[key] = (dayTotals[key] ?? 0) + rawHours[i];
  });

  return entries.map((e, i) => {
    const key = `${e.technician_id}|${prDayKey(e.clocked_in_at)}`;
    const override = overrideMap[key];
    if (!override) return rawHours[i];
    const overrideTotal = Number(override.regular_hours_override ?? 0) + Number(override.overtime_hours_override ?? 0);
    const dayTotal = dayTotals[key];
    if (dayTotal <= 0) return 0;
    return rawHours[i] * (overrideTotal / dayTotal);
  });
}

// Reparte las horas de cada entrada entre regular y overtime, respetando el
// corte de 40h por semana de pago (mismo criterio que splitRegularOvertime) y
// las correcciones por día.
//
// Existe para costear mano de obra POR TRABAJO: rentabilidad y el tab de un
// trabajo multiplicaban horas × tarifa base, sin la prima de 1.5x, así que un
// trabajo tocado por una semana de overtime salía más barato de lo que
// realmente costó.
//
// `entries` tiene que traer TODAS las entradas del técnico en esas semanas,
// no solo las del trabajo que se está costeando: el corte de las 40 horas es
// semanal, y contar solo las horas de un trabajo correría la frontera. El
// llamante filtra después, sobre el resultado.
//
// Dentro de un día, la parte regular y la de overtime se reparten
// proporcionalmente entre las entradas de ese día en vez de dárselas por orden
// cronológico al último trabajo. El costo total del día es el mismo de las dos
// formas, pero así el costo de un trabajo no depende de en qué orden se
// atendió ese día.
export function splitEntriesRegularOvertime(entries, dayOverrides = []) {
  const eff = effectiveEntryHours(entries, dayOverrides);
  const overrideMap = {};
  dayOverrides.forEach(o => { overrideMap[`${o.technician_id}|${o.work_date}`] = o; });

  const byTechWeek = {};
  entries.forEach((e, i) => {
    const day = prDayKey(e.clocked_in_at);
    const key = `${e.technician_id}|${payWeekStart(day)}`;
    ((byTechWeek[key] ??= {})[day] ??= []).push(i);
  });

  const out = entries.map(() => ({ regular: 0, overtime: 0 }));
  Object.entries(byTechWeek).forEach(([key, days]) => {
    const technicianId = key.slice(0, key.lastIndexOf('|'));
    let cumulative = 0;
    Object.keys(days).sort().forEach(day => {
      const idxs = days[day];
      const dayTotal = idxs.reduce((a, i) => a + eff[i], 0);
      const override = overrideMap[`${technicianId}|${day}`];
      let dayRegular, dayOvertime, hours;
      if (override) {
        dayRegular = Number(override.regular_hours_override ?? 0);
        dayOvertime = Number(override.overtime_hours_override ?? 0);
        hours = dayRegular + dayOvertime;
      } else {
        hours = dayTotal;
        dayRegular = Math.min(hours, Math.max(0, 40 - cumulative));
        dayOvertime = hours - dayRegular;
      }
      if (dayTotal > 0) {
        idxs.forEach(i => {
          const share = eff[i] / dayTotal;
          out[i] = { regular: dayRegular * share, overtime: dayOvertime * share };
        });
      }
      cumulative += hours;
    });
  });
  return out;
}
