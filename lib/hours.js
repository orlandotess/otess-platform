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
