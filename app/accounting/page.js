export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import { computeInvoiceIVU } from '../../lib/ivu';
import { computeHours } from '../../lib/hours';
import { indexDayOverrides } from '../../lib/payrollOverrides';
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

function computeRevenue(invs, paymentsByInvoice) {
  const invIds = new Set(invs.map(i => i.id));
  let collected = 0;
  invs.forEach(i => {
    const payments = paymentsByInvoice[i.id] ?? [];
    collected += payments.reduce((a, p) => a + Number(p.amount ?? 0), 0);
  });
  const total = invs.reduce((a, i) => a + Number(i.total ?? 0), 0);
  const outstanding = total - collected;
  return {
    total,
    collected,
    outstanding: Math.max(outstanding, 0),
    subProducts: invs.reduce((a, i) => a + Number(i.subtotal_products ?? 0), 0),
    subLabor: invs.reduce((a, i) => a + Number(i.subtotal_labor ?? 0), 0),
    taxProducts: invs.reduce((a, i) => a + Number(i.tax_products ?? 0), 0),
    taxLabor: invs.reduce((a, i) => a + Number(i.tax_labor ?? 0), 0),
    count: invs.length,
  };
}

// Sourced from each invoice's own columns (see lib/ivu.js) rather than
// invoice_line_items, which isn't reliably populated for every invoice and
// was silently under-reporting IVU (and inflating "ganancia neta estimada")
// for any invoice missing them.
function computeIVU(invs) {
  let ivuProducts = 0, ivuLaborFinal = 0, ivuLaborB2B = 0;
  invs.forEach(inv => {
    const b = computeInvoiceIVU(inv);
    ivuProducts += b.prodTax;
    if (b.isB2B) ivuLaborB2B += b.laborTax;
    else ivuLaborFinal += b.laborTax;
  });
  const ivuEstatal = (ivuProducts + ivuLaborFinal) * (10.5 / 11.5);
  const ivuMunicipal = (ivuProducts + ivuLaborFinal) * (1 / 11.5);
  return { ivuProducts, ivuLaborFinal, ivuLaborB2B, ivuEstatal, ivuMunicipal, ivuTotal: ivuProducts + ivuLaborFinal + ivuLaborB2B };
}

function computeMargin(invIds, lines) {
  const relevant = lines.filter(l => invIds.has(l.invoice_id));
  let revenueWithCost = 0, cost = 0;
  relevant.forEach(l => {
    if (l.supplier_price == null) return;
    revenueWithCost += Number(l.quantity ?? 0) * Number(l.unit_price ?? 0);
    cost += Number(l.quantity ?? 0) * Number(l.supplier_price ?? 0);
  });
  const margin = revenueWithCost - cost;
  const marginPct = revenueWithCost > 0 ? (margin / revenueWithCost) * 100 : null;
  return { revenueWithCost, cost, margin, marginPct };
}

function computeExpenses(start, end, expenses) {
  const filtered = expenses.filter(e => e.expense_date && e.expense_date >= start.slice(0, 10) && e.expense_date <= end.slice(0, 10));
  return filtered.reduce((a, e) => a + Number(e.amount ?? 0), 0);
}

// Payroll weeks run Wed–Tue (see app/accounting/payroll), which is how manual
// entries in payroll_adjustments are keyed via their period_start.
function getPayrollWeekStart(dateStr) {
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00');
  const daysSinceWed = (d.getDay() + 4) % 7;
  d.setDate(d.getDate() - daysSinceWed);
  return d.toISOString().slice(0, 10);
}

