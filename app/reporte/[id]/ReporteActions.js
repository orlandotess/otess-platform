'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { openPdfPreview } from '../../../lib/openPdfPreview';

export default function ReporteActions({ filename }) {
  const t = useTranslations('reportes.trabajoActions');
  const [generating, setGenerating] = useState(false);

  async function handlePdf() {
    setGenerating(true);
    // openPdfPreview itself fires otess:print-start/-end and waits for the
    // phase selector (and anything else listening) to re-render before the
    // html2canvas snapshot.
    try {
      await openPdfPreview('report-doc', filename);
    } catch (err) {
      console.error('PDF error:', err);
    }
    setGenerating(false);
  }

  return (
    <button onClick={handlePdf} disabled={generating}
      style={{ padding: '10px 20px', background: '#e0972c', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: generating ? 'default' : 'pointer' }}>
      {generating ? t('generating') : t('download')}
    </button>
  );
}
