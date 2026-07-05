// Builds a query string that keeps whatever period params are already in the
// URL (month, week, year selectors are independent) and overrides the given keys.
export function withParams(searchParams, updates) {
  const params = new URLSearchParams(searchParams?.toString());
  Object.entries(updates).forEach(([k, v]) => {
    if (v === null || v === undefined) params.delete(k);
    else params.set(k, String(v));
  });
  return params.toString();
}
