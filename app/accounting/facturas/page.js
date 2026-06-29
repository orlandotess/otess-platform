export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';

const statusBadge = {
  draft:     { cls: 'badge-gray',  label: 'Borrador' },
  sent:      { cls: 'badge-blue',  label: 'Enviada' },
  paid:      { cls: 'badge-green', label: 'Pagada' },
  cancelled: { cls: 'badge-red',   label: 'Cancelada' },
};

function getWeekRange(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = (day + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - diffToMon + (offset * 7));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

export default async function AccountingFacturas({ searchParams }) {
  const view = searchParams?.view ?? 'month';
  const year = parseInt(searchParams?.year ?? new Date().getFullYear());
  const month = searchParams?.month !== undefined && searchParams.month !== '' ? parseInt(searchParams.month) : null;
  const weekOffset = parseInt(searchParams?.week ?? '0');
  const status = searchParams?.status ?? 'all';

  let dateStart, dateEnd, periodLabel;
  const currentYear = new Date().getFullYear();
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  if (view === 'week') {
    const { weekStart, weekEnd } = getWeekRange(weekOffset);
    dateStart = weekStart.toISOString().slice(0, 10);
    dateEnd = weekEnd.toISOString().slice(0, 10);
    const fmtDate = d => d.toLocaleDateString('es-PR', { weekday: 'short', month: 'short', day: 'numeric' });
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

  let query = supabase.from('invoices')
    .select('id, invoice_number, status, bill_to, subtotal_products, tax_products, subtotal_labor, tax_labor, total, issued_at, due_at, clients(name, company, client_type)')
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

  const years = [currentYear, currentYear - 1, currentYear - 2];
  const { weekStart, weekEnd } = getWeekRange(weekOffset);

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">Facturas</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{periodLabel}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/accounting" className="btn btn-ghost">← Dashboard</Link>
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
                <div style={{ display: 'flex
