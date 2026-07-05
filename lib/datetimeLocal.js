// Converts between the UTC ISO timestamps Supabase stores for job scheduling
// and the local wall-clock string a <input type="datetime-local"> needs.
// Without this conversion, the picker shows/saves the UTC digits as if they
// were local time, shifting scheduled jobs by the browser's UTC offset
// (e.g. 4 hours in Puerto Rico).

export function isoToLocalInput(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const offsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function localInputToIso(localValue) {
  if (!localValue) return null;
  return new Date(localValue).toISOString();
}
