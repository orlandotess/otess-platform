export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../../lib/supabase';
import Sidebar from '../../../Sidebar';
import InvoiceForm from '../../InvoiceForm';
import { getTranslations } from 'next-intl/server';

export default async function EditarFacturaPage(props) {
  const params = await props.params;
  const t = await getTranslations('facturas.editInvoice');
  const { data: invoice } = await supabase.from('invoices').select('*').eq('id', params.id).single();

  if (!invoice) {
    return (
      <div className="admin-shell ds-facturas">
        <Sidebar />
        <main className="main-content"><p>{t('notFound')}</p></main>
      </div>
    );
  }

  if (!['draft', 'sent'].includes(invoice.status)) {
    return (
      <div className="admin-shell ds-facturas">
        <Sidebar />
        <main className="main-content">
          <p>{invoice.status === 'paid' ? t('alreadyPaid') : t('alreadyCancelled')}</p>
        </main>
      </div>
    );
  }

  const { data: items } = await supabase.from('invoice_line_items').select('*').eq('invoice_id', params.id).order('sort_order');
  const itemsWithSignedUrls = await Promise.all(
    (items ?? []).map(async it => {
      if (!it.photo_url) return it;
      const { data } = await supabase.storage.from('Job-photos').createSignedUrl(it.photo_url, 3600);
      return { ...it, photo_signed_url: data?.signedUrl ?? null };
    })
  );

  return <InvoiceForm initialData={{ invoice, items: itemsWithSignedUrls }} />;
}
