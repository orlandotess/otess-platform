// Opens a generated PDF in a new tab (instead of forcing a download) so
// Safari's native PDF viewer renders it — that's what exposes the Markup
// (pencil) button on iOS/iPadOS/macOS for annotating before saving/sharing.
export async function openPdfPreview(elementId, filename, optOverrides = {}) {
  // Open the tab synchronously, before any await, so Safari's popup blocker
  // still treats it as a direct result of the user's click.
  const win = window.open('', '_blank');
  // Some sections (e.g. ProposalDocument's collapsed sub items) only show
  // their full content in "print mode" — fire the same otess:print-start/-end
  // events FaseDetalle.js listens for so anything mounted in the DOM expands
  // for the duration of the html2canvas capture, then restores afterward.
  window.dispatchEvent(new Event('otess:print-start'));
  try {
    // Let listeners re-render (e.g. sub items expanding) before the snapshot.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const html2pdf = (await import('html2pdf.js')).default;
    const element = document.getElementById(elementId);
    const opt = {
      margin: 0.5,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
      ...optOverrides,
      html2canvas: {
        scale: 2,
        useCORS: true,
        ...optOverrides.html2canvas,
        // The documents are styled with the app's theme variables, so with
        // dark mode on the PDF came out navy-on-navy. Always capture the
        // light theme — the clone is html2canvas's copy, the page is untouched.
        // clonedRoot is the subtree html2canvas will draw — html2pdf hands it
        // its own copy of the element, so it can't be found by id.
        onclone: (doc, clonedRoot) => {
          doc.documentElement.dataset.theme = 'light';
          forcePerLetterText(doc, clonedRoot);
        },
      },
    };
    const blob = await html2pdf().set(opt).from(element).outputPdf('blob');
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url;
    else window.open(url, '_blank');
  } catch (err) {
    if (win) win.close();
    throw err;
  } finally {
    window.dispatchEvent(new Event('otess:print-end'));
  }
}

// html2canvas places each *word* at its DOM position and draws it in one
// fillText. Safari's canvas draws words slightly wider than its own layout
// measured them, so each word ran over the following space ("ElectricJob",
// "ElectricaMaterials"). With any non-zero letter-spacing html2canvas instead
// positions every letter from its own DOM rect, so the error can't build up.
// 0.01px is invisible; elements that already have tracking keep theirs.
function forcePerLetterText(doc, root) {
  if (!root) return;
  const view = doc.defaultView;
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const ls = view.getComputedStyle(el).letterSpacing;
    if (ls === 'normal' || ls === '0px') el.style.letterSpacing = '0.01px';
  }
}
