export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { Suspense } from 'react';
import { supabaseServer as supabase } from '../../../../lib/supabase';
import Sidebar from '../../../Sidebar';
import ChangeOrderForm from '../../ChangeOrderForm';

export default async function EditarOrdenCambioPage({ params }) {
  const { data: order } = await supabase
    .from('change_orders')
    .select('*, clients(name, client_type), jobs(id, title)')
    .eq('id', params.id)
    .single();

  if (!order) {
    return (
      <div className="admin-shell">
        <Sidebar />
        <main className="main-content"><p>Orden de cambio no encontrada.</p></main>
      </div>
    );
  }

  if (!['borrador', 'enviada', 'vista'].includes(order.status)) {
    return (
      <div className="admin-shell">
        <Sidebar />
        <main className="main-content">
          <p>Esta orden de cambio ya fue {order.status === 'aprobada' ? 'aprobada' : 'rechazada'} y no se puede editar.</p>
        </main>
      </div>
    );
  }

  const { data: items } = await supabase.from('change_order_line_items').select('*').eq('change_order_id', params.id).order('sort_order');
  const itemsWithSignedUrls = await Promise.all(
    (items ?? []).map(async it => {
      if (!it.photo_url) return it;
      const { data } = await supabase.storage.from('Job-photos').createSignedUrl(it.photo_url, 3600);
      return { ...it, photo_signed_url: data?.signedUrl ?? null };
    })
  );

  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Cargando...</div>}>
      <ChangeOrderForm initialData={{ order, items: itemsWithSignedUrls }} />
    </Suspense>
  );
}
