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
