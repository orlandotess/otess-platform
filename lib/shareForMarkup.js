// Fetches an image and hands it to the OS share sheet via the Web Share API.
// On iOS/iPadOS/macOS Safari, sharing a single image surfaces a Markup (pencil)
// quick action right in the share sheet — this skips the manual long-press step.
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

// Markup only shows up in the share sheet's top row if the user has pinned it
// under Ver más → Editar acciones — that's a one-time per-device setting we
// can't set for them, so we explain it once before the first share.
export function hasSeenMarkupHint() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(HINT_KEY) === '1';
}

export function markMarkupHintSeen() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HINT_KEY, '1');
}
