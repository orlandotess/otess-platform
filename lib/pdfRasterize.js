// Rasterizes page 1 of an uploaded PDF floor plan to a PNG blob, client-side,
// so it can be used as the working canvas surface for the Planos editor.
// Loaded dynamically (not a top-level import) so pdfjs-dist stays out of the
// bundle for every page that never touches a PDF.
const TARGET_LONG_EDGE = 3600;

export async function rasterizePdfFirstPage(file) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);

  const baseViewport = page.getViewport({ scale: 1 });
  const scale = TARGET_LONG_EDGE / Math.max(baseViewport.width, baseViewport.height);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return { blob, width: canvas.width, height: canvas.height };
}
