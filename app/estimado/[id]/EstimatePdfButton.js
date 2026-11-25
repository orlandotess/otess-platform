'use client';
import PdfButtons from '../../components/PdfButtons';

export default function EstimatePdfButton({ estimateId }) {
  return <PdfButtons href={`/estimado/${estimateId}/pdf`} />;
}
