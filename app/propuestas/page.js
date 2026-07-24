export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';

const STATUS_BADGE = { borrador: 'badge-gray', enviada: 'badge-blue', vista: 'badge-amber', cambios_requeridos: 'badge-amber', expirada: 'badge-gray', aprobada: 'badge-green', rechazada: 'badge-red', completada: 'badge-dark' };
const STATUS_LABELS = { borrador: 'Borrador', enviada: 'Enviada', vista: 'Vista', cambios_requeridos: 'Cambios requeridos', expirada: 'Expirada', aprobada: 'Aprobada', rechazada: 'Rechazada', completada: 'Completada' };
const EXPIRABLE_STATUSES = ['enviada', 'vista', 'cambios_requeridos'];

export default async function PropuestasPage({ searchParams }) {
  const showArchived = searchParams?.archived === '1';

  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, proposal_number, title, status, valid_until, archived_at, created_at, sent_at, approved_at, clients(name), proposal_options(id, name, is_recommended, proposal_line_items(quantity, unit_price))')
    .order('created_at', { ascending: false });

  const today = new Date().toISOString().split('T')[0];
  const toExpire = (proposals ?? []).filter(p => p.valid_until && p.valid_until < today && EXPIRABLE_STATUSES.includes(p.status));
  if (toExpire.length) {
    await supabase.from('proposals').update({ status: 'expirada' }).in('id', toExpire.map(p => p.id));
    const expiredIds = new Set(toExpire.map(p => p.id));
    (proposals ?? []).forEach(p => { if (expiredIds.has(p.id)) p.status = 'expirada'; });
  }

  const archivedCount = (proposals ?? []).filter(p => p.archived_at).length;
  const visible = (proposals ?? []).filter(p => showArchived ? !!p.archived_at : !p.archived_at);

  const rows = visible.map(p => {
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
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {showArchived ? (
              <Link href="/propuestas" className="btn btn-ghost">← Ver activas</Link>
            ) : (
              <Link href="/propuestas?archived=1" className="btn btn-ghost">📦 Ver archivadas{archivedCount ? ` (${archivedCount})` : ''}</Link>
            )}
            <Link href="/propuestas/empresa" className="btn btn-ghost">⚙ Empresa</Link>
            <Link href="/facturas/nueva" className="btn btn-ghost">+ Nueva factura</Link>
            <Link href="/propuestas/nuevo" className="btn btn-primary">+ Nueva propuesta</Link>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
            {showArchived ? 'No hay propuestas archivadas.' : 'No hay propuestas todavía.'}
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

