import { Suspense } from 'react';
import EstimateForm from '../EstimateForm';
import { getTranslations } from 'next-intl/server';

export default async function NuevaEstimaPage() {
  const t = await getTranslations('estimados.newEstimate');
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>{t('loading')}</div>}>
      <EstimateForm />
    </Suspense>
  );
}
