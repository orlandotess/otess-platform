export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';

const STATUS_BADGE = { pendiente: 'badge-gray', ordenado: 'badge-blue', recibido: 'badge-green', cancelado: 'badge-red' };
const STATUS_LABELS = { pendiente: 'Pendiente', ordenado: 'Ordenado', recibido: 'Recibido', cancelado: 'Cancelado' };

export default async function ComprasPage() {
  const { data: orders } = await supabase
    .from('purchase_orders')
    .select('id, order_number, status, source_label, created_at, vendors(name), purchase_order_items(quantity, unit_price)')
    .order('created_at', { ascending: false });

  const rows = (orders ?? []).map(o => ({
    ...o,
    total: (o.purchase_order_items ?? []).reduce((sum, it) => sum + (it.quantity || 0) * (it.unit_price || 0), 0),
  }));

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Compras</div>
          <Link href="/compras/proveedores" className="btn btn-ghost">Proveedores</Link>
        </div>

        {rows.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
            No hay órdenes de compra todavía. Se generan desde una Propuesta aprobada o un Trabajo.
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            {rows.map((o, i) => (
              <Link key={o.id} href={`/compras/${o.id}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none', color: 'inherit' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{o.vendors?.name ?? 'Proveedor sin nombre'}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                    {o.order_number} · {o.source_label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    ${o.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <span className={`badge ${STATUS_BADGE[o.status] ?? 'badge-gray'}`}>
                  {STATUS_LABELS[o.status] ?? o.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
