
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import ExportIVUButton from './ExportIVUButton';
import IVUInvoiceTableClient from './IVUInvoiceTableClient';
import IVUPaymentTracker from './IVUPaymentTracker';
import { computeInvoiceIVU, buildIVUCollectionEvents } from '../../../lib/ivu';
import { getTranslations, getLocale } from 'next-intl/server';

// Periods before this keep the old rule (an invoice's whole IVU on the month
// it was paid off), so months already filed with Hacienda still report exactly
// what was filed. IVU earned before the cutoff but not yet reported rides onto
// the first payment on or after it, so nothing is lost at the seam.
const IVU_PRORATE_FROM = '2026-01-01';

export default async function AccountingIVU(props) {
  const searchParams = await props.searchParams;
  const t = await getTranslations('accounting.ivu');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';
  const year = parseInt(searchParams?.year ?? new Date().getFullYear());
  const month = searchParams?.month !== undefined ? parseInt(searchParams.month) : null;

  let dateStart, dateEnd;
  if (month !== null) {
    dateStart = new Date(year, month, 1).toISOString().slice(0, 10);
    dateEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);
  } else {
    dateStart = `${year}-01-01`;
    dateEnd = `${year}-12-31`;
  }

  // Cash basis, per collection: each payment reports its own share of the
  // invoice's IVU in the month the money came in, so a 50% deposit reports
  // half now instead of the whole invoice landing in whatever month it's
  // finally paid off. See buildIVUCollectionEvents in lib/ivu.js for how a
  // payment's share is worked out and how retención is handled.
  const [{ data: allInvoices }, { data: ivuPayments }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, issued_at, status, total, subtotal_labor, tax_labor, subtotal_products, tax_products, clients(name, client_type)')
      .neq('status', 'cancelled')
      .order('issued_at', { ascending: false }),
    supabase.from('ivu_payments').select('*').eq('year', year),
  ]);

  const invoiceIds = (allInvoices ?? []).map(inv => inv.id);
  const [{ data: paymentRows }, { data: retencionRows }] = invoiceIds.length
    ? await Promise.all([
        supabase.from('payments').select('invoice_id, amount, paid_at').in('invoice_id', invoiceIds),
        supabase.from('retenciones').select('invoice_id, retencion_aplicada').in('invoice_id', invoiceIds),
      ])
    : [{ data: [] }, { data: [] }];

  const paymentsByInvoice = {};
  (paymentRows ?? []).forEach(p => { (paymentsByInvoice[p.invoice_id] ??= []).push(p); });
  const retainedByInvoice = {};
  (retencionRows ?? []).forEach(r => {
    retainedByInvoice[r.invoice_id] = (retainedByInvoice[r.invoice_id] ?? 0) + Number(r.retencion_aplicada ?? 0);
  });

  const events = buildIVUCollectionEvents(allInvoices, paymentsByInvoice, retainedByInvoice, { prorateFrom: IVU_PRORATE_FROM });
  const invoiceById = Object.fromEntries((allInvoices ?? []).map(inv => [inv.id, inv]));

  // One row per invoice with money collected in this period, carrying the
  // slice of its IVU earned here (ivuFraction) so the table can scale the
  // invoice's own figures down to what this period actually earned.
  const periodByInvoice = {};
  events
    .filter(e => e.date >= dateStart && e.date <= dateEnd)
    .forEach(e => {
      const row = (periodByInvoice[e.invoiceId] ??= { fraction: 0, lastDate: e.date });
      row.fraction += e.fraction;
      if (e.date > row.lastDate) row.lastDate = e.date;
    });

  const invoices = Object.entries(periodByInvoice)
    .map(([id, row]) => ({ ...invoiceById[id], paid_at: row.lastDate, ivuFraction: row.fraction }))
    .sort((a, b) => (b.paid_at > a.paid_at ? 1 : -1));

  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = n => `${(Number(n ?? 0) * 100).toFixed(1)}%`;

  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
  const months = Array.from({ length: 12 }, (_, i) => capitalize(new Date(2000, i, 1).toLocaleDateString(dateLocale, { month: 'long' })));
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  // Compute IVU breakdown per invoice straight off the invoice's own fields
  // (see lib/ivu.js) - invoice_line_items isn't reliably populated, which
  // previously under-reported IVU for any invoice missing them.
  // Scaled by ivuFraction: only the share of each invoice's IVU that this
  // period's collections earned.
  const ivuByInvoice = {};
  (invoices ?? []).forEach(inv => {
    const b = computeInvoiceIVU(inv);
    const f = inv.ivuFraction ?? 1;
    ivuByInvoice[inv.id] = {
      ivuProducts: b.prodTax * f,
      ivuLaborFinal: (b.isB2B ? 0 : b.laborTax) * f,
      ivuLaborB2B: (b.isB2B ? b.laborTax : 0) * f,
    };
  });

  // Totals
  let totProducts = 0, totLaborFinal = 0, totLaborB2B = 0;
  Object.values(ivuByInvoice).forEach(v => {
    totProducts += v.ivuProducts;
    totLaborFinal += v.ivuLaborFinal;
    totLaborB2B += v.ivuLaborB2B;
  });

  const totFinal = totProducts + totLaborFinal; // 11.5% base
  const totEstatal = totFinal * (10.5 / 11.5);
  const totMunicipal = totFinal * (1 / 11.5);
  const totB2B = totLaborB2B; // 4% single rate
  const totIVU = totFinal + totB2B;

  // Monthly breakdown (only when viewing full year)
  // Built from the collection events, not from the period rows above: one
  // invoice can collect across several months, and those rows collapse it into
  // a single line, which would pile the whole year onto one month.
  const monthlyData = months.map((m, i) => {
    const mStart = `${year}-${String(i + 1).padStart(2, '0')}-01`;
    const mEnd = new Date(year, i + 1, 0).toISOString().slice(0, 10);
    let mProd = 0, mLaborFinal = 0, mLaborB2B = 0;
    events.filter(e => e.date >= mStart && e.date <= mEnd).forEach(e => {
      const inv = invoiceById[e.invoiceId];
      if (!inv) return;
      const b = computeInvoiceIVU(inv);
      mProd += b.prodTax * e.fraction;
      mLaborFinal += (b.isB2B ? 0 : b.laborTax) * e.fraction;
      mLaborB2B += (b.isB2B ? b.laborTax : 0) * e.fraction;
    });
    const mFinal = mProd + mLaborFinal;
    return { name: m.slice(0, 3), mProd, mLaborFinal, mLaborB2B, mFinal, estatal: mFinal * (10.5 / 11.5), municipal: mFinal * (1 / 11.5), total: mFinal + mLaborB2B, idx: i };
  });

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content main-content-wide">
        <div className="page-header">
          <div>
            <div className="page-title">{t('title')}</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
              {month !== null ? `${months[month]} ${year}` : t('periodYear', { year })}
            </p>
          </div>
          <Link href="/accounting" className="btn btn-ghost">{t('backToDashboard')}</Link>
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{t('filters.year')}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {years.map(y => (
                  <Link key={y} href={`/accounting/ivu?year=${y}${month !== null ? `&month=${month}` : ''}`}
                    className={`btn ${y === year ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13 }}>
                    {y}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{t('filters.month')}</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Link href={`/accounting/ivu?year=${year}`}
                  className={`btn ${month === null ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13 }}>
                  {t('filters.fullYear')}
                </Link>
                {months.map((m, i) => (
                  <Link key={i} href={`/accounting/ivu?year=${year}&month=${i}`}
                    className={`btn ${month === i ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 10px', fontSize: 12 }}>
                    {m.slice(0, 3)}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">{t('stats.ivuTotal')}</div>
            <div className="stat-value" style={{ color: 'var(--navy)' }}>{fmt(totIVU)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.estatal')}</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totEstatal)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.municipal')}</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totMunicipal)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.products')}</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totProducts)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.laborFinal')}</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totLaborFinal)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.laborB2B')}</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totB2B)}</div>
          </div>
        </div>

        {/* Monthly breakdown — only when viewing full year */}
        {month === null && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', margin: 0 }}>{t('monthlyBreakdown.title', { year })}</p>
              <ExportIVUButton
                monthlyData={monthlyData}
                year={year}
                totals={{ totProducts, totLaborFinal, totB2B, totEstatal, totMunicipal, totIVU }}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('monthlyBreakdown.columns.month')}</th>
                    <th style={{ textAlign: 'right' }}>{t('monthlyBreakdown.columns.ivuProducts')}</th>
                    <th style={{ textAlign: 'right' }}>{t('monthlyBreakdown.columns.ivuLaborFinal')}</th>
                    <th style={{ textAlign: 'right' }}>{t('monthlyBreakdown.columns.ivuLaborB2B')}</th>
                    <th style={{ textAlign: 'right' }}>{t('monthlyBreakdown.columns.estatal')}</th>
                    <th style={{ textAlign: 'right' }}>{t('monthlyBreakdown.columns.municipal')}</th>
                    <th style={{ textAlign: 'right' }}>{t('monthlyBreakdown.columns.totalIVU')}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map(m => (
                    <tr key={m.idx} style={{ opacity: m.total === 0 ? 0.4 : 1 }}>
                      <td>
                        <Link href={`/accounting/ivu?year=${year}&month=${m.idx}`} style={{ color: 'var(--amber)', fontWeight: 600 }}>
                          {m.name}
                        </Link>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(m.mProd)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(m.mLaborFinal)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(m.mLaborB2B)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(m.estatal)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(m.municipal)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(m.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td style={{ fontWeight: 700, paddingTop: 12 }}>{t('monthlyBreakdown.total')}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totProducts)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totLaborFinal)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totB2B)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totEstatal)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totMunicipal)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: 'var(--navy)', paddingTop: 12 }}>{fmt(totIVU)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Per invoice detail */}
        <IVUInvoiceTableClient
          invoices={invoices ?? []}
          periodLabel={month !== null ? `${months[month]} ${year}` : `${year}`}
        />

        <div style={{ marginTop: 20 }}>
          {/* Los pagos se consultan por año (.eq('year', year)) y el tracker los
              guarda en estado; sin key, al cambiar de año se quedaría con los
              del año anterior y todos los meses saldrían en blanco. */}
          <IVUPaymentTracker key={year} year={year} payments={ivuPayments ?? []} />
        </div>
      </main>
    </div>
  );
}
