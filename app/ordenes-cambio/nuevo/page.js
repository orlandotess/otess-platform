import { Suspense } from 'react';
import ChangeOrderForm from '../ChangeOrderForm';
import { getTranslations } from 'next-intl/server';

export default async function NuevaOrdenCambioPage() {
  const t = await getTranslations('ordenesCambio.newOrder');
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>{t('loading')}</div>}>
      <ChangeOrderForm />
    </Suspense>
  );
}
