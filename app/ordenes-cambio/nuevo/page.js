import { Suspense } from 'react';
import ChangeOrderForm from '../ChangeOrderForm';

export default function NuevaOrdenCambioPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Cargando...</div>}>
      <ChangeOrderForm />
    </Suspense>
  );
}
