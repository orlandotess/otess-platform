'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

const buttonStyle = { display: 'inline-block', padding: '8px 16px', background: '#fff', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#16223d', textDecoration: 'none' };

// "View PDF" + "Download PDF" for the client-facing pages (estimate, invoice,
// proposal, reports). Both are plain links to the server-made PDF at `href`
// (e.g. /estimado/<id>/pdf — see lib/serverPdf.js), so they behave the same
// on every device: the PDF has a real address that opens, refreshes and
// downloads normally, iPhone included.
export default function PdfButtons({ href, justify = 'flex-end', style }) {
  const t = useTranslations('pdfButtons');
  // The server takes a few seconds to make the PDF and a download shows no
  // page meanwhile — say "Generating..." briefly so the tap doesn't look ignored.
  const [preparing, setPreparing] = useState(false);
  const downloadHref = `${href}${href.includes('?') ? '&' : '?'}download=1`;

  function onDownload() {
    setPreparing(true);
    setTimeout(() => setPreparing(false), 6000);
  }

  return (
    <div style={{ display: 'flex', justifyContent: justify, gap: 8, flexWrap: 'wrap', marginBottom: 10, ...style }}>
      <a href={href} target="_blank" rel="noopener noreferrer" style={buttonStyle}>
        {`🖨️ ${t('view')}`}
      </a>
      <a href={downloadHref} onClick={onDownload} style={buttonStyle}>
        {preparing ? `⏳ ${t('generating')}` : `⬇️ ${t('download')}`}
      </a>
    </div>
  );
}
