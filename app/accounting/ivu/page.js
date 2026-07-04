
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import ExportIVUButton from './ExportIVUButton';
import IVUInvoiceTableClient from './IVUInvoiceTableClient';
import IVUPaymentTracker from './IVUPaymentTracker';

export default async function AccountingIVU({ searchParams }) {
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

  const [{ data: invoices }, { data: ivuPayments }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, issued_at, status, clients(name, client_type)')
      .gte('issued_at', dateStart)
      .lte('issued_at', dateEnd)
      .order('issued_at', { ascending: false }),
    supabase.from('ivu_payments').select('*').eq('year', year),
  ]);

  const invIds = new Set((invoices ?? []).map(i => i.id));
  const invMap = Object.fromEntries((invoices ?? []).map(i => [i.id, i]));

  const { data: lines } = await supabase
    .from('invoice_line_items')
    .select('invoice_id, type, tax_rate, tax_amount, line_total')
    .in('invoice_id', [...invIds]);

  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = n => `${(Number(n ?? 0) * 100).toFixed(1)}%`;

  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  // Compute IVU breakdown per invoice
  const ivuByInvoice = {};
  (lines ?? []).forEach(l => {
    if (!ivuByInvoice[l.invoice_id]) {
      ivuByInvoice[l.invoice_id] = { ivuProducts: 0, ivuLaborFinal: 0, ivuLaborB2B: 0 };
    }
    const tax = Number(l.tax_amount ?? 0);
    if (l.type === 'product') {
      ivuByInvoice[l.invoice_id].ivuProducts += tax;
    } else if (l.type === 'labor') {
      if (Number(l.tax_rate ?? 0) <= 0.04) ivuByInvoice[l.invoice_id].ivuLaborB2B += tax;
      else ivuByInvoice[l.invoice_id].ivuLaborFinal += tax;
    }
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
  const monthlyData = months.map((m, i) => {
    const mStart = `${year}-${String(i + 1).padStart(2, '0')}-01`;
    const mEnd = new Date(year, i + 1, 0).toISOString().slice(0, 10);
    const mInvIds = new Set((invoices ?? []).filter(inv => inv.issued_at >= mStart && inv.issued_at <= mEnd).map(inv => inv.id));
    let mProd = 0, mLaborFinal = 0, mLaborB2B = 0;
    mInvIds.forEach(id => {
      const v = ivuByInvoice[id];
      if (v) { mProd += v.ivuProducts; mLaborFinal += v.ivuLaborFinal; mLaborB2B += v.ivuLaborB2B; }
    });
    const mFinal = mProd + mLaborFinal;
    return { name: m.slice(0, 3), mProd, mLaborFinal, mLaborB2B, mFinal, estatal: mFinal * (10.5 / 11.5), municipal: mFinal * (1 / 11.5), total: mFinal + mLaborB2B, idx: i };
  });

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">Reporte IVU</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
              {month !== null ? `${months[month]} ${year}` : `Año ${year}`}
            </p>
          </div>
          <Link href="/accounting" className="btn btn-ghost">← Dashboard</Link>
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Año</label>
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
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Mes</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Link href={`/accounting/ivu?year=${year}`}
                  className={`btn ${month === null ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13 }}>
                  Todo el año
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
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">IVU Total</div>
            <div className="stat-value" style={{ color: 'var(--navy)' }}>{fmt(totIVU)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Estatal (10.5%)</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totEstatal)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Municipal (1%)</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totMunicipal)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">B2B Labor (4%)</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totB2B)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Productos (11.5%)</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totProducts)}</div>
          </div>
        </div>

        {/* Monthly breakdown — only when viewing full year */}
        {month === null && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', margin: 0 }}>Desglose mensual {year}</p>
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
                    <th>Mes</th>
                    <th style={{ textAlign: 'right' }}>IVU Productos</th>
                    <th style={{ textAlign: 'right' }}>IVU Labor Final</th>
                    <th style={{ textAlign: 'right' }}>IVU Labor B2B</th>
                    <th style={{ textAlign: 'right' }}>Estatal (10.5%)</th>
                    <th style={{ textAlign: 'right' }}>Municipal (1%)</th>
                    <th style={{ textAlign: 'right' }}>Total IVU</th>
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
                    <td style={{ fontWeight: 700, paddingTop: 12 }}>TOTAL</td>
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
          ivuByInvoice={ivuByInvoice}
          periodLabel={month !== null ? `${months[month]} ${year}` : `${year}`}
        />

        <div style={{ marginTop: 20 }}>
          <IVUPaymentTracker year={year} payments={ivuPayments ?? []} />
        </div>
      </main>
    </div>
  );
}
