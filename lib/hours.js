// Shared hours calculation for clock/schedule time ranges. Centralizing this
// avoids each page re-deriving hours with its own formula and its own bugs —
// previously every caller computed (end-start)/3600000-lunch/60 inline with no
// floor, so a bad edit (end before start, or lunch longer than the shift) went
// negative and was silently summed into real payroll/rentabilidad totals.
export function computeHours(start, end, lunchMinutes = 0) {
  if (!start || !end) return { hours: 0, invalid: false };
  const diffMs = new Date(end) - new Date(start);
  if (diffMs <= 0) return { hours: 0, invalid: true };
  const hours = diffMs / 3600000 - (lunchMinutes ?? 0) / 60;
  if (hours <= 0) return { hours: 0, invalid: true };
  return { hours, invalid: false };
}

// `clocked_in_at` is stored as a real UTC instant, so reading its calendar
// day directly off the ISO string (`.slice(0, 10)`) misattributes any
// clock-in from ~8pm-11:59pm Puerto Rico time to the next calendar day — and
// for a week's last day, pushes those hours into the following pay week
// entirely. Every place that buckets time entries by day/week must go
// through this instead of slicing the raw timestamp. Uses the same
// Intl timeZone approach as lib/datetimeLocal.js rather than a manual -4h
// shift, so it stays correct if PR's offset rules ever change.
const PR_TIMEZONE = 'America/Puerto_Rico';

export function prDayKey(isoTimestamp) {
  return new Date(isoTimestamp).toLocaleDateString('en-CA', { timeZone: PR_TIMEZONE });
}

// Widens a [weekStart, weekEnd] pair — as built elsewhere anchored at
// UTC-midnight of the PR calendar date, e.g. by admin/timesheet's
// getWeekRange() — by 4 hours (PR's fixed UTC offset), so a Supabase query
// against the real UTC `clocked_in_at` column doesn't cut off entries
// clocked in late in the evening PR time. Pair with prDayKey() to bucket the
// (slightly wider) result set back into the correct day/week.
export function prQueryBounds(weekStart, weekEnd) {
  const offsetMs = 4 * 60 * 60 * 1000;
  return {
    start: new Date(weekStart.getTime() + offsetMs),
    end: new Date(weekEnd.getTime() + offsetMs),
  };
}

// Reads the wall-clock hour/minute a stored UTC instant corresponds to in
// Puerto Rico — for pre-filling a time-editing form. Pair with
// buildPRTimestamp() when saving the edit back, so the round-trip doesn't
// depend on the browser/device's own timezone (e.g. an admin editing from a
// laptop set to a different zone, or a técnico's phone).
export function prTimeParts(isoTimestamp) {
  const shifted = new Date(new Date(isoTimestamp).getTime() - 4 * 60 * 60 * 1000);
  return { hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
}

// Builds a real UTC instant from a PR calendar date ('YYYY-MM-DD') and a PR
// wall-clock hour/minute, using an explicit -04:00 offset instead of
// .setHours() (which would use whatever timezone the browser/device is in).
export function buildPRTimestamp(dateStr, hour, minute) {
  return new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-04:00`);
}

const pad2 = n => String(n).padStart(2, '0');

// Deterministic, server-timezone-independent month/year boundaries for
// Puerto Rico. `new Date(year, month, day)` resolves those components in
// whatever timezone the Node process happens to be running in (often UTC in
// production, but not guaranteed) — Date.UTC() with PR's fixed +4h offset
// baked in gives the same true UTC instant no matter how the server is
// configured, so a técnico's last evening of the month isn't silently
// dropped by the query depending on deployment. `month` is 0-indexed to
// match Date's own convention.
export function prMonthRange(year, month) {
  const queryStart = new Date(Date.UTC(year, month, 1, 4, 0, 0, 0));
  const queryEnd = new Date(Date.UTC(year, month + 1, 1, 4, 0, 0, 0) - 1);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return {
    queryStart, queryEnd,
    periodStart: `${year}-${pad2(month + 1)}-01`,
    periodEnd: `${year}-${pad2(month + 1)}-${pad2(lastDay)}`,
  };
}

export function prYearRange(year) {
  const queryStart = new Date(Date.UTC(year, 0, 1, 4, 0, 0, 0));
  const queryEnd = new Date(Date.UTC(year + 1, 0, 1, 4, 0, 0, 0) - 1);
  return {
    queryStart, queryEnd,
    periodStart: `${year}-01-01`,
    periodEnd: `${year}-12-31`,
  };
}

// Same idea as prMonthRange/prYearRange for an arbitrary 7-day window
// starting at a given PR calendar date (e.g. the Dashboard's Mon-Sun "this
// week" card, driven by a plain 'YYYY-MM-DD' from a query param or default).
export function prWeekRangeFromDate(startDateStr) {
  const [y, m, d] = startDateStr.split('-').map(Number);
  const queryStart = new Date(Date.UTC(y, m - 1, d, 4, 0, 0, 0));
  const queryEnd = new Date(queryStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  const endDate = new Date(queryStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  return {
    queryStart, queryEnd,
    periodStart: startDateStr,
    periodEnd: `${endDate.getUTCFullYear()}-${pad2(endDate.getUTCMonth() + 1)}-${pad2(endDate.getUTCDate())}`,
  };
}

// A job's real schedule window is `jobs.scheduled_start/scheduled_end` (the
// first visit) PLUS any extra visits in `job_schedule_days` — two separate
// tables that every page used to read independently, so a page that only
// looked at the primary field went stale the moment a later visit was added
// via "+ Añadir día" (e.g. FIN showing 2pm when the last real visit ends at
// 6:30pm). Any page displaying a job's start/end/total-hours must go through
// this instead of reading job.scheduled_start/scheduled_end directly.
export function getJobScheduleWindow(job, scheduleDays = []) {
  const days = scheduleDays ?? [];
  const primaryHours = computeHours(job?.scheduled_start, job?.scheduled_end).hours;
  const extraHours = days.reduce((sum, d) => sum + computeHours(d.scheduled_start, d.scheduled_end, d.lunch_minutes).hours, 0);

  let start = job?.scheduled_start ?? null;
  let end = job?.scheduled_end ?? null;
  days.forEach(d => {
    if (d.scheduled_start && (!start || new Date(d.scheduled_start) < new Date(start))) start = d.scheduled_start;
    if (d.scheduled_end && (!end || new Date(d.scheduled_end) > new Date(end))) end = d.scheduled_end;
  });

  return {
    start,
    end,
    totalHours: primaryHours + extraHours,
    primaryHours,
    extraHours,
    hasExtraDays: days.length > 0,
  };
}
