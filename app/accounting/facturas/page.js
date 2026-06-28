
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';

const statusBadge = {
  draft:     { cls: 'badge-gray',  label: 'Borrador' },
  sent:      { cls: 'badge-blue',  label: 'Enviada' },
  paid:      { cls: 'badge-green', label: 'Pagada' },
  cancelled: { cls: 'badge-red',   label: 'Cancelada' },
};

export default async function AccountingFacturas({ searchParams }) {
  const year = parseInt(searchParams?.year ?? new Date().getFullYear());
  const month = searchParams?.month ? parseInt(searchParams.month) : null;
  const status = searchParams?.status ?? 'all';

  // Build date range
  let dateStart, dateEnd;
  if (month !== null) {
    dateStart = new Date(year, month, 1).toISOString().slice(0, 10);
    dateEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);
  } else {
    dateStart = `${year}-01-01`;
    dateEnd = `${year}-12-31`;
  }

  let query = supabase.from('invoices')
    .select('id, invoice_number, status, subtotal_products, tax_products, subtotal_labor, tax_labor, total, issued_at, due_at, clients(name, client_type)')
    .gte('issued_at', dateStart)
    .lte('issued_at', dateEnd)
    .order('issued_at', { ascending: false });

  if (status !== 'all') query = query.eq('status', status);

  const { data: invoices } = await query;
  const invs = invoices ?? [];

  const fmt = n => `$${Number(n ?? 0).toFixed(2)}`;

  const totalFacturado = invs.reduce((a, i) => a + Number(i.total ?? 0), 0);
  const totalCobrado = invs.filter(i => i.status === 'paid').reduce((a, i) => a + Number(i.total ?? 0), 0);
  const totalPendiente = invs.filter(i => i.status === 'sent').reduce((a, i) => a + Number(i.total ?? 0), 0);
  const totalIVU = invs.reduce((a, i) => a + Number(i.tax_products ?? 0) + Number(i.tax_labor ?? 0), 0);

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">Facturas</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
              {month !== null ? `${months[month]} ${year}` : `Año ${year}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/accounting" className="btn btn-ghost">← Dashboard</Link>
            <Link href="/facturas/nueva" className="btn btn-primary">+ Nueva factura</Link>
          </div>
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Año</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {years.map(y => (
                  <Link key={y} href={`/accounting/facturas?year=${y}${month !== null ? `&month=${month}` : ''}&status=${status}`}
                    className={`btn ${y === year ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13 }}>
                    {y}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Mes</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Link href={`/accounting/facturas?year=${year}&status=${status}`}
                  className={`btn ${month === null ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13 }}>
                  Todo el año
                </Link>
                {months.map((m, i) => (
                  <Link key={i} href={`/accounting/facturas?year=${year}&month=${i}&status=${status}`}
                    className={`btn ${month === i ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 10px', fontSize: 12 }}>
                    {m.slice(0, 3)}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Estado</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['all', 'draft', 'sent', 'paid', 'cancelled'].map(s => (
                  <Link key={s} href={`/accounting/facturas?year=${year}${month !== null ? `&month=${month}` : ''}&status=${s}`}
                    className={`btn ${s === status ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 12px', fontSize: 12 }}>
                    {s === 'all' ? 'Todas' : statusBadge[s]?.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">Facturado</div>
            <div className="stat-value">{fmt(totalFacturado)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Cobrado</div>
            <div className="stat-value" style={{ color: 'var(--ok)' }}>{fmt(totalCobrado)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Pendiente</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{fmt(totalPendiente)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">IVU Total</div>
            <div className="stat-value" style={{ color: 'var(--navy)' }}>{fmt(totalIVU)}</div>
          </div>
        </div>

        {/* Table */}
        <div className="card">
          {invs.length === 0 ? (
            <div className="empty"><p>No hay facturas para este período.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                    <th style={{ textAlign: 'right' }}>IVU Prod</th>
                    <th style={{ textAlign: 'right' }}>IVU Labor</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invs.map(inv => {
                    const b = statusBadge[inv.status] ?? statusBadge.draft;
                    const subtotal = Number(inv.subtotal_products ?? 0) + Number(inv.subtotal_labor ?? 0);
                    return (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{inv.invoice_number}</td>
                        <td style={{ fontWeight: 600 }}>{inv.clients?.name ?? '—'}</td>
                        <td><span className={`badge ${inv.clients?.client_type === 'b2b' ? 'badge-blue' : 'badge-gray'}`}>{inv.clients?.client_type === 'b2b' ? 'B2B' : 'Final'}</span></td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{inv.issued_at ?? '—'}</td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(subtotal)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(inv.tax_products)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(inv.tax_labor)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(inv.total)}</td>
                        <td><Link href={`/facturas/${inv.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td colSpan={5} style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', paddingTop: 12 }}>TOTALES</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(invs.reduce((a, i) => a + Number(i.subtotal_products ?? 0) + Number(i.subtotal_labor ?? 0), 0))}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(invs.reduce((a, i) => a + Number(i.tax_products ?? 0), 0))}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(invs.reduce((a, i) => a + Number(i.tax_labor ?? 0), 0))}</td>
                    <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: 'var(--navy)', paddingTop: 12 }}>{fmt(totalFacturado)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
