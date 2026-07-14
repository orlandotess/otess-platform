'use client';
import { useState } from 'react';
import { openPdfPreview } from '../../../lib/openPdfPreview';

export default function ReporteActions({ filename }) {
  const [generating, setGenerating] = useState(false);

  async function handlePdf() {
    setGenerating(true);
    window.dispatchEvent(new Event('otess:print-start'));
    try {
      // Let listeners (e.g. the phase selector) re-render before the snapshot.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await openPdfPreview('report-doc', filename);
    } catch (err) {
      console.error('PDF error:', err);
    }
    window.dispatchEvent(new Event('otess:print-end'));
    setGenerating(false);
  }

  return (
    <button onClick={handlePdf} disabled={generating}
      style={{ padding: '10px 20px', background: '#e0972c', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: generating ? 'default' : 'pointer' }}>
      {generating ? '⏳ Generando...' : '📥 Descargar PDF'}
    </button>
  );
}
