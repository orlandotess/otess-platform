// Signature for the PDF renderer's own request to a public page (see
// lib/serverPdf.js). Kept apart from serverPdf.js on purpose: the pages
// import this check, and importing serverPdf.js would pull Chromium (~65 MB)
// into every page's server function.
import { createHmac, timingSafeEqual } from 'node:crypto';

// Header the renderer sends with its own request to the public page, so the
// page can tell it apart from the client and skip view tracking ("fue
// abierto" notifications, proposal status → vista). Signed with the service
// role key, which only the server has — no extra env var to configure.
export const PDF_RENDER_HEADER = 'x-otess-pdf-render';

export function renderToken(path) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createHmac('sha256', key).update(`pdf-render:${path}`).digest('hex');
}

// True when this request to `path` is the PDF renderer, not a person.
export function isPdfRender(headerList, path) {
  const sent = headerList.get(PDF_RENDER_HEADER);
  const expected = renderToken(path);
  if (!sent || !expected || sent.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}
