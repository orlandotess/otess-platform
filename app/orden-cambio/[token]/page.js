export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import OrdenCambioPublicClient from './public-client';

export default async function OrdenCambioPublicPage({ params }) {
  const { data: order } = await supabase
    .from('change_orders')
    .select('*, clients(name, email, phone, company, client_type)')
    .eq('public_token', params.token)
    .single();

  if (!order) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <p>Orden de cambio no encontrada.</p>
      </div>
    );
  }

  const isExpired = order.valid_until && order.status !== 'aprobada' && new Date(order.valid_until + 'T23:59:59') < new Date();
  if (isExpired) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system,sans-serif', background: '#fafafa', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, maxWidth: 420, textAlign: 'center', border: '1px solid #eee' }}>
          <div style={{ fontSize: 32, marginBottom: 12, color: '#999' }}>⏳</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#16223d', marginBottom: 8 }}>Esta orden de cambio expiró</div>
          <p style={{ fontSize: 14, color: '#888' }}>Era válida hasta el {new Date(order.valid_until + 'T00:00:00').toLocaleDateString('es-PR', { dateStyle: 'long' })}. Contáctanos si necesitas una orden actualizada.</p>
        </div>
      </div>
    );
  }

  const { data: items } = await supabase.from('change_order_line_items').select('*').eq('change_order_id', order.id).order('sort_order');

  if (!order.viewed_at) {
    await supabase.from('change_orders').update({ viewed_at: new Date().toISOString(), status: order.status === 'enviada' ? 'vista' : order.status }).eq('id', order.id);
  }

  const itemsWithSignedUrls = await Promise.all(
    (items ?? []).map(async it => {
      if (!it.photo_url) return it;
      const { data } = await supabase.storage.from('Job-photos').createSignedUrl(it.photo_url, 3600);
      return { ...it, photo_signed_url: data?.signedUrl ?? null };
    })
  );

  return <OrdenCambioPublicClient order={order} items={itemsWithSignedUrls} />;
}
