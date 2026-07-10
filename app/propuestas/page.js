export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';

const STATUS_BADGE = { borrador: 'badge-gray', enviada: 'badge-blue', vista: 'badge-amber', aprobada: 'badge-green', rechazada: 'badge-red' };
const STATUS_LABELS = { borrador: 'Borrador', enviada: 'Enviada', vista: 'Vista', aprobada: 'Aprobada', rechazada: 'Rechazada' };

export default async function PropuestasPage() {
  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, proposal_number, title, status, created_at, sent_at, approved_at, clients(name), proposal_options(id, name, is_recommended, proposal_line_items(quantity, unit_price))')
    .order('created_at', { ascending: false });

  const rows = (proposals ?? []).map(p => {
    const totals = (p.proposal_options ?? []).map(o => ({
      name: o.name,
      total: (o.proposal_line_items ?? []).reduce((sum, li) => sum + (li.quantity || 0) * (li.unit_price || 0), 0),
    }));
    return { ...p, totals };
  });

  return (
    <div className="admin-shell ds-propuestas">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Propuestas</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/facturas/nueva" className="btn btn-ghost">+ Nueva factura</Link>
            <Link href="/propuestas/nuevo" className="btn btn-primary">+ Nueva propuesta</Link>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
            No hay propuestas todavía.
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            {rows.map((p, i) => (
              <Link key={p.id} href={`/propuestas/${p.id}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none', color: 'inherit' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{p.title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                    {p.proposal_number} · {p.clients?.name ?? 'Sin cliente'}
                  </div>
                  {p.totals.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      {p.totals.map(t => `${t.name}: $${t.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`).join('  ·  ')}
                    </div>
                  )}
                </div>
                <span className={`badge ${STATUS_BADGE[p.status] ?? 'badge-gray'}`}>
                  {STATUS_LABELS[p.status] ?? p.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

