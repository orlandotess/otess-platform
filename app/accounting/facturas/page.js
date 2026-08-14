export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import FacturasTableClient from './FacturasTableClient';
import { getTranslations, getLocale } from 'next-intl/server';

const statusBadgeDefs = {
  draft:     { cls: 'badge-gray',  key: 'draft' },
  sent:      { cls: 'badge-blue',  key: 'sent' },
  paid:      { cls: 'badge-green', key: 'paid' },
  cancelled: { cls: 'badge-red',   key: 'cancelled' },
  overdue:   { cls: 'badge-red',   key: 'overdue' },
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
  const t = await getTranslations('accounting.facturasReport');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';
  const statusBadge = Object.fromEntries(
    Object.entries(statusBadgeDefs).map(([k, v]) => [k, { cls: v.cls, label: t(`status.${v.key}`) }])
  );
  const view = searchParams?.view ?? 'month';
  const year = parseInt(searchParams?.year ?? nowPR().getUTCFullYear());
  const month = searchParams?.month !== undefined && searchParams.month !== '' ? parseInt(searchParams.month) : null;
  const weekOffset = parseInt(searchParams?.week ?? '0');
  const status = searchParams?.status ?? 'all';

  let dateStart, dateEnd, periodLabel;
  const currentYear = nowPR().getUTCFullYear();
  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
  const months = Array.from({ length: 12 }, (_, i) => capitalize(new Date(2000, i, 1).toLocaleDateString(dateLocale, { month: 'long' })));

  if (view === 'week') {
    const { weekStart, weekEnd } = getWeekRange(weekOffset);
    dateStart = weekStart.toISOString().slice(0, 10);
    dateEnd = weekEnd.toISOString().slice(0, 10);
    const fmtDate = d => d.toLocaleDateString(dateLocale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    periodLabel = `${fmtDate(weekStart)} — ${fmtDate(weekEnd)}`;
  } else if (view === 'month' && month !== null) {
    dateStart = new Date(year, month, 1).toISOString().slice(0, 10);
    dateEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);
    periodLabel = `${months[month]} ${year}`;
  } else {
    dateStart = `${year}-01-01`;
    dateEnd = `${year}-12-31`;
    periodLabel = t('period.year', { year });
  }

  // PR-anchored, not the server's own timezone — a naive `new Date()` here
  // marks invoices "overdue" prematurely in the ~8pm-midnight PR window
  // whenever the server isn't running in PR time.
  const today = nowPR().toISOString().slice(0, 10);

  let query = supabase.from('invoices')
    .select('id, invoice_number, status, bill_to, subtotal_products, tax_products, subtotal_labor, tax_labor, total, issued_at, due_at, reminders_paused_at, clients(name, company, client_type)')
    .gte('issued_at', dateStart)
    .lte('issued_at', dateEnd)
    .order('issued_at', { ascending: false });

  if (status === 'overdue') query = query.eq('status', 'sent').lt('due_at', today);
  else if (status !== 'all') query = query.eq('status', status);

  const { data: invoices } = await query;
  const invs = invoices ?? [];
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const invoiceIds = invs.map(i => i.id);
  const [{ data: paymentsData }, { data: retencionesData }] = invoiceIds.length
    ? await Promise.all([
        supabase.from('payments').select('invoice_id, amount').in('invoice_id', invoiceIds),
        supabase.from('retenciones').select('invoice_id, retencion_aplicada').in('invoice_id', invoiceIds),
      ])
    : [{ data: [] }, { data: [] }];
  const collectedByInvoice = {};
  (paymentsData ?? []).forEach(p => {
    collectedByInvoice[p.invoice_id] = (collectedByInvoice[p.invoice_id] ?? 0) + Number(p.amount ?? 0);
  });
  const retenidoByInvoice = {};
  (retencionesData ?? []).forEach(r => {
    if (!r.invoice_id) return;
    retenidoByInvoice[r.invoice_id] = (retenidoByInvoice[r.invoice_id] ?? 0) + Number(r.retencion_aplicada ?? 0);
  });

  // A client's 10%-labor retención (see Retenciones) is money legally withheld
  // and remitted to Hacienda on the invoice's behalf, not an unpaid balance —
  // so it's netted out here alongside cash payments before anything counts as
  // "owed". Only invoices with a retención already logged get the credit; an
  // un-logged shortfall still shows as pendiente until someone records it.
  const owed = i => Math.max(Number(i.total ?? 0) - (collectedByInvoice[i.id] ?? 0) - (retenidoByInvoice[i.id] ?? 0), 0);
  // A draft isn't a real obligation yet (never sent to the client) and a
  // cancelled one is void, so neither counts toward Facturado/Cobrado/
  // Retenido/Pendiente — every stat below is computed from this same set,
  // which is what keeps Facturado = Cobrado + Retenido + Pendiente reconciling
  // exactly instead of drifting by whatever's still in draft.
  const owedInvs = invs.filter(i => i.status !== 'draft' && i.status !== 'cancelled');
  const totalFacturado = owedInvs.reduce((a, i) => a + Number(i.total ?? 0), 0);
  const totalCobrado = owedInvs.reduce((a, i) => a + (collectedByInvoice[i.id] ?? 0), 0);
  const totalPendiente = owedInvs.reduce((a, i) => a + owed(i), 0);
  const totalVencido = owedInvs.filter(i => i.due_at && i.due_at < today)
    .reduce((a, i) => a + owed(i), 0);
  const totalRetenido = owedInvs.reduce((a, i) => a + (retenidoByInvoice[i.id] ?? 0), 0);
  const totalIVU = owedInvs.reduce((a, i) => a + Number(i.tax_products ?? 0) + Number(i.tax_labor ?? 0), 0);

  const years = [currentYear, currentYear - 1, currentYear - 2];
  const { weekStart, weekEnd } = getWeekRange(weekOffset);

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content main-content-wide">
        <div className="page-header">
          <div>
            <div className="page-title">{t('title')}</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{periodLabel}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/accounting" className="btn btn-ghost">{t('backToDashboard')}</Link>
            <Link href="/facturas/recurrentes" className="btn btn-ghost">{t('recurring')}</Link>
            <Link href="/facturas/nueva" className="btn btn-primary">{t('newInvoice')}</Link>
          </div>
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* Vista */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{t('filters.view')}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['week', t('filters.weekly')], ['month', t('filters.monthly')], ['year', t('filters.yearly')]].map(([v, l]) => (
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
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{t('filters.week')}</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Link href={`/accounting/facturas?view=week&week=${weekOffset - 1}&status=${status}`} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>{t('filters.previous')}</Link>
                  {weekOffset !== 0 && <Link href={`/accounting/facturas?view=week&status=${status}`} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>{t('filters.current')}</Link>}
                  {weekOffset < 0 && <Link href={`/accounting/facturas?view=week&week=${weekOffset + 1}&status=${status}`} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>{t('filters.next')}</Link>}
                </div>
              </div>
            )}

            {/* Year selector */}
            {view !== 'week' && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{t('filters.year')}</label>
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
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{t('filters.month')}</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Link href={`/accounting/facturas?view=year&year=${year}&status=${status}`}
                    className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 13 }}>
                    {t('filters.fullYear')}
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
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{t('filters.status')}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['all', 'draft', 'sent', 'overdue', 'paid', 'cancelled'].map(s => (
                  <Link key={s} href={`/accounting/facturas?view=${view}&year=${year}&month=${month ?? ''}&week=${weekOffset}&status=${s}`}
                    className={`btn ${s === status ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 12px', fontSize: 12 }}>
                    {s === 'all' ? t('filters.all') : statusBadge[s]?.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">{t('stats.billed')}</div>
            <div className="stat-value">{fmt(totalFacturado)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.collected')}</div>
            <div className="stat-value" style={{ color: 'var(--ok)' }}>{fmt(totalCobrado)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.withheld')}</div>
            <div className="stat-value" style={{ color: 'var(--navy)' }}>{fmt(totalRetenido)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.pending')}</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{fmt(totalPendiente)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.overdue')}</div>
            <div className="stat-value" style={{ color: 'var(--warn)' }}>{fmt(totalVencido)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.ivuTotal')}</div>
            <div className="stat-value" style={{ color: 'var(--navy)' }}>{fmt(totalIVU)}</div>
          </div>
        </div>

        <FacturasTableClient invs={invs} totalFacturado={totalFacturado} collectedByInvoice={collectedByInvoice} retenidoByInvoice={retenidoByInvoice} />
      </main>
    </div>
  );
}
