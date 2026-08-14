export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import { effectiveEntryHours } from '../../../lib/payrollOverrides';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

const MARGIN_ALERT_THRESHOLD = 20;

export default async function RentabilidadPage() {
  const t = await getTranslations('accounting.rentabilidad');
  const [{ data: jobs }, { data: invoices }, { data: lineItems }, { data: timeEntries }, { data: technicians }, { data: expenses }, { data: dayOverrides }] = await Promise.all([
    supabase.from('jobs').select('id, title, job_number, status, clients(name)'),
    supabase.from('invoices').select('id, job_id, total'),
    supabase.from('job_line_items').select('job_id, quantity, unit_price, supplier_price'),
    supabase.from('time_entries').select('job_id, technician_id, clocked_in_at, clocked_out_at, lunch_minutes').not('job_id', 'is', null).not('clocked_out_at', 'is', null),
    supabase.from('technicians').select('id, name, hourly_rate'),
    supabase.from('expenses').select('job_id, amount'),
    supabase.from('daily_hour_overrides').select('technician_id, work_date, regular_hours_override, overtime_hours_override'),
  ]);

  // Per-day manual corrections (from the admin Timesheet, e.g. an absence)
  // replace raw clocked hours for that technician/date. Attached here so job
  // and technician cost rollups below use the corrected hours.
  const rawEntries = timeEntries ?? [];
  const effectiveHours = effectiveEntryHours(rawEntries, dayOverrides ?? []);
  const timeEntriesEff = rawEntries.map((e, i) => ({ ...e, hours: effectiveHours[i] }));
  function hoursOf(entry) { return entry.hours; }

  const invoiceIds = (invoices ?? []).map(i => i.id);
  const { data: payments } = invoiceIds.length
    ? await supabase.from('payments').select('invoice_id, amount').in('invoice_id', invoiceIds)
    : { data: [] };

  const paymentsByInvoice = {};
  (payments ?? []).forEach(p => {
    if (!paymentsByInvoice[p.invoice_id]) paymentsByInvoice[p.invoice_id] = 0;
    paymentsByInvoice[p.invoice_id] += Number(p.amount ?? 0);
  });

  const techRateById = {};
  const techNameById = {};
  (technicians ?? []).forEach(tech => { techRateById[tech.id] = Number(tech.hourly_rate ?? 0); techNameById[tech.id] = tech.name; });

  const invoicesByJob = {};
  (invoices ?? []).forEach(i => { (invoicesByJob[i.job_id] ??= []).push(i); });
  const lineItemsByJob = {};
  (lineItems ?? []).forEach(li => { (lineItemsByJob[li.job_id] ??= []).push(li); });
  const entriesByJob = {};
  timeEntriesEff.forEach(e => { (entriesByJob[e.job_id] ??= []).push(e); });
  const expensesByJob = {};
  (expenses ?? []).forEach(e => { (expensesByJob[e.job_id] ??= []).push(e); });

  const jobStats = (jobs ?? []).map(job => {
    const jobInvoices = invoicesByJob[job.id] ?? [];
    const facturado = jobInvoices.reduce((a, i) => a + Number(i.total ?? 0), 0);
    const cobrado = jobInvoices.reduce((a, i) => a + (paymentsByInvoice[i.id] ?? 0), 0);
    const pendiente = Math.max(facturado - cobrado, 0);

    const materialesCosto = (lineItemsByJob[job.id] ?? []).reduce((a, it) => {
      if (it.supplier_price == null) return a;
      return a + Number(it.quantity ?? 0) * Number(it.supplier_price ?? 0);
    }, 0);

    const jobEntries = entriesByJob[job.id] ?? [];
    const hoursByTech = {};
    jobEntries.forEach(e => { hoursByTech[e.technician_id] = (hoursByTech[e.technician_id] ?? 0) + hoursOf(e); });
    const totalHoras = Object.values(hoursByTech).reduce((a, h) => a + h, 0);
    const manoDeObraCosto = Object.entries(hoursByTech).reduce((a, [techId, hrs]) => a + hrs * (techRateById[techId] ?? 0), 0);

    const gastos = (expensesByJob[job.id] ?? []).reduce((a, e) => a + Number(e.amount ?? 0), 0);

    const gananciaNeta = cobrado - materialesCosto - manoDeObraCosto - gastos;
    const margenPct = cobrado > 0 ? (gananciaNeta / cobrado) * 100 : null;

    return {
      job, facturado, cobrado, pendiente, materialesCosto, manoDeObraCosto, totalHoras, gastos,
      gananciaNeta, margenPct, hoursByTech,
      hasActivity: facturado > 0 || materialesCosto > 0 || manoDeObraCosto > 0 || gastos > 0,
    };
  }).filter(s => s.hasActivity);

  const billedJobs = jobStats.filter(s => s.facturado > 0).sort((a, b) => (a.margenPct ?? 0) - (b.margenPct ?? 0));
  const wipJobs = jobStats.filter(s => s.facturado === 0);
  const lowMarginJobs = billedJobs.filter(s => s.margenPct != null && s.margenPct < MARGIN_ALERT_THRESHOLD);

  // Per-technician rollup across jobs with billing activity
  const techStats = {};
  billedJobs.forEach(s => {
    Object.entries(s.hoursByTech).forEach(([techId, hours]) => {
      if (!techStats[techId]) techStats[techId] = { hours: 0, pay: 0, jobs: new Set(), marginSum: 0, marginCount: 0 };
      techStats[techId].hours += hours;
      techStats[techId].pay += hours * (techRateById[techId] ?? 0);
      techStats[techId].jobs.add(s.job.id);
      if (s.margenPct != null) { techStats[techId].marginSum += s.margenPct; techStats[techId].marginCount += 1; }
    });
  });
  const techRows = Object.entries(techStats).map(([techId, ts]) => ({
    techId, name: techNameById[techId] ?? t('defaultTechnicianName'), hours: ts.hours, pay: ts.pay, jobCount: ts.jobs.size,
    avgMargin: ts.marginCount > 0 ? ts.marginSum / ts.marginCount : null,
  })).sort((a, b) => b.hours - a.hours);

  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtH = h => `${Number(h).toFixed(1)}h`;

  const totals = billedJobs.reduce((a, s) => ({
    facturado: a.facturado + s.facturado, cobrado: a.cobrado + s.cobrado,
    costos: a.costos + s.materialesCosto + s.manoDeObraCosto + s.gastos,
    ganancia: a.ganancia + s.gananciaNeta,
  }), { facturado: 0, cobrado: 0, costos: 0, ganancia: 0 });
  const totalMargenPct = totals.cobrado > 0 ? (totals.ganancia / totals.cobrado) * 100 : null;

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">{t('title')}</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{t('subtitle')}</p>
          </div>
          <Link href="/accounting" className="btn btn-ghost">{t('backToDashboard')}</Link>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">{t('stats.billed')}</div>
            <div className="stat-value">{fmt(totals.facturado)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.collected')}</div>
            <div className="stat-value" style={{ color: 'var(--ok)' }}>{fmt(totals.cobrado)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.totalCosts')}</div>
            <div className="stat-value" style={{ color: 'var(--warn)' }}>{fmt(totals.costos)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.netProfit')}</div>
            <div className="stat-value" style={{ color: totals.ganancia >= 0 ? 'var(--ok)' : 'var(--warn)' }}>
              {fmt(totals.ganancia)} {totalMargenPct != null ? `(${totalMargenPct.toFixed(0)}%)` : ''}
            </div>
          </div>
        </div>

        {lowMarginJobs.length > 0 && (
          <div className="card" style={{ marginBottom: 20, background: 'var(--danger-tint)', border: '1px solid var(--warn)' }}>
            <div style={{ fontWeight: 700, color: 'var(--warn)', fontSize: 14, marginBottom: 4 }}>
              {t('lowMarginAlert', { count: lowMarginJobs.length, threshold: MARGIN_ALERT_THRESHOLD })}
            </div>
            <div style={{ fontSize: 13, color: 'var(--warn)' }}>
              {lowMarginJobs.slice(0, 5).map(s => s.job.title).join(', ')}{lowMarginJobs.length > 5 ? '…' : ''}
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', marginBottom: 14 }}>{t('billedJobsTitle')}</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ paddingBottom: 8 }}>{t('billedJobsTable.job')}</th>
                  <th style={{ paddingBottom: 8 }}>{t('billedJobsTable.client')}</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>{t('billedJobsTable.billed')}</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>{t('billedJobsTable.collected')}</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>{t('billedJobsTable.materials')}</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>{t('billedJobsTable.labor')}</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>{t('billedJobsTable.expenses')}</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>{t('billedJobsTable.profit')}</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>{t('billedJobsTable.margin')}</th>
                </tr>
              </thead>
              <tbody>
                {billedJobs.map(s => {
                  const low = s.margenPct != null && s.margenPct < MARGIN_ALERT_THRESHOLD;
                  return (
                    <tr key={s.job.id} style={{ borderTop: '1px solid var(--border)', background: low ? 'var(--danger-tint)' : 'transparent' }}>
                      <td style={{ padding: '8px 0' }}>
                        <Link href={`/trabajos/${s.job.id}`} style={{ color: 'var(--navy)', fontWeight: 700, textDecoration: 'none' }}>{s.job.title}</Link>
                        {s.job.job_number && <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>{s.job.job_number}</span>}
                      </td>
                      <td style={{ padding: '8px 0', color: 'var(--muted)' }}>{s.job.clients?.name ?? t('notAvailable')}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmt(s.facturado)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmt(s.cobrado)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmt(s.materialesCosto)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmt(s.manoDeObraCosto)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmt(s.gastos)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: s.gananciaNeta >= 0 ? 'var(--ok)' : 'var(--warn)' }}>{fmt(s.gananciaNeta)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: low ? 'var(--warn)' : 'var(--navy)' }}>
                        {s.margenPct != null ? `${s.margenPct.toFixed(0)}%` : t('notAvailable')}
                      </td>
                    </tr>
                  );
                })}
                {billedJobs.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: '16px 0', color: 'var(--muted)' }}>{t('billedJobsEmpty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>{t('techProfitTitle')}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>{t('techProfitSubtitle')}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ paddingBottom: 8 }}>{t('techTable.technician')}</th>
                <th style={{ paddingBottom: 8, textAlign: 'right' }}>{t('techTable.hours')}</th>
                <th style={{ paddingBottom: 8, textAlign: 'right' }}>{t('techTable.payroll')}</th>
                <th style={{ paddingBottom: 8, textAlign: 'right' }}>{t('techTable.jobs')}</th>
                <th style={{ paddingBottom: 8, textAlign: 'right' }}>{t('techTable.avgMargin')}</th>
              </tr>
            </thead>
            <tbody>
              {techRows.map(row => (
                <tr key={row.techId} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 0' }}>{row.name}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmtH(row.hours)}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmt(row.pay)}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{row.jobCount}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: row.avgMargin != null && row.avgMargin < MARGIN_ALERT_THRESHOLD ? 'var(--warn)' : 'var(--navy)' }}>
                    {row.avgMargin != null ? `${row.avgMargin.toFixed(0)}%` : t('notAvailable')}
                  </td>
                </tr>
              ))}
              {techRows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '16px 0', color: 'var(--muted)' }}>{t('techTableEmpty')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {wipJobs.length > 0 && (
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>{t('wipTitle')}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>{t('wipSubtitle')}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ paddingBottom: 8 }}>{t('wipTable.job')}</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>{t('wipTable.materials')}</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>{t('wipTable.labor')}</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>{t('wipTable.expenses')}</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>{t('wipTable.totalCost')}</th>
                </tr>
              </thead>
              <tbody>
                {wipJobs.map(s => (
                  <tr key={s.job.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 0' }}>
                      <Link href={`/trabajos/${s.job.id}`} style={{ color: 'var(--navy)', fontWeight: 700, textDecoration: 'none' }}>{s.job.title}</Link>
                    </td>
                    <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmt(s.materialesCosto)}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmt(s.manoDeObraCosto)}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmt(s.gastos)}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700 }}>{fmt(s.materialesCosto + s.manoDeObraCosto + s.gastos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
