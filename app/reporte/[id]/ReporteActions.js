'use client';
import PdfButtons from '../../components/PdfButtons';

// openPdfPreview/downloadPdf fire otess:print-start/-end and wait for the
// phase selector (and anything else listening) to re-render before the
// html2canvas snapshot.
export default function ReporteActions({ filename }) {
  return <PdfButtons elementId="report-doc" filename={filename} style={{ marginBottom: 0 }} />;
}
