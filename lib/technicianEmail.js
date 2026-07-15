import { normalizeName } from './normalizeName';

// Resolves a technician's email via the reliable profile_id link, falling back
// to a fuzzy name match against profiles for technicians created before that
// link existed. Returns null if neither resolves, so callers can flag it.
export function resolveTechEmail(tech, profiles) {
  const byId = tech.profile_id && profiles.find(p => p.id === tech.profile_id);
  if (byId?.email) return byId.email;
  const byName = profiles.find(p => normalizeName(p.name) === normalizeName(tech.name));
  return byName?.email ?? null;
}
