import { Suspense } from 'react';
import EstimateForm from '../EstimateForm';

export default function NuevaEstimaPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Cargando...</div>}>
      <EstimateForm />
    </Suspense>
  );
}
