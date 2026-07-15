export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import { computeHours } from '../../../lib/hours';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import PayrollClient from './PayrollCliente';

function getWeekRange(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const daysSinceWed = (day + 4) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysSinceWed + (offset * 7));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

// Overtime is calculated per pay-week (Wed-Tue): first 40h/week are regular, the rest is overtime.
// Entries are bucketed into pay-weeks first so this works for week, month, and year views alike.
function computeWeeklyOvertimeHours(techEntries) {
  const byWeek = {};
  techEntries.forEach(e => {
    const d = new Date(e.clocked_in_at);
    const daysSinceWed = (d.getDay() + 4) % 7;
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - daysSinceWed);
    const wsKey = weekStart.toISOString().slice(0, 10);
    const dayKey = e.clocked_in_at.slice(0, 10);
    if (!byWeek[wsKey]) byWeek[wsKey] = {};
    if (!byWeek[wsKey][dayKey]) byWeek[wsKey][dayKey] = 0;
    byWeek[wsKey][dayKey] += computeHours(e.clocked_in_at, e.clocked_out_at, e.lunch_minutes).hours;
  });

  let regular = 0, overtime = 0;
  Object.keys(byWeek).sort().forEach(wsKey => {
    let cumulative = 0;
    Object.keys(byWeek[wsKey]).sort().forEach(dayKey => {
      const hours = byWeek[wsKey][dayKey];
      const dayRegular = Math.min(hours, Math.max(0, 40 - cumulative));
      regular += dayRegular;
      overtime += hours - dayRegular;
      cumulative += hours;
    });
  });
  return { regular, overtime };
}