function computePayroll(start, end, techs, ents, adjustments, dayOverrides = []) {
  const filtered = ents.filter(e => e.clocked_in_at >= start && e.clocked_in_at <= end);
  const startDate = start.slice(0, 10);
  const endDate = end.slice(0, 10);
  let total = 0;
  techs.forEach(tech => {
    const rate = Number(tech.hourly_rate ?? 0);
    const techDayOverrides = indexDayOverrides(dayOverrides, tech.id);

    const byDay = {};
    filtered.filter(e => e.technician_id === tech.id).forEach(e => {
      const dayKey = e.clocked_in_at.slice(0, 10);
      (byDay[dayKey] ??= []).push(e);
    });
    // A day override can apply even with no raw entries in this window (e.g.
    // a corrected absence), so make sure it's represented too.
    Object.keys(techDayOverrides).forEach(dayKey => { if (!(dayKey in byDay)) byDay[dayKey] = []; });

    // Per-day manual corrections (from the admin Timesheet) replace that
    // day's raw clocked hours before weekly totals are built.
    const hoursByWeek = {};
    Object.keys(byDay).forEach(dayKey => {
      const override = techDayOverrides[dayKey];
      const hours = override
        ? Number(override.regular_hours_override ?? 0) + Number(override.overtime_hours_override ?? 0)
        : byDay[dayKey].reduce((a, e) => a + computeHours(e.clocked_in_at, e.clocked_out_at, e.lunch_minutes).hours, 0);
      const wk = getPayrollWeekStart(dayKey);
      hoursByWeek[wk] = (hoursByWeek[wk] ?? 0) + hours;
    });

    // Manual payroll adjustments override the raw clocked hours for their
    // specific pay week (used e.g. for backfilled or gross-pay-only entries
    // that have no matching time_entries rows). A pay week (Wed–Tue) rarely
    // lines up with the [start, end] window this is called with (e.g. the
    // dashboard's Mon–Sun "this week" card, or a calendar month) — when a pay
    // week only partially overlaps the window, only that fraction of its
    // adjustment counts, otherwise a week straddling a boundary gets counted
    // in full on both sides it touches.
    const techAdjs = adjustments.filter(a => a.technician_id === tech.id && a.period_start <= endDate && a.period_end >= startDate);
    techAdjs.forEach(a => {
      // A row with every override field null carries no actual adjustment
      // (e.g. an edit form opened and saved with nothing entered) — treat it
      // as a no-op instead of zeroing out that week's real computed hours.
      if (a.regular_hours_override == null && a.overtime_hours_override == null && a.gross_pay_override == null) return;
      delete hoursByWeek[a.period_start];
      const periodDays = (new Date(a.period_end) - new Date(a.period_start)) / 86400000 + 1;
      const overlapStart = a.period_start > startDate ? a.period_start : startDate;
      const overlapEnd = a.period_end < endDate ? a.period_end : endDate;
      const overlapDays = Math.max(0, (new Date(overlapEnd) - new Date(overlapStart)) / 86400000 + 1);
      const fraction = periodDays > 0 ? Math.min(1, overlapDays / periodDays) : 0;
      if (a.gross_pay_override !== null && a.gross_pay_override !== undefined) {
        total += Number(a.gross_pay_override) * fraction;
      } else {
        const regular = Number(a.regular_hours_override ?? 0);
        const overtime = Number(a.overtime_hours_override ?? 0);
        total += (regular * rate + overtime * rate * 1.5) * fraction;
      }
    });

    total += Object.values(hoursByWeek).reduce((a, h) => a + h, 0) * rate;
  });
  return total;
}

function PeriodSection({ label, id, revenue, ivu, payroll, margin, gastos, fmt }) {
  const netEst = revenue.collected - payroll - ivu.ivuTotal - gastos;
  return (
    <div className="card" id={id} style={{ marginBottom: 24, scrollMarginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid var(--border)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)', margin: 0 }}>{label}</h2>
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{revenue.count} facturas</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 16 }}>
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
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Nómina</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--orange)' }}>{fmt(payroll)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Gastos</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--warn)' }}>{fmt(gastos)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16, padding: '12px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Sub. Productos</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(revenue.subProducts)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Sub. Labor</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(revenue.subLabor)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>IVU Productos</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(revenue.taxProducts)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>IVU Labor</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(revenue.taxLabor)}</div>
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
      {margin.revenueWithCost > 0 && (
        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', marginBottom: 10 }}>Margen (sobre líneas con costo registrado)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Facturado c/costo</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{fmt(margin.revenueWithCost)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Costo suplidor</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--warn)' }}>{fmt(margin.cost)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Margen</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0e8f7a' }}>{fmt(margin.margin)} {margin.marginPct != null ? `(${margin.marginPct.toFixed(0)}%)` : ''}</div>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: netEst >= 0 ? 'var(--ok)' : 'var(--warn)', background: netEst >= 0 ? 'var(--ok-tint)' : 'var(--danger-tint)', padding: '6px 14px', borderRadius: 8 }}>
          Ganancia neta estimada: {fmt(netEst)}
        </div>
      </div>
    </div>
  );
}

import AccountingDashboardClient from './accounting-dashboard-client';
import DashboardSearch from './DashboardSearch';
import InboxWidget from './InboxWidget';
import AccountingCalendarWidget from './AccountingCalendarWidget';
import MonthPeriodSelector from './MonthPeriodSelector';
import WeekPeriodSelector from './WeekPeriodSelector';
import YearPeriodSelector from './YearPeriodSelector';

