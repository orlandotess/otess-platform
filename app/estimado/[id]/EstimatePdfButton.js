'use client';
import PdfButtons from '../../components/PdfButtons';

// The line-item table has a 560px min width and scrolls sideways on a
// phone — render the capture at desktop width so the PDF isn't clipped.
const PDF_OPTIONS = { html2canvas: { windowWidth: 800 } };

export default function EstimatePdfButton({ estimateNumber }) {
  return <PdfButtons elementId="estimate-doc-public" filename={`${estimateNumber}.pdf`} pdfOptions={PDF_OPTIONS} />;
}