export default async function AccountingPayroll({ searchParams }) {
  const view = searchParams?.view ?? 'month';
  const year = parseInt(searchParams?.year ?? new Date().getFullYear());
  const month = searchParams?.month !== undefined ? parseInt(searchParams.month) : new Date().getMonth();
  const weekOffset = parseInt(searchParams?.week ?? '0');

  let dateStart, dateEnd;
  if (view === 'week') {
    const { weekStart, weekEnd } = getWeekRange(weekOffset);
    dateStart = weekStart.toISOString();
    dateEnd = weekEnd.toISOString();
  } else if (view === 'month') {
    dateStart = new Date(year, month, 1).toISOString();
    dateEnd = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
  } else {
    dateStart = new Date(year, 0, 1).toISOString();
    dateEnd = new Date(year, 11, 31, 23, 59, 59).toISOString();
  }

  const periodStart = dateStart.slice(0, 10);
  const periodEnd = dateEnd.slice(0, 10);

  const [{ data: technicians }, { data: entries }, { data: adjustments }] = await Promise.all([
    supabase.from('technicians').select('*').order('name'),
    supabase.from('time_entries')
      .select('*')
      .gte('clocked_in_at', dateStart)
      .lte('clocked_in_at', dateEnd)
      .not('clocked_out_at', 'is', null)
      .order('clocked_in_at'),
    supabase.from('payroll_adjustments')
      .select('*')
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd),
  ]);

  const techs = technicians ?? [];
  const ents = entries ?? [];
  const adjs = adjustments ?? [];
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtH = h => `${Number(h).toFixed(1)}h`;

  const techStats = techs.map(tech => {
    const techEntries = ents.filter(e => e.technician_id === tech.id);
    const { regular: rawRegular, overtime: rawOvertime } = computeWeeklyOvertimeHours(techEntries);

    // Apply overrides if they exist
    const adj = adjs.find(a => a.technician_id === tech.id);
    const regularHours = adj?.regular_hours_override ?? rawRegular;
    const overtimeHours = adj?.overtime_hours_override ?? rawOvertime;
    const hasGrossOverride = adj?.gross_pay_override !== null && adj?.gross_pay_override !== undefined;
    const hasOverride = (adj?.regular_hours_override !== null && adj?.regular_hours_override !== undefined) || hasGrossOverride;

    const rate = Number(tech.hourly_rate ?? 0);
    // A direct gross-pay override (used for historical backfill where hours/rate at the time are unknown)
    // takes priority over the hours × rate calculation.
    const grossPay = hasGrossOverride ? Number(adj.gross_pay_override) : (regularHours * rate) + (overtimeHours * rate * 1.5);
    const regularPay = hasGrossOverride ? grossPay : regularHours * rate;
    const overtimePay = hasGrossOverride ? 0 : overtimeHours * rate * 1.5;
    const retention = grossPay * 0.10;

    return {
      ...tech,
      regularHours,
      overtimeHours,
      regularHoursRaw: rawRegular,
      overtimeHoursRaw: rawOvertime,
      totalHours: regularHours + overtimeHours,
      regularPay, overtimePay, grossPay, retention,
      netPay: grossPay - retention,
      hasOverride,
    };
  });

  const totalGross = techStats.reduce((a, t) => a + t.grossPay, 0);
  const totalRetention = techStats.reduce((a, t) => a + t.retention, 0);
  const totalNet = techStats.reduce((a, t) => a + t.netPay, 0);
  const totalHours = techStats.reduce((a, t) => a + t.totalHours, 0);

  const { data: allYearEntries } = view === 'year' ? await supabase
    .from('time_entries').select('*')
    .gte('clocked_in_at', new Date(year, 0, 1).toISOString())
    .lte('clocked_in_at', new Date(year, 11, 31, 23, 59, 59).toISOString())
    .not('clocked_out_at', 'is', null) : { data: ents };

  const monthlyPayroll = months.map((m, i) => {
    const mStart = new Date(year, i, 1).toISOString();
    const mEnd = new Date(year, i + 1, 0, 23, 59, 59).toISOString();
    const mEntries = (allYearEntries ?? ents).filter(e => e.clocked_in_at >= mStart && e.clocked_in_at <= mEnd);
    let gross = 0;
    techs.forEach(tech => {
      const te = mEntries.filter(e => e.technician_id === tech.id);
      const hours = te.reduce((a, e) => a + computeHours(e.clocked_in_at, e.clocked_out_at, e.lunch_minutes).hours, 0);
      gross += hours * Number(tech.hourly_rate ?? 0);
    });
    return { name: m.slice(0, 3), gross, net: gross * 0.9, idx: i };
  });

  const { weekStart, weekEnd } = getWeekRange(weekOffset);
  const fmtDate = d => new Date(d).toLocaleDateString('es-PR', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">Payroll</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
              {view === 'week' ? `${fmtDate(weekStart)} — ${fmtDate(weekEnd)}` :
               view === 'month' ? `${months[month]} ${year}` : `Año ${year}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/accounting/payroll/historial" className="btn btn-amber">📜 Historial</Link>
            <Link href="/accounting" className="btn btn-ghost">← Dashboard</Link>
          </div>
        </div>

        {/* View selector */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Vista</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['week','Semanal'],['month','Mensual'],['year','Anual']].map(([v, l]) => (
                  <Link key={v} href={`/accounting/payroll?view=${v}&year=${year}&month=${month}`}
                    className={`btn ${v === view ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13 }}>
                    {l}
                  </Link>
                ))}
              </div>
            </div>
            {view === 'week' && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Semana</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Link href={`/accounting/payroll?view=week&week=${weekOffset - 1}`} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>← Anterior</Link>
                  {weekOffset !== 0 && <Link href="/accounting/payroll?view=week" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>Actual</Link>}
                  {weekOffset < 0 && <Link href={`/accounting/payroll?view=week&week=${weekOffset + 1}`} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>Siguiente →</Link>}
                </div>
              </div>
            )}
            {(view === 'month' || view === 'year') && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Año</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {years.map(y => (
                    <Link key={y} href={`/accounting/payroll?view=${view}&year=${y}&month=${month}`}
                      className={`btn ${y === year ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13 }}>
                      {y}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {view === 'month' && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Mes</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {months.map((m, i) => (
                    <Link key={i} href={`/accounting/payroll?view=month&year=${year}&month=${i}`}
                      className={`btn ${i === month ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 10px', fontSize: 12 }}>
                      {m.slice(0, 3)}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Summary stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">Horas totales</div>
            <div className="stat-value">{fmtH(totalHours)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Gross Pay</div>
            <div className="stat-value" style={{ color: 'var(--navy)' }}>{fmt(totalGross)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Retención (10%)</div>
            <div className="stat-value" style={{ color: 'var(--warn)' }}>{fmt(totalRetention)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Net Pay</div>
            <div className="stat-value" style={{ color: 'var(--ok)' }}>{fmt(totalNet)}</div>
          </div>
        </div>

        <PayrollClient
          techStats={techStats}
          monthlyPayroll={monthlyPayroll}
          view={view}
          year={year}
          months={months}
          periodStart={periodStart}
          periodEnd={periodEnd}
          allTechnicians={techs}
        />
      </main>
    </div>
  );
}
