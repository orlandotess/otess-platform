// Strips accents/diacritics and case so names like "Ricardo Diaz" and "Ricardo Díaz"
// compare equal — Postgres ILIKE is case-insensitive but not accent-insensitive.
export function normalizeName(s) {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}
