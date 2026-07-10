// Fetches an image and hands it to the OS share sheet via the Web Share API.
// One tap instead of a long-press to reach "Save Image" — Markup itself isn't
// a share-sheet action for files shared this way, only for actual Photos-app
// assets, so the real annotate path is Save Image → Fotos → Editar → Markup.
export async function shareImageForMarkup(url, filename = 'foto.jpg') {
  const res = await fetch(url);
  const blob = await res.blob();
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file] });
    return true;
  }
  return false;
}

export function canShareFiles() {
  return typeof navigator !== 'undefined' && !!navigator.canShare;
}

const HINT_KEY = 'otess_markup_hint_seen';

// Explains the Save Image → Fotos → Markup path once before the first share,
// since it's not obvious that Markup isn't directly in the share sheet.
export function hasSeenMarkupHint() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(HINT_KEY) === '1';
}

export function markMarkupHintSeen() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HINT_KEY, '1');
}
