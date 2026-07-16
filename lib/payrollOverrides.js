// Shared helpers for applying daily_hour_overrides (per-day manual hour
// corrections made in the admin Timesheet, e.g. a forgotten clock-out or an
// absence) on top of raw time_entries. Every page that computes payroll or
// labor cost from time_entries must go through these so a correction made in
// Timesheet is reflected everywhere pay is calculated, not just there.
import { computeHours } from './hours';

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
    const key = `${e.technician_id}|${e.clocked_in_at.slice(0, 10)}`;
    dayTotals[key] = (dayTotals[key] ?? 0) + rawHours[i];
  });

  return entries.map((e, i) => {
    const key = `${e.technician_id}|${e.clocked_in_at.slice(0, 10)}`;
    const override = overrideMap[key];
    if (!override) return rawHours[i];
    const overrideTotal = Number(override.regular_hours_override ?? 0) + Number(override.overtime_hours_override ?? 0);
    const dayTotal = dayTotals[key];
    if (dayTotal <= 0) return 0;
    return rawHours[i] * (overrideTotal / dayTotal);
  });
}
