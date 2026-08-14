import { Suspense } from 'react';
import PropuestaForm from '../PropuestaForm';
import { getTranslations } from 'next-intl/server';

export default async function NuevaPropuestaPage() {
  const t = await getTranslations('propuestas.newProposal');
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>{t('loading')}</div>}>
      <PropuestaForm />
    </Suspense>
  );
}
