export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';

const statusBadge = {
  draft:     { cls: 'badge-gray',  label: 'Borrador' },
  sent:      { cls: 'badge-blue',  label: 'Enviado' },
  cancelled: { cls: 'badge-red',   label: 'Cancelado' },
};

export default async function EstimadosPage() {
  const { data: estimates } = await supabase
    .from('estimates')
    .select('id, estimate_number, status, total, issued_at, valid_until, clients(name)')
    .order('created_at', { ascending: false });

  const totalDraft = estimates?.filter(e => e.status === 'draft').reduce((a, e) => a + Number(e.total ?? 0), 0) ?? 0;
  const totalSent = estimates?.filter(e => e.status === 'sent').reduce((a, e) => a + Number(e.total ?? 0), 0) ?? 0;

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Estimados</div>
          <Link href="/estimados/nueva" className="btn btn-primary">+ Nuevo estimado</Link>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat-card">
            <div className="stat-label">Total estimados</div>
            <div className="stat-value">{estimates?.length ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">En borrador</div>
            <div className="stat-value" style={{ color: 'var(--muted)', fontSize: 22 }}>${totalDraft.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Enviados</div>
            <div className="stat-value" style={{ color: 'var(--amber)', fontSize: 22 }}>${totalSent.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
        </div>

        <div className="card">
          {!estimates?.length ? (
            <div className="empty">
              <p>No hay estimados aún. <Link href="/estimados/nueva" style={{ color: 'var(--amber)' }}>Crear el primero →</Link></p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                    <th>Válida hasta</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {estimates.map(est => {
                    const b = statusBadge[est.status] ?? statusBadge.draft;
                    return (
                      <tr key={est.id}>
                        <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{est.estimate_number}</td>
                        <td>{est.clients?.name ?? '—'}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{est.issued_at ?? '—'}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{est.valid_until ?? '—'}</td>
                        <td style={{ fontWeight: 700 }}>${Number(est.total).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td><Link href={`/estimados/${est.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
