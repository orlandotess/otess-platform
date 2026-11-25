// Server-side PDFs for the client-facing pages (estimate, invoice, proposal,
// reports). The PDF gets a real address — e.g. /estimado/<id>/pdf — so it
// opens, refreshes, downloads and can be linked the same on every device,
// instead of being a blob made in the browser (which on iPhone left a blank
// tab, didn't download, and on refresh landed on the login page).
//
// How: a headless Chromium opens the same public page the client sees and
// prints just the document element, so the PDF looks like the page.
import { PDF_RENDER_HEADER, renderToken } from './pdfRenderToken';

async function launchBrowser() {
  const puppeteer = (await import('puppeteer-core')).default;
  if (process.env.VERCEL || process.platform === 'linux') {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // Local development on the Mac: use the installed Chrome.
  return puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
}

// Renders `selector` on the page at `origin + path` to a PDF Buffer.
// - width: viewport width the page is laid out at (the line-item tables need
//   ~800px; on a phone-sized layout they'd be clipped).
// - margin: PDF page margin in inches (proposals print edge to edge).
// - query: optional search string (e.g. '?opcion=…'); the signature covers
//   only `path`, which is what the page checks with isPdfRender().
export async function renderPagePdf({ origin, path, query = '', selector, width = 800, margin = 0.5 }) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 1100, deviceScaleFactor: 2 });
    await page.setExtraHTTPHeaders({ [PDF_RENDER_HEADER]: renderToken(path) });
    // Screen styles, not print: the documents are designed for the screen,
    // same as the browser-made PDFs were.
    await page.emulateMediaType('screen');
    const res = await page.goto(`${origin}${path}${query}`, { waitUntil: 'networkidle0', timeout: 30_000 });
    if (!res || !res.ok()) throw new Error(`PDF render: ${path} answered ${res?.status()}`);
    await page.waitForSelector(selector, { timeout: 10_000 });

    await page.evaluate(async sel => {
      // Light theme always (the documents use the app's theme variables).
      document.documentElement.dataset.theme = 'light';
      // Sections that only show their full content in "print mode" (e.g.
      // the proposal's collapsed sub items) listen for this event.
      window.dispatchEvent(new Event('otess:print-start'));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      // Keep only the document: drop buttons, banners, footer, etc.
      const doc = document.querySelector(sel);
      document.body.replaceChildren(doc);
      Object.assign(document.body.style, { margin: '0', padding: '0', background: '#fff' });
      Object.assign(doc.style, { margin: '0', border: 'none', borderRadius: '0' });
      // Wait for any image still loading (logo, product photos).
      await Promise.all([...doc.querySelectorAll('img')].map(img =>
        img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
      // Chromium embeds each photo at its original resolution: a report with
      // a dozen phone photos came out at 10 MB, over Vercel's ~4.5 MB response
      // limit, and the download broke. Re-encode every image that's much
      // bigger than it's shown at down to 2× its on-page size.
      await Promise.all([...doc.querySelectorAll('img')].map(async img => {
        const target = Math.ceil(img.getBoundingClientRect().width * 2);
        if (!target || img.naturalWidth <= target * 1.2) return;
        try {
          // fetch + createImageBitmap instead of drawing the <img>: photos come
          // from Supabase Storage (another origin) and would taint the canvas.
          const bitmap = await createImageBitmap(await (await fetch(img.currentSrc || img.src)).blob());
          const canvas = document.createElement('canvas');
          canvas.width = target;
          canvas.height = Math.round(bitmap.height * (target / bitmap.width));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff'; // transparent PNGs → white, not black, as JPEG
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          img.srcset = '';
          img.src = canvas.toDataURL('image/jpeg', 0.85);
          await img.decode();
        } catch {
          // Leave the original image: a bigger PDF beats a missing photo.
        }
      }));
    }, selector);

    const inches = `${margin}in`;
    return await page.pdf({
      format: 'letter',
      printBackground: true,
      margin: { top: inches, right: inches, bottom: inches, left: inches },
    });
  } finally {
    await browser.close();
  }
}

// The HTTP response for a PDF route: inline to view, attachment to download.
export function pdfResponse(pdf, filename, download) {
  const safe = filename.replace(/[^\w.\- ]+/g, '_');
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      // Documents change (payments, edits): never serve a stale copy.
      'Cache-Control': 'private, no-store',
    },
  });
}

// Everything a PDF route does after finding the document: render the public
// page at `path`, then answer inline (view) or as an attachment
// (?download=1). A failure answers 500 with a short message instead of
// leaving the client's tab hanging on an error page with a stack trace.
export async function respondWithPdf(request, { path, query, selector, margin, filename }) {
  const url = new URL(request.url);
  try {
    const pdf = await renderPagePdf({ origin: url.origin, path, query, selector, margin });
    return pdfResponse(pdf, filename, url.searchParams.has('download'));
  } catch (err) {
    console.error('PDF render failed:', path, err);
    return new Response('The PDF could not be generated. Please try again in a moment.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
