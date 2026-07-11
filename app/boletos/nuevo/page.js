import { Suspense } from 'react';
import NuevoBoletoForm from './NuevoBoletoForm';

export default function NuevoBoletoPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Cargando...</div>}>
      <NuevoBoletoForm />
    </Suspense>
  );
}
