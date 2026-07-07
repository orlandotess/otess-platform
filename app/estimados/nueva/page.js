import { Suspense } from 'react';
import NuevaEstimaForm from './NuevaEstimaForm';

export default function NuevaEstimaPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Cargando...</div>}>
      <NuevaEstimaForm />
    </Suspense>
  );
}
