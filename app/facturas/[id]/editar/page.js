export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { Suspense } from 'react';
import { supabaseServer as supabase } from '../../../../lib/supabase';
import Sidebar from '../../../Sidebar';
import InvoiceForm from '../../InvoiceForm';

export default async function EditarFacturaPage({ params }) {
  const { data: invoice } = await supabase.from('invoices').select('*').eq('id', params.id).single();

  if (!invoice) {
    return (
      <div className="admin-shell ds-facturas">
        <Sidebar />
        <main className="main-content"><p>Factura no encontrada.</p></main>
      </div>
    );
  }

  if (!['draft', 'sent'].includes(invoice.status)) {
    return (
      <div className="admin-shell ds-facturas">
        <Sidebar />
        <main className="main-content">
          <p>Esta factura ya fue {invoice.status === 'paid' ? 'pagada' : 'cancelada'} y no se puede editar.</p>
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

  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Cargando...</div>}>
      <InvoiceForm initialData={{ invoice, items: itemsWithSignedUrls }} />
    </Suspense>
  );
}
