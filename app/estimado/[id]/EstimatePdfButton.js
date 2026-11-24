'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { openPdfPreview, downloadPdf } from '../../../lib/openPdfPreview';

// The line-item table has a 560px min width and scrolls sideways on a
// phone — render the capture at desktop width so the PDF isn't clipped.
const PDF_OPTIONS = { html2canvas: { windowWidth: 800 } };

const buttonStyle = { padding: '8px 16px', background: '#fff', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#16223d' };

export default function EstimatePdfButton({ estimateNumber }) {
  const t = useTranslations('estimados.public');
  // Which action is running ('view' | 'download'), so only that button says
  // "Generating..." and both are disabled meanwhile.
  const [busy, setBusy] = useState(null);
  // iPhone only: the PDF is ready but Safari wants a fresh tap before it
  // opens the share sheet — holds the function that opens it.
  const [pendingSave, setPendingSave] = useState(null);

  async function run(kind) {
    setBusy(kind);
    try {
      const filename = `${estimateNumber}.pdf`;
      if (kind === 'download') {
        const result = await downloadPdf('estimate-doc-public', filename, PDF_OPTIONS);
        if (result?.needsTap) setPendingSave(() => result.needsTap);
      } else {
        await openPdfPreview('estimate-doc-public', filename, PDF_OPTIONS);
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
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
      <button onClick={() => run('view')} disabled={!!busy} style={buttonStyle}>
        {busy === 'view' ? `⏳ ${t('generatingLabel')}` : `🖨️ ${t('viewPdfBtn')}`}
      </button>
      {pendingSave ? (
        <button onClick={savePending} style={{ ...buttonStyle, background: '#e0972c', borderColor: '#e0972c', color: '#fff' }}>
          {`⬇️ ${t('savePdfBtn')}`}
        </button>
      ) : (
        <button onClick={() => run('download')} disabled={!!busy} style={buttonStyle}>
          {busy === 'download' ? `⏳ ${t('generatingLabel')}` : `⬇️ ${t('downloadPdfBtn')}`}
        </button>
      )}
    </div>
  );
}
