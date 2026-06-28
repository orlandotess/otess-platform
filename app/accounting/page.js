
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';

function getPeriods() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const yearStart = new Date(year, 0, 1).toISOString();
  const yearEnd = new Date(year, 11, 31, 23, 59, 59).toISOString();
  const monthStart = new Date(year, month, 1).toISOString();
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
  const day = now.getDay();
  const diffToMon = (day + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - diffToMon);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { yearStart, yearEnd, monthStart, monthEnd, weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString(), year, month };
}

function computeRevenue(invs) {
  const paid = invs.filter(i => i.status === 'paid');
  const pending = invs.filter(i => i.status === 'sent');
  return {
    total: invs.reduce((a, i) => a + Number(i.total ?? 0), 0),
    collected: paid.reduce((a, i) => a + Number(i.total ?? 0), 0),
    outstanding: pending.reduce((a, i) => a + Number(i.total ?? 0), 0),
    count: invs.length,
  };
}

function computeIVU(invIds, lines) {
  const relevant = lines.filter(l => invIds.has(l.invoice_id));
  let ivuProducts = 0, ivuLaborFinal = 0, ivuLaborB2B = 0;
  relevant.forEach(l => {
    const tax = Number(l.tax_amount ?? 0);
    if (l.type === 'product') ivuProducts += tax;
    else if (l.type === 'labor') {
      if (Number(l.tax_rate ?? 0) <= 0.04) ivuLaborB2B += tax;
      else ivuLaborFinal += tax;
    }
  });
  const ivuEstatal = (ivuProducts + ivuLaborFinal) * (10.5 / 11.5);
  const ivuMunicipal = (ivuProducts + ivuLaborFinal) * (1 / 11.5);
  return { ivuProducts, ivuLaborFinal, ivuLaborB2B, ivuEstatal, ivuMunicipal, ivuTotal: ivuProducts + ivuLaborFinal + ivuLaborB2B };
}

function computePayroll(start, end, techs, ents) {
  const filtered = ents.filter(e => e.clocked_in_at >= start && e.clocked_in_at <= end);
  let total = 0;
  techs.forEach(tech => {
    const hours = filtered.filter(e => e.technician_id === tech.id).reduce((a, e) => {
      return a + (new Date(e.clocked_out_at) - new Date(e.clocked_in_at)) / 3600000;
    }, 0);
    total += hours * Number(tech.hourly_rate ?? 0);
  });
  return total;
}

function PeriodSection({ label, revenue, ivu, payroll, fmt }) {
  const netEst = revenue.collected - payroll - ivu.ivuTotal;
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid var(--border)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)', margin: 0 }}>{label}</h2>
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{revenue.count} facturas</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Facturado</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--navy)' }}>{fmt(revenue.total)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Cobrado</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--ok)' }}>{fmt(revenue.collected)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Pendiente</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--amber)' }}>{fmt(revenue.outstanding)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Payroll</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#e05c2a' }}>{fmt(payroll)}</div>
        </div>
      </div>
      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', marginBottom: 10 }}>Desglose IVU</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>IVU Total</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>{fmt(ivu.ivuTotal)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Estatal (10.5%)</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{fmt(ivu.ivuEstatal)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Municipal (1%)</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{fmt(ivu.ivuMunicipal)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>B2B Labor (4%)</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{fmt(ivu.ivuLaborB2B)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Productos (11.5%)</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{fmt(ivu.ivuProducts)}</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: netEst >= 0 ? 'var(--ok)' : 'var(--warn)', background: netEst >= 0 ? '#e6f4ee' : '#fdecea', padding: '6px 14px', borderRadius: 8 }}>
          Ganancia neta estimada: {fmt(netEst)}
        </div>
      </div>
    </div>
  );
}

export default async function AccountingDashboard() {
  const { yearStart, yearEnd, monthStart, monthEnd, weekStart, weekEnd, year, month } = getPeriods();

  const [{ data: allInvoices }, { data: lineItems }, { data: technicians }, { data: timeEntries }] = await Promise.all([
    supabase.from('invoices').select('id, status, total, issued_at').order('issued_at', { ascending: false }),
    supabase.from('invoice_line_items').select('invoice_id, type, tax_rate, tax_amount'),
    supabase.from('technicians').select('id, hourly_rate'),
    supabase.from('time_entries').select('technician_id, clocked_in_at, clocked_out_at').not('clocked_out_at', 'is', null).gte('clocked_in_at', yearStart).lte('clocked_in_at', yearEnd),
  ]);

  const invoices = allInvoices ?? [];
  const lines = lineItems ?? [];
  const techs = technicians ?? [];
  const entries = timeEntries ?? [];
  const fmt = n => `$${Number(n).toFixed(2)}`;

  const filterInvs = (start, end) => invoices.filter(i => i.issued_at && i.issued_at >= start.slice(0, 10) && i.issued_at <= end.slice(0, 10));
  const getIds = (start, end) => new Set(filterInvs(start, end).map(i => i.id));

  const monthName = new Date(year, month, 1).toLocaleString('es-PR', { month: 'long' });
  const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const weekInvs = filterInvs(weekStart, weekEnd);
  const monthInvs = filterInvs(monthStart, monthEnd);
  const yearInvs = filterInvs(yearStart, yearEnd);

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">Accounting Dashboard</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>Resumen financiero de OTESS</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/accounting/facturas" className="btn btn-ghost">🧾 Facturas</Link>
            <Link href="/accounting/ivu" className="btn btn-ghost">🏛 IVU</Link>
            <Link href="/accounting/payroll" className="btn btn-ghost">⏱ Payroll</Link>
          </div>
        </div>

        <PeriodSection
          label="📅 Esta semana"
          revenue={computeRevenue(weekInvs)}
          ivu={computeIVU(getIds(weekStart, weekEnd), lines)}
          payroll={computePayroll(weekStart, weekEnd, techs, entries)}
          fmt={fmt}
        />
        <PeriodSection
          label={`🗓 ${monthLabel} ${year}`}
          revenue={computeRevenue(monthInvs)}
          ivu={computeIVU(getIds(monthStart, monthEnd), lines)}
          payroll={computePayroll(monthStart, monthEnd, techs, entries)}
          fmt={fmt}
        />
        <PeriodSection
          label={`📆 Año ${year}`}
          revenue={computeRevenue(yearInvs)}
          ivu={computeIVU(getIds(yearStart, yearEnd), lines)}
          payroll={computePayroll(yearStart, yearEnd, techs, entries)}
          fmt={fmt}
        />
      </main>
    </div>
  );
}
