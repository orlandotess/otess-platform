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
