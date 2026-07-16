// Converts between the UTC ISO timestamps Supabase stores for job scheduling
// and the local wall-clock string a <input type="datetime-local"> needs.
// Without this conversion, the picker shows/saves the UTC digits as if they
// were local time, shifting scheduled jobs by the browser's UTC offset
// (e.g. 4 hours in Puerto Rico).

// Same underlying issue, different surface: displaying a timestamptz with
// toLocaleString/toLocaleDateString and no `timeZone` option renders it in
// whatever timezone the runtime happens to be in (the server's, usually UTC),
// not Puerto Rico's. Always go through these helpers instead of calling
// toLocale*String directly on a timestamptz value from the database.
export const APP_TIMEZONE = 'America/Puerto_Rico';

export function formatDateTimePR(iso, opts = {}, locale = 'es-PR') {
  if (!iso) return '';
  return new Date(iso).toLocaleString(locale, { timeZone: APP_TIMEZONE, ...opts });
}

export function formatDatePR(iso, opts = {}, locale = 'es-PR') {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(locale, { timeZone: APP_TIMEZONE, ...opts });
}

export function formatTimePR(iso, opts = {}, locale = 'es-PR') {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(locale, { timeZone: APP_TIMEZONE, ...opts });
}

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
