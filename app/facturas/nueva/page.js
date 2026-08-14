import { Suspense } from 'react';
import InvoiceForm from '../InvoiceForm';
import { getTranslations } from 'next-intl/server';

export default async function NuevaFacturaPage() {
  const t = await getTranslations('facturas.newInvoice');
  return (
    <Suspense fallback={<div style={{padding:40}}>{t('loading')}</div>}>
      <InvoiceForm />
    </Suspense>
  );
}
