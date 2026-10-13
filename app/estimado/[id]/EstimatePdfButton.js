'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { openPdfPreview } from '../../../lib/openPdfPreview';

export default function EstimatePdfButton({ estimateNumber }) {
  const t = useTranslations('estimados.public');
  const [generating, setGenerating] = useState(false);

  async function handlePdf() {
    setGenerating(true);
    try {
      await openPdfPreview('estimate-doc-public', `${estimateNumber}.pdf`, {
        // The line-item table has a 560px min width and scrolls sideways on a
        // phone — render the capture at desktop width so the PDF isn't clipped.
        html2canvas: { windowWidth: 800 },
      });
    } catch (err) {
      console.error('PDF error:', err);
    }
    setGenerating(false);
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
      <button onClick={handlePdf} disabled={generating}
        style={{ padding: '8px 16px', background: '#fff', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#16223d' }}>
        {generating ? `⏳ ${t('generatingLabel')}` : `🖨️ ${t('viewPdfBtn')}`}
      </button>
    </div>
  );
}
