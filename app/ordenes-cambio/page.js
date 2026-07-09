export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';

const STATUS_LABEL = { borrador: 'Borrador', enviada: 'Enviada', vista: 'Vista', aprobada: 'Aprobada', rechazada: 'Rechazada' };
const STATUS_CLS = { borrador: 'badge-gray', enviada: 'badge-blue', vista: 'badge-amber', aprobada: 'badge-green', rechazada: 'badge-red' };

export default async function OrdenesCambioPage() {
  const { data: orders } = await supabase
    .from('change_orders')
    .select('id, change_order_number, title, status, total, created_at, clients(name), jobs(title)')
    .order('created_at', { ascending: false });

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Ordenes de Cambio</div>
        </div>

        {!orders || orders.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
            No hay órdenes de cambio todavía. Se crean desde la página de un trabajo.
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            {orders.map((o, i) => (
              <Link key={o.id} href={`/ordenes-cambio/${o.id}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: i < orders.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none', color: 'inherit' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{o.title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                    {o.change_order_number} · {o.clients?.name ?? 'Sin cliente'}{o.jobs?.title ? ` · ${o.jobs.title}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    ${Number(o.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <span className={`badge ${STATUS_CLS[o.status] ?? 'badge-gray'}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
