// Opens a generated PDF in a new tab (instead of forcing a download) so
// Safari's native PDF viewer renders it — that's what exposes the Markup
// (pencil) button on iOS/iPadOS/macOS for annotating before saving/sharing.
export async function openPdfPreview(elementId, filename, optOverrides = {}) {
  // iPhone/iPad Safari won't follow a pre-opened about:blank tab to a blob
  // URL (it stays blank), so there the PDF opens in this same tab instead —
  // still Safari's native viewer with Markup/Share; Back returns to the page.
  const ios = isIOS();
  // Elsewhere, open the tab synchronously, before any await, so Safari's
  // popup blocker still treats it as a direct result of the user's click.
  const win = ios ? null : window.open('', '_blank');
  // Until the PDF is ready the tab is about:blank — say so instead of
  // showing an empty page (a long document can take several seconds).
  writeStatus(win, filename, '<p style="color:#555">Generating PDF…</p>');
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
        onclone: doc => { doc.documentElement.dataset.theme = 'light'; },
      },
    };
    const blob = await html2pdf().set(opt).from(element).outputPdf('blob');
    const url = URL.createObjectURL(blob);
    if (ios) {
      window.location.href = url;
    } else if (win) {
      win.location.href = url;
      // Safari on the Mac can leave the pre-opened tab on about:blank instead
      // of following it to the blob URL. If it hasn't moved after a moment,
      // show the PDF inside that same tab, with a download link as backup.
      setTimeout(() => {
        if (stillBlank(win)) {
          writeStatus(win, filename,
            `<p style="margin:0 0 12px"><a href="${url}" download="${escapeHtml(filename)}" style="color:#16223d;font-weight:600">Download ${escapeHtml(filename)}</a></p>` +
            `<iframe src="${url}" style="width:100%;height:calc(100vh - 90px);border:1px solid #ddd;border-radius:8px"></iframe>`);
        }
      }, 1500);
    } else {
      window.open(url, '_blank');
    }
  } catch (err) {
    // Leave an explanation in the tab rather than closing it silently.
    writeStatus(win, filename, `<p style="color:#c0392b">The PDF could not be generated. Please close this tab and try again.</p>`);
    throw err;
  } finally {
    window.dispatchEvent(new Event('otess:print-end'));
  }
}

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  // iPadOS reports itself as a Mac; tell it apart by its touch screen.
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function stillBlank(win) {
  try {
    return !win.closed && win.location.href === 'about:blank';
  } catch {
    // Cross-origin access throws: the tab navigated away, so it isn't blank.
    return false;
  }
}

function writeStatus(win, filename, bodyHtml) {
  if (!win || win.closed) return;
  try {
    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(filename)}</title></head>` +
      `<body style="font-family:-apple-system,sans-serif;margin:24px">${bodyHtml}</body></html>`);
    win.document.close();
  } catch {
    // The tab already left about:blank; nothing to write into.
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
