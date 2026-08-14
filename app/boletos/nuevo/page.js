import { Suspense } from 'react';
import NuevoBoletoForm from './NuevoBoletoForm';
import { getTranslations } from 'next-intl/server';

export default async function NuevoBoletoPage() {
  const t = await getTranslations('boletos.newTicket');
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>{t('loading')}</div>}>
      <NuevoBoletoForm />
    </Suspense>
  );
}