export default async function AccountingDashboard({ searchParams }) {
  const { yearStart, yearEnd, year, month } = getPeriods();

  // The "month" section defaults to the current month but can be changed to
  // any month via the ?myear=&mmonth= query params (set by MonthPeriodSelector).
  const selMonthYear = parseInt(searchParams?.myear ?? year);
  const selMonth = parseInt(searchParams?.mmonth ?? month);
  const monthStart = new Date(selMonthYear, selMonth, 1).toISOString();
  const monthEnd = new Date(selMonthYear, selMonth + 1, 0, 23, 59, 59).toISOString();

  // The "week" section defaults to the current week (Mon–Sun) but can be
  // changed via ?wstart= (the Monday date, set by WeekPeriodSelector).
  const now = new Date();
  const nowDiffToMon = (now.getDay() + 6) % 7;
  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() - nowDiffToMon);
  const currentMondayStr = `${currentMonday.getFullYear()}-${String(currentMonday.getMonth() + 1).padStart(2, '0')}-${String(currentMonday.getDate()).padStart(2, '0')}`;
  const selWeekStartStr = searchParams?.wstart ?? currentMondayStr;
  const selWeekStart = new Date(`${selWeekStartStr}T00:00:00`);
  const selWeekEnd = new Date(selWeekStart);
  selWeekEnd.setDate(selWeekStart.getDate() + 6);
  selWeekEnd.setHours(23, 59, 59, 999);
  const selWeekStartISO = selWeekStart.toISOString();
  const selWeekEndISO = selWeekEnd.toISOString();

  // The "año" section defaults to the current year but can be changed via
  // ?yyear= (set by YearPeriodSelector).
  const selYear = parseInt(searchParams?.yyear ?? year);
  const selYearStart = new Date(selYear, 0, 1).toISOString();
  const selYearEnd = new Date(selYear, 11, 31, 23, 59, 59).toISOString();

  // Payroll needs to cover the current year (for quarters), plus whatever
  // month/week/year is selected, in case those fall outside the current year.
  const rangeStarts = [yearStart, monthStart, selWeekStartISO, selYearStart];
  const rangeEnds = [yearEnd, monthEnd, selWeekEndISO, selYearEnd];
  const entriesFetchStart = rangeStarts.reduce((a, b) => (a < b ? a : b));
  const entriesFetchEnd = rangeEnds.reduce((a, b) => (a > b ? a : b));

  const [{ data: allInvoices }, { data: lineItems }, { data: technicians }, { data: timeEntries }, { data: payrollAdjustments }, { data: dailyOverrides }, { data: allPayments }, { data: inboxNotifications }, { data: allExpenses }] = await Promise.all([
    supabase.from('invoices').select('id, invoice_number, status, total, subtotal_products, tax_products, subtotal_labor, tax_labor, issued_at, clients(name, client_type)').order('issued_at', { ascending: false }),
    supabase.from('invoice_line_items').select('invoice_id, type, tax_rate, tax_amount, quantity, unit_price, supplier_price'),
    supabase.from('technicians').select('id, hourly_rate'),
    supabase.from('time_entries').select('technician_id, clocked_in_at, clocked_out_at, lunch_minutes').not('clocked_out_at', 'is', null).gte('clocked_in_at', entriesFetchStart).lte('clocked_in_at', entriesFetchEnd),
    supabase.from('payroll_adjustments').select('technician_id, period_start, period_end, regular_hours_override, overtime_hours_override, gross_pay_override').lte('period_start', entriesFetchEnd.slice(0, 10)).gte('period_end', entriesFetchStart.slice(0, 10)),
    supabase.from('daily_hour_overrides').select('technician_id, work_date, regular_hours_override, overtime_hours_override').gte('work_date', entriesFetchStart.slice(0, 10)).lte('work_date', entriesFetchEnd.slice(0, 10)),
    supabase.from('payments').select('invoice_id, amount, paid_at'),
    supabase.from('inbox_notifications').select('*').order('created_at', { ascending: false }).limit(20),
    supabase.from('expenses').select('expense_date, amount, category, job_id'),
  ]);

  const invoices = allInvoices ?? [];
  const lines = lineItems ?? [];
  const techs = technicians ?? [];
  const entries = timeEntries ?? [];
  const adjustments = payrollAdjustments ?? [];
  const dayOverrides = dailyOverrides ?? [];
  const payments = allPayments ?? [];
  const expenses = allExpenses ?? [];

  const paymentsByInvoice = {};
  payments.forEach(p => {
    if (!paymentsByInvoice[p.invoice_id]) paymentsByInvoice[p.invoice_id] = [];
    paymentsByInvoice[p.invoice_id].push(p);
  });
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const filterInvs = (start, end) => invoices.filter(i => i.issued_at && i.issued_at >= start.slice(0, 10) && i.issued_at <= end.slice(0, 10));
  const getIds = (start, end) => new Set(filterInvs(start, end).map(i => i.id));

  const weekInvs = filterInvs(selWeekStartISO, selWeekEndISO);
  const monthInvs = filterInvs(monthStart, monthEnd);
  const yearInvs = filterInvs(selYearStart, selYearEnd);

  // Quarter data
  const quarters = [
    { key: 'Q1', start: `${year}-01-01`, end: `${year}-03-31` },
    { key: 'Q2', start: `${year}-04-01`, end: `${year}-06-30` },
    { key: 'Q3', start: `${year}-07-01`, end: `${year}-09-30` },
    { key: 'Q4', start: `${year}-10-01`, end: `${year}-12-31` },
  ];

  const quarterData = quarters.map(q => {
    const qInvs = filterInvs(q.start, q.end);
    return {
      key: q.key,
      revenue: computeRevenue(qInvs, paymentsByInvoice),
      ivu: computeIVU(qInvs),
      payroll: computePayroll(q.start + 'T00:00:00.000Z', q.end + 'T23:59:59.999Z', techs, entries, adjustments, dayOverrides),
      gastos: computeExpenses(q.start, q.end, expenses),
    };
  });

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">Panel de Contabilidad</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>Resumen financiero de OTESS</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <DashboardSearch invoices={invoices.map(i => ({ id: i.id, invoice_number: i.invoice_number, clientName: i.clients?.name, total: i.total, status: i.status }))} />
            <Link href="/accounting/facturas" className="btn btn-ghost">🧾 Facturas</Link>
            <Link href="/accounting/ivu" className="btn btn-ghost">🏛 IVU</Link>
            <Link href="/accounting/payroll" className="btn btn-ghost">⏱ Nómina</Link>
            <Link href="/accounting/gastos" className="btn btn-ghost">💸 Gastos</Link>
            <Link href="/accounting/rentabilidad" className="btn btn-ghost">💰 Rentabilidad</Link>
          </div>
        </div>

        <AccountingDashboardClient quarterData={quarterData} year={year} />

        <AccountingCalendarWidget searchParams={searchParams} />

        <InboxWidget notifications={inboxNotifications ?? []} />

        <PeriodSection
          id="esta-semana"
          label={<WeekPeriodSelector weekStart={selWeekStartStr} />}
          revenue={computeRevenue(weekInvs, paymentsByInvoice)}
          ivu={computeIVU(weekInvs)}
          payroll={computePayroll(selWeekStartISO, selWeekEndISO, techs, entries, adjustments, dayOverrides)}
          margin={computeMargin(getIds(selWeekStartISO, selWeekEndISO), lines)}
          gastos={computeExpenses(selWeekStartISO, selWeekEndISO, expenses)}
          fmt={fmt}
        />
        <PeriodSection
          id="mes-seleccionado"
          label={<MonthPeriodSelector year={selMonthYear} month={selMonth} />}
          revenue={computeRevenue(monthInvs, paymentsByInvoice)}
          ivu={computeIVU(monthInvs)}
          payroll={computePayroll(monthStart, monthEnd, techs, entries, adjustments, dayOverrides)}
          margin={computeMargin(getIds(monthStart, monthEnd), lines)}
          gastos={computeExpenses(monthStart, monthEnd, expenses)}
          fmt={fmt}
        />
        <PeriodSection
          id="ano-seleccionado"
          label={<YearPeriodSelector year={selYear} />}
          revenue={computeRevenue(yearInvs, paymentsByInvoice)}
          ivu={computeIVU(yearInvs)}
          payroll={computePayroll(selYearStart, selYearEnd, techs, entries, adjustments, dayOverrides)}
          margin={computeMargin(getIds(selYearStart, selYearEnd), lines)}
          gastos={computeExpenses(selYearStart, selYearEnd, expenses)}
          fmt={fmt}
        />
      </main>
    </div>
  );
}
