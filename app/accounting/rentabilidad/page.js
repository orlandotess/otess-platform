export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import { computeHours } from '../../../lib/hours';
import Sidebar from '../../Sidebar';
import Link from 'next/link';

const MARGIN_ALERT_THRESHOLD = 20;

function hoursOf(entry) {
  return computeHours(entry.clocked_in_at, entry.clocked_out_at, entry.lunch_minutes).hours;
}

export default async function RentabilidadPage() {
  const [{ data: jobs }, { data: invoices }, { data: lineItems }, { data: timeEntries }, { data: technicians }, { data: expenses }] = await Promise.all([
    supabase.from('jobs').select('id, title, job_number, status, clients(name)'),
    supabase.from('invoices').select('id, job_id, total'),
    supabase.from('job_line_items').select('job_id, quantity, unit_price, supplier_price'),
    supabase.from('time_entries').select('job_id, technician_id, clocked_in_at, clocked_out_at, lunch_minutes').not('job_id', 'is', null).not('clocked_out_at', 'is', null),
    supabase.from('technicians').select('id, name, hourly_rate'),
    supabase.from('expenses').select('job_id, amount'),
  ]);

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
  (technicians ?? []).forEach(t => { techRateById[t.id] = Number(t.hourly_rate ?? 0); techNameById[t.id] = t.name; });

  const invoicesByJob = {};
  (invoices ?? []).forEach(i => { (invoicesByJob[i.job_id] ??= []).push(i); });
  const lineItemsByJob = {};
  (lineItems ?? []).forEach(li => { (lineItemsByJob[li.job_id] ??= []).push(li); });
  const entriesByJob = {};
  (timeEntries ?? []).forEach(e => { (entriesByJob[e.job_id] ??= []).push(e); });
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
  const techRows = Object.entries(techStats).map(([techId, t]) => ({
    techId, name: techNameById[techId] ?? 'Técnico', hours: t.hours, pay: t.pay, jobCount: t.jobs.size,
    avgMargin: t.marginCount > 0 ? t.marginSum / t.marginCount : null,
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
            <div className="page-title">Rentabilidad por trabajo</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>Ganancia neta por proyecto: facturación, materiales, mano de obra y gastos</p>
          </div>
          <Link href="/accounting" className="btn btn-ghost">← Dashboard</Link>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">Facturado</div>
            <div className="stat-value">{fmt(totals.facturado)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Cobrado</div>
            <div className="stat-value" style={{ color: 'var(--ok)' }}>{fmt(totals.cobrado)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Costos totales</div>
            <div className="stat-value" style={{ color: 'var(--warn)' }}>{fmt(totals.costos)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Ganancia neta</div>
            <div className="stat-value" style={{ color: totals.ganancia >= 0 ? 'var(--ok)' : 'var(--warn)' }}>
              {fmt(totals.ganancia)} {totalMargenPct != null ? `(${totalMargenPct.toFixed(0)}%)` : ''}
            </div>
          </div>
        </div>

        {lowMarginJobs.length > 0 && (
          <div className="card" style={{ marginBottom: 20, background: 'var(--danger-tint)', border: '1px solid #f3b3ac' }}>
            <div style={{ fontWeight: 700, color: 'var(--warn)', fontSize: 14, marginBottom: 4 }}>
              ⚠ {lowMarginJobs.length} trabajo{lowMarginJobs.length > 1 ? 's' : ''} con margen por debajo de {MARGIN_ALERT_THRESHOLD}%
            </div>
            <div style={{ fontSize: 13, color: 'var(--warn)' }}>
              {lowMarginJobs.slice(0, 5).map(s => s.job.title).join(', ')}{lowMarginJobs.length > 5 ? '…' : ''}
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', marginBottom: 14 }}>Trabajos facturados</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ paddingBottom: 8 }}>Trabajo</th>
                  <th style={{ paddingBottom: 8 }}>Cliente</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>Facturado</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>Cobrado</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>Materiales</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>Mano de obra</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>Gastos</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>Ganancia</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>Margen</th>
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
                      <td style={{ padding: '8px 0', color: 'var(--muted)' }}>{s.job.clients?.name ?? '—'}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmt(s.facturado)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmt(s.cobrado)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmt(s.materialesCosto)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmt(s.manoDeObraCosto)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmt(s.gastos)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: s.gananciaNeta >= 0 ? 'var(--ok)' : 'var(--warn)' }}>{fmt(s.gananciaNeta)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: low ? 'var(--warn)' : 'var(--navy)' }}>
                        {s.margenPct != null ? `${s.margenPct.toFixed(0)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
                {billedJobs.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: '16px 0', color: 'var(--muted)' }}>No hay trabajos facturados todavía.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>Rentabilidad por técnico</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>Solo considera horas en trabajos ya facturados</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ paddingBottom: 8 }}>Técnico</th>
                <th style={{ paddingBottom: 8, textAlign: 'right' }}>Horas</th>
                <th style={{ paddingBottom: 8, textAlign: 'right' }}>Nómina</th>
                <th style={{ paddingBottom: 8, textAlign: 'right' }}>Trabajos</th>
                <th style={{ paddingBottom: 8, textAlign: 'right' }}>Margen prom. de sus trabajos</th>
              </tr>
            </thead>
            <tbody>
              {techRows.map(t => (
                <tr key={t.techId} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 0' }}>{t.name}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmtH(t.hours)}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{fmt(t.pay)}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{t.jobCount}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: t.avgMargin != null && t.avgMargin < MARGIN_ALERT_THRESHOLD ? 'var(--warn)' : 'var(--navy)' }}>
                    {t.avgMargin != null ? `${t.avgMargin.toFixed(0)}%` : '—'}
                  </td>
                </tr>
              ))}
              {techRows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '16px 0', color: 'var(--muted)' }}>Sin datos de horas todavía.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {wipJobs.length > 0 && (
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>En progreso (sin facturar aún)</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>Costo acumulado en trabajos que todavía no tienen factura</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ paddingBottom: 8 }}>Trabajo</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>Materiales</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>Mano de obra</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>Gastos</th>
                  <th style={{ paddingBottom: 8, textAlign: 'right' }}>Costo total</th>
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
