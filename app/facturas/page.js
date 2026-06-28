export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';

const statusBadge = {
  draft:     { cls: 'badge-gray',  label: 'Borrador' },
  sent:      { cls: 'badge-blue',  label: 'Enviada' },
  paid:      { cls: 'badge-green', label: 'Pagada' },
  cancelled: { cls: 'badge-red',   label: 'Cancelada' },
};

export default async function FacturasPage() {
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, total, issued_at, due_at, clients(name)')
    .order('created_at', { ascending: false });

  const totalPending = invoices?.filter(i => i.status === 'sent').reduce((a, i) => a + i.total, 0) ?? 0;
  const totalPaid = invoices?.filter(i => i.status === 'paid').reduce((a, i) => a + i.total, 0) ?? 0;

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Facturas</div>
          <Link href="/facturas/nueva" className="btn btn-primary">+ Nueva factura</Link>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat-card">
            <div className="stat-label">Total facturas</div>
            <div className="stat-value">{invoices?.length ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Pendiente cobro</div>
            <div className="stat-value" style={{ color: 'var(--amber)', fontSize: 22 }}>${totalPending.toFixed(2)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Cobrado</div>
            <div className="stat-value" style={{ color: 'var(--ok)', fontSize: 22 }}>${totalPaid.toFixed(2)}</div>
          </div>
        </div>

        <div className="card">
          {!invoices?.length ? (
            <div className="empty">
              <p>No hay facturas aún. <Link href="/facturas/nueva" style={{ color: 'var(--amber)' }}>Crear la primera →</Link></p>
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
                    <th>Vence</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const b = statusBadge[inv.status] ?? statusBadge.draft;
                    return (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{inv.invoice_number}</td>
                        <td>{inv.clients?.name ?? '—'}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{inv.issued_at ?? '—'}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{inv.due_at ?? '—'}</td>
                        <td style={{ fontWeight: 700 }}>${Number(inv.total).toFixed(2)}</td>
                        <td><Link href={`/facturas/${inv.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
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
