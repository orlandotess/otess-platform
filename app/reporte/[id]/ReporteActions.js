'use client';
import PdfButtons from '../../components/PdfButtons';

// href: this report's server-made PDF (/<route>/<id>/pdf) — see lib/serverPdf.js.
export default function ReporteActions({ href }) {
  return <PdfButtons href={href} style={{ marginBottom: 0 }} />;
}
