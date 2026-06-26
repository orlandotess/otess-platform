import { Suspense } from 'react';
import NuevaFacturaForm from './NuevaFacturaForm';

export default function NuevaFacturaPage() {
  return (
    <Suspense fallback={<div style={{padding:40}}>Cargando...</div>}>
      <NuevaFacturaForm />
    </Suspense>
  );
}
