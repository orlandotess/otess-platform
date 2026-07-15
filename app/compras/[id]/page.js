export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import CompraDetailClient from './detail-client';

export default async function CompraDetailPage({ params }) {
  const { data: order } = await supabase
    .from('purchase_orders')
    .select('*, vendors(id, name, contact_name, email, phone), purchase_order_items(*)')
    .eq('id', params.id)
    .single();

  if (!order) {
    return (
      <div className="admin-shell">
        <Sidebar />
        <main className="main-content">
          <p>Orden de compra no encontrada.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <CompraDetailClient order={order} />
      </main>
    </div>
  );
}
