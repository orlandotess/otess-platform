import { Suspense } from 'react';
import NuevaPropuestaForm from './NuevaPropuestaForm';

export default function NuevaPropuestaPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Cargando...</div>}>
      <NuevaPropuestaForm />
    </Suspense>
  );
}
