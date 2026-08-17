// Line items carry an optional short title above their description. Older rows
// were saved with the catalog description copied into the title (that happened
// whenever the catalog item had no `name`), which printed the same sentence
// twice. Treat those as title-less so the description stands alone.
export function displayTitle(title, description) {
  if (!title) return '';
  return title.trim() === (description ?? '').trim() ? '' : title;
}
