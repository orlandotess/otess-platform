export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';

const statusBadge = {
  draft:     { cls: 'badge-gray',  label: 'Borrador' },
  sent:      { cls: 'badge-blue',  label: 'Enviada' },
  paid:      { cls: 'badge-green', label: 'Pagada' },
  cancelled: { cls: 'badge-red',   label: 'Cancelada' },
};

function statusFor(inv, today) {
  if (inv.status === 'sent' && inv.due_at && inv.due_at < today) {
    return { cls: 'badge-red', label: 'Vencida' };
  }
  return statusBadge[inv.status] ?? statusBadge.draft;
}

function formatViewedAt(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return `hoy ${d.toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString('es-PR', { month: 'short', day: 'numeric' });
}

export default async function FacturasPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: invoices }, { data: views }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, status, total, issued_at, due_at, clients(name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('invoice_views')
      .select('invoice_id, viewed_at'),
  ]);

  // Agrupar vistas por factura: conteo + última fecha
  const viewsByInvoice = {};
  (views ?? []).forEach(v => {
    if (!viewsByInvoice[v.invoice_id]) {
      viewsByInvoice[v.invoice_id] = { count: 0, lastViewedAt: null };
    }
    viewsByInvoice[v.invoice_id].count += 1;
    if (!viewsByInvoice[v.invoice_id].lastViewedAt || new Date(v.viewed_at) > new Date(viewsByInvoice[v.invoice_id].lastViewedAt)) {
      viewsByInvoice[v.invoice_id].lastViewedAt = v.viewed_at;
    }
  });

  const totalPending = invoices?.filter(i => i.status === 'sent').reduce((a, i) => a + i.total, 0) ?? 0;
  const totalPaid = invoices?.filter(i => i.status === 'paid').reduce((a, i) => a + i.total, 0) ?? 0;

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Facturas</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/facturas/recurrentes" className="btn btn-ghost">Recurrentes</Link>
            <Link href="/facturas/nueva" className="btn btn-primary">+ Nueva factura</Link>
          </div>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat-card">
            <div className="stat-label">Total facturas</div>
            <div className="stat-value">{invoices?.length ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Pendiente cobro</div>
            <div className="stat-value" style={{ color: 'var(--amber)', fontSize: 22 }}>${totalPending.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Cobrado</div>
            <div className="stat-value" style={{ color: 'var(--ok)', fontSize: 22 }}>${totalPaid.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
        </div>

        <div className="card">
          {!invoices?.length ? (
            <div className="empty">
              <div className="empty-glyph">🧾</div>
              <h3>No hay facturas aún</h3>
              <p>Cuando factures a un cliente, aparecerá aquí.</p>
              <Link href="/facturas/nueva" className="btn btn-primary btn-sm">+ Crear factura</Link>
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
                    <th>Vistas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const b = statusFor(inv, today);
                    const viewInfo = viewsByInvoice[inv.id];
                    return (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{inv.invoice_number}</td>
                        <td>{inv.clients?.name ?? '—'}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{inv.issued_at ?? '—'}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{inv.due_at ?? '—'}</td>
                        <td style={{ fontWeight: 700 }}>${Number(inv.total).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td>
                          {viewInfo ? (
                            <span
                              title={`Última vista: ${formatViewedAt(viewInfo.lastViewedAt)}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--navy)', fontWeight: 600, background: '#eef1f8', padding: '3px 8px', borderRadius: 12 }}
                            >
                              👁️ {viewInfo.count} · {formatViewedAt(viewInfo.lastViewedAt)}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                          )}
                        </td>
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
