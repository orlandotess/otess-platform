// Rasterizes page 1 of an uploaded PDF floor plan to a PNG blob, client-side,
// so it can be used as the working canvas surface for the Planos editor.
// Loaded dynamically (not a top-level import) so pdfjs-dist stays out of the
// bundle for every page that never touches a PDF.
//
// Scaled by physical DPI rather than a flat pixel cap: plan sheets range from
// letter-size to large-format architectural (24x36", 30x42"), so a flat pixel
// target either wastes resolution on small sheets or under-resolves big ones.
// PDF points are 1/72", hence the /72 conversion. MAX_LONG_EDGE guards against
// canvas memory/dimension limits (Safari is the most restrictive browser).
const TARGET_DPI = 300;
const MAX_LONG_EDGE = 10000;

export async function rasterizePdfFirstPage(file) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);

  const baseViewport = page.getViewport({ scale: 1 });
  const longEdgePts = Math.max(baseViewport.width, baseViewport.height);
  const scale = Math.min(TARGET_DPI / 72, MAX_LONG_EDGE / longEdgePts);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return { blob, width: canvas.width, height: canvas.height };
}
