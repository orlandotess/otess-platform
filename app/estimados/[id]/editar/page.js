export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { Suspense } from 'react';
import { supabaseServer as supabase } from '../../../../lib/supabase';
import Sidebar from '../../../Sidebar';
import EstimateForm from '../../EstimateForm';

export default async function EditarEstimadoPage({ params }) {
  const { data: estimate } = await supabase.from('estimates').select('*').eq('id', params.id).single();

  if (!estimate) {
    return (
      <div className="admin-shell ds-estimados">
        <Sidebar />
        <main className="main-content"><p>Estimado no encontrado.</p></main>
      </div>
    );
  }

  if (!['draft', 'sent'].includes(estimate.status)) {
    const statusLabel = { accepted: 'aceptado', cancelled: 'cancelado', converted: 'convertido a trabajo' };
    return (
      <div className="admin-shell ds-estimados">
        <Sidebar />
        <main className="main-content">
          <p>Este estimado ya fue {statusLabel[estimate.status] ?? estimate.status} y no se puede editar.</p>
        </main>
      </div>
    );
  }

  const { data: items } = await supabase.from('estimate_line_items').select('*').eq('estimate_id', params.id).order('sort_order');
  const itemsWithSignedUrls = await Promise.all(
    (items ?? []).map(async it => {
      if (!it.photo_url) return it;
      const { data } = await supabase.storage.from('Job-photos').createSignedUrl(it.photo_url, 3600);
      return { ...it, photo_signed_url: data?.signedUrl ?? null };
    })
  );

  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Cargando...</div>}>
      <EstimateForm initialData={{ estimate, items: itemsWithSignedUrls }} />
    </Suspense>
  );
}
