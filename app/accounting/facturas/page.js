export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import FacturasTableClient from './FacturasTableClient';

const statusBadge = {
  draft:     { cls: 'badge-gray',  label: 'Borrador' },
  sent:      { cls: 'badge-blue',  label: 'Enviada' },
  paid:      { cls: 'badge-green', label: 'Pagada' },
  cancelled: { cls: 'badge-red',   label: 'Cancelada' },
  overdue:   { cls: 'badge-red',   label: 'Vencidas' },
};

// Anchored to Puerto Rico's fixed UTC-4 offset via UTC methods (matches
// admin/timesheet, accounting/payroll, and the Dashboard) so "today" —
// and the default week/year shown — doesn't roll over up to 4 hours early
// relative to PR time depending on the server's own timezone. weekStart/
// weekEnd are then real UTC instants anchored to PR-calendar-day midnight,
// so anything reading them back (fmtDate below) must use UTC too.
function getWeekRange(offset = 0) {
  const now = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const day = now.getUTCDay();
  const diffToMon = (day + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - diffToMon + (offset * 7));
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

const nowPR = () => new Date(Date.now() - 4 * 60 * 60 * 1000);

export default async function AccountingFacturas({ searchParams }) {
  const view = searchParams?.view ?? 'month';
  const year = parseInt(searchParams?.year ?? nowPR().getUTCFullYear());
  const month = searchParams?.month !== undefined && searchParams.month !== '' ? parseInt(searchParams.month) : null;
  const weekOffset = parseInt(searchParams?.week ?? '0');
  const status = searchParams?.status ?? 'all';

  let dateStart, dateEnd, periodLabel;
  const currentYear = nowPR().getUTCFullYear();
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  if (view === 'week') {
    const { weekStart, weekEnd } = getWeekRange(weekOffset);
    dateStart = weekStart.toISOString().slice(0, 10);
    dateEnd = weekEnd.toISOString().slice(0, 10);
    const fmtDate = d => d.toLocaleDateString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    periodLabel = `${fmtDate(weekStart)} — ${fmtDate(weekEnd)}`;
  } else if (view === 'month' && month !== null) {
    dateStart = new Date(year, month, 1).toISOString().slice(0, 10);
    dateEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);
    periodLabel = `${months[month]} ${year}`;
  } else {
    dateStart = `${year}-01-01`;
    dateEnd = `${year}-12-31`;
    periodLabel = `Año ${year}`;
  }

  // PR-anchored, not the server's own timezone — a naive `new Date()` here
  // marks invoices "overdue" prematurely in the ~8pm-midnight PR window
  // whenever the server isn't running in PR time.
  const today = nowPR().toISOString().slice(0, 10);

  let query = supabase.from('invoices')
    .select('id, invoice_number, status, bill_to, subtotal_products, tax_products, subtotal_labor, tax_labor, total, issued_at, due_at, clients(name, company, client_type)')
    .gte('issued_at', dateStart)
    .lte('issued_at', dateEnd)
    .order('issued_at', { ascending: false });

  if (status === 'overdue') query = query.eq('status', 'sent').lt('due_at', today);
  else if (status !== 'all') query = query.eq('status', status);

  const { data: invoices } = await query;
  const invs = invoices ?? [];
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const invoiceIds = invs.map(i => i.id);
  const { data: paymentsData } = invoiceIds.length
    ? await supabase.from('payments').select('invoice_id, amount').in('invoice_id', invoiceIds)
    : { data: [] };
  const collectedByInvoice = {};
  (paymentsData ?? []).forEach(p => {
    collectedByInvoice[p.invoice_id] = (collectedByInvoice[p.invoice_id] ?? 0) + Number(p.amount ?? 0);
  });

  const totalFacturado = invs.reduce((a, i) => a + Number(i.total ?? 0), 0);
  const totalCobrado = invs.reduce((a, i) => a + (collectedByInvoice[i.id] ?? 0), 0);
  const totalPendiente = invs.filter(i => i.status === 'sent')
    .reduce((a, i) => a + Number(i.total ?? 0) - (collectedByInvoice[i.id] ?? 0), 0);
  const totalVencido = invs.filter(i => i.status === 'sent' && i.due_at && i.due_at < today)
    .reduce((a, i) => a + Number(i.total ?? 0) - (collectedByInvoice[i.id] ?? 0), 0);
  const totalIVU = invs.reduce((a, i) => a + Number(i.tax_products ?? 0) + Number(i.tax_labor ?? 0), 0);

  const years = [currentYear, currentYear - 1, currentYear - 2];
  const { weekStart, weekEnd } = getWeekRange(weekOffset);

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content main-content-wide">
        <div className="page-header">
          <div>
            <div className="page-title">Facturas</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{periodLabel}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/accounting" className="btn btn-ghost">← Dashboard</Link>
            <Link href="/facturas/recurrentes" className="btn btn-ghost">Recurrentes</Link>
            <Link href="/facturas/nueva" className="btn btn-primary">+ Nueva factura</Link>
          </div>
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* Vista */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Vista</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['week','Semanal'],['month','Mensual'],['year','Anual']].map(([v, l]) => (
                  <Link key={v} href={`/accounting/facturas?view=${v}&year=${year}&month=${month ?? ''}&status=${status}`}
                    className={`btn ${v === view ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13 }}>
                    {l}
                  </Link>
                ))}
              </div>
            </div>

            {/* Week navigation */}
            {view === 'week' && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Semana</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Link href={`/accounting/facturas?view=week&week=${weekOffset - 1}&status=${status}`} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>← Anterior</Link>
                  {weekOffset !== 0 && <Link href={`/accounting/facturas?view=week&status=${status}`} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>Actual</Link>}
                  {weekOffset < 0 && <Link href={`/accounting/facturas?view=week&week=${weekOffset + 1}&status=${status}`} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>Siguiente →</Link>}
                </div>
              </div>
            )}

            {/* Year selector */}
            {view !== 'week' && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Año</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {years.map(y => (
                    <Link key={y} href={`/accounting/facturas?view=${view}&year=${y}&month=${month ?? ''}&status=${status}`}
                      className={`btn ${y === year ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13 }}>
                      {y}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Month selector */}
            {view === 'month' && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Mes</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Link href={`/accounting/facturas?view=year&year=${year}&status=${status}`}
                    className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 13 }}>
                    Todo el año
                  </Link>
                  {months.map((m, i) => (
                    <Link key={i} href={`/accounting/facturas?view=month&year=${year}&month=${i}&status=${status}`}
                      className={`btn ${month === i ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 10px', fontSize: 12 }}>
                      {m.slice(0, 3)}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Status */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Estado</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['all', 'draft', 'sent', 'overdue', 'paid', 'cancelled'].map(s => (
                  <Link key={s} href={`/accounting/facturas?view=${view}&year=${year}&month=${month ?? ''}&week=${weekOffset}&status=${s}`}
                    className={`btn ${s === status ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 12px', fontSize: 12 }}>
                    {s === 'all' ? 'Todas' : statusBadge[s]?.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 20 }}>
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
            <div className="stat-label">Vencido</div>
            <div className="stat-value" style={{ color: 'var(--warn)' }}>{fmt(totalVencido)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">IVU Total</div>
            <div className="stat-value" style={{ color: 'var(--navy)' }}>{fmt(totalIVU)}</div>
          </div>
        </div>

        <FacturasTableClient invs={invs} totalFacturado={totalFacturado} />
      </main>
    </div>
  );
}
