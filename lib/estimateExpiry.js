import { prDayKey } from './hours';

// An estimate is valid through the whole `valid_until` day, Puerto Rico time.
// No valid_until means it never expires. Used both by the public page (to
// swap the accept button for a notice) and by /api/accept-estimate (so an
// old link or a direct request can't accept it either).
export function isEstimateExpired(validUntil, now = new Date()) {
  if (!validUntil) return false;
  return String(validUntil).slice(0, 10) < prDayKey(now);
}
