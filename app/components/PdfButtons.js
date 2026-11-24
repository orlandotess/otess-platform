'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { openPdfPreview, downloadPdf } from '../../lib/openPdfPreview';

const buttonStyle = { padding: '8px 16px', background: '#fff', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#16223d' };

// "View PDF" + "Download PDF" for the client-facing pages (estimate, invoice,
// proposal, reports). Both work on iPhone too — see lib/openPdfPreview.js:
// there "Download" opens the iOS share sheet ("Save to Files"), and if Safari
// wants a fresh tap first the button turns into "PDF ready — tap to save".
export default function PdfButtons({ elementId, filename, pdfOptions = {}, justify = 'flex-end', style }) {
  const t = useTranslations('pdfButtons');
  // Which action is running ('view' | 'download'), so only that button says
  // "Generating..." and both are disabled meanwhile.
  const [busy, setBusy] = useState(null);
  // iPhone only: the PDF is ready but Safari wants a fresh tap before it
  // opens the share sheet — holds the function that opens it.
  const [pendingSave, setPendingSave] = useState(null);

  async function run(kind) {
    setBusy(kind);
    try {
      if (kind === 'download') {
        const result = await downloadPdf(elementId, filename, pdfOptions);
        if (result?.needsTap) setPendingSave(() => result.needsTap);
      } else {
        await openPdfPreview(elementId, filename, pdfOptions);
      }
    } catch (err) {
      console.error('PDF error:', err);
    }
    setBusy(null);
  }

  async function savePending() {
    const save = pendingSave;
    setPendingSave(null);
    try {
      await save();
    } catch (err) {
      console.error('PDF error:', err);
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: justify, gap: 8, flexWrap: 'wrap', marginBottom: 10, ...style }}>
      <button onClick={() => run('view')} disabled={!!busy} style={buttonStyle}>
        {busy === 'view' ? `⏳ ${t('generating')}` : `🖨️ ${t('view')}`}
      </button>
      {pendingSave ? (
        <button onClick={savePending} style={{ ...buttonStyle, background: '#e0972c', borderColor: '#e0972c', color: '#fff' }}>
          {`⬇️ ${t('saveReady')}`}
        </button>
      ) : (
        <button onClick={() => run('download')} disabled={!!busy} style={buttonStyle}>
          {busy === 'download' ? `⏳ ${t('generating')}` : `⬇️ ${t('download')}`}
        </button>
      )}
    </div>
  );
}
