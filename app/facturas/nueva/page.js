import { Suspense } from 'react';
import InvoiceForm from '../InvoiceForm';

export default function NuevaFacturaPage() {
  return (
    <Suspense fallback={<div style={{padding:40}}>Cargando...</div>}>
      <InvoiceForm />
    </Suspense>
  );
}
