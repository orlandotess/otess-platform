export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import { getCurrentProfile } from '../../../lib/supabase-server';
import { computeHours, prDayKey, prQueryBounds, prMonthRange, prYearRange } from '../../../lib/hours';
import { indexDayOverrides, splitRegularOvertime } from '../../../lib/payrollOverrides';
import { indexRates, rateForWeek, rateOn } from '../../../lib/technicianRates';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import PayrollClient from './PayrollCliente';
import { getTranslations, getLocale } from 'next-intl/server';

// Anchored to Puerto Rico's fixed UTC-4 offset via UTC methods (matches
// /admin/timesheet) so the week boundary doesn't depend on the server's own
// timezone — using local Date methods here rolled the week over 4 hours
// early relative to PR time whenever the server wasn't running in PR time.
function getWeekRange(offset = 0) {
  const now = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const day = now.getUTCDay();
  const daysSinceWed = (day + 4) % 7;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - daysSinceWed + (offset * 7));
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

// Overtime is calculated per pay-week (Wed-Tue): first 40h/week are regular, the rest is overtime.
// Entries are bucketed into pay-weeks first so this works for week, month, and year views alike.
// Any day present in `techDayOverrides` (a per-day manual correction made in
// the admin Timesheet) replaces that day's raw clocked hours entirely.
//
// `techWeekAdjustments` are whole-week manual corrections (payroll_adjustments,
// keyed by that week's own period_start/period_end) — for a week view these
// exactly match the one queried week, but a month/year view spans several
// pay-weeks at once, so each one that has an adjustment must be substituted
// individually instead of trying to match a single adjustment against the
// whole month/year (which no row's period_start/period_end ever equals).
// `rangeStart`/`rangeEnd` (the queried period's own YYYY-MM-DD bounds) decide
// which window a boundary week's money belongs to: whichever one contains
// the week's own period_start (its Wednesday), in full — never split by
// day-overlap fraction, which let the same week's pay drift out of sync with
// itself once adjacent windows (e.g. every month in a year) were summed and
// compared against one whole-year call. A week's raw hours are still
// suppressed here even when its money belongs to a different window,
// otherwise the portion of its raw entries that happen to fall inside this
// window would get silently added back on top of the adjustment counted in
// full elsewhere.
// `rateForWeekStart(wsKey)` devuelve la tarifa vigente el miércoles en que
// arranca esa semana. El dinero se acumula AQUÍ, semana por semana, y no
// afuera multiplicando las horas totales por una sola tarifa: un mes o un año
// abarcan varias semanas de pago y la tarifa pudo haber cambiado en medio, así
// que el total de horas del período ya no tiene una única tarifa que aplicarle.
function computeWeeklyOvertimeHours(techEntries, techDayOverrides = {}, techWeekAdjustments = [], rangeStart = null, rangeEnd = null, rateForWeekStart = () => 0) {
  const byWeek = {};
  const weekOf = dayKey => {
    const d = new Date(dayKey + 'T00:00:00');
    const daysSinceWed = (d.getDay() + 4) % 7;
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - daysSinceWed);
    return weekStart.toISOString().slice(0, 10);
  };
  techEntries.forEach(e => {
    const dayKey = prDayKey(e.clocked_in_at);
    const wsKey = weekOf(dayKey);
    if (!byWeek[wsKey]) byWeek[wsKey] = {};
    if (!byWeek[wsKey][dayKey]) byWeek[wsKey][dayKey] = 0;
    byWeek[wsKey][dayKey] += computeHours(e.clocked_in_at, e.clocked_out_at, e.lunch_minutes).hours;
  });
  // Make sure override-only days (no matching raw entries) are still represented.
  Object.keys(techDayOverrides).forEach(dayKey => {
    const wsKey = weekOf(dayKey);
    if (!byWeek[wsKey]) byWeek[wsKey] = {};
    if (!(dayKey in byWeek[wsKey])) byWeek[wsKey][dayKey] = 0;
  });

  const weekAdjByStart = {};
  techWeekAdjustments.forEach(a => { weekAdjByStart[a.period_start] = a; });
  // Make sure adjustment-only weeks (no raw/day entries at all) are represented.
  Object.keys(weekAdjByStart).forEach(wsKey => { if (!byWeek[wsKey]) byWeek[wsKey] = {}; });

  let regular = 0, overtime = 0, grossOverridePay = 0, regularPay = 0, overtimePay = 0;
  Object.keys(byWeek).sort().forEach(wsKey => {
    const weekAdj = weekAdjByStart[wsKey];
    const isNoOpAdj = weekAdj && weekAdj.regular_hours_override == null && weekAdj.overtime_hours_override == null && weekAdj.gross_pay_override == null;
    if (weekAdj && !isNoOpAdj) {
      const belongsHere = !rangeStart || !rangeEnd || (wsKey >= rangeStart && wsKey <= rangeEnd);
      if (belongsHere) {
        if (weekAdj.gross_pay_override !== null && weekAdj.gross_pay_override !== undefined) {
          grossOverridePay += Number(weekAdj.gross_pay_override);
        } else {
          const adjRegular = Number(weekAdj.regular_hours_override ?? 0);
          const adjOvertime = Number(weekAdj.overtime_hours_override ?? 0);
          const adjRate = rateForWeekStart(wsKey);
          regular += adjRegular;
          overtime += adjOvertime;
          regularPay += adjRegular * adjRate;
          overtimePay += adjOvertime * adjRate * 1.5;
        }
      }
      return; // this week's raw hours are suppressed either way — see comment above
    }
    const { regular: wkRegular, overtime: wkOvertime } = splitRegularOvertime(byWeek[wsKey], techDayOverrides);
    const wkRate = rateForWeekStart(wsKey);
    regular += wkRegular;
    overtime += wkOvertime;
    regularPay += wkRegular * wkRate;
    overtimePay += wkOvertime * wkRate * 1.5;
  });
  return { regular, overtime, grossOverridePay, regularPay, overtimePay };
}

export default async function AccountingPayroll(props) {
  const searchParams = await props.searchParams;
  const t = await getTranslations('accounting.payroll');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';
  const view = searchParams?.view ?? 'month';
  const year = parseInt(searchParams?.year ?? new Date().getFullYear());
  const month = searchParams?.month !== undefined ? parseInt(searchParams.month) : new Date().getMonth();
  const weekOffset = parseInt(searchParams?.week ?? '0');

  let entriesQueryStart, entriesQueryEnd, periodStart, periodEnd;
  if (view === 'week') {
    const { weekStart, weekEnd } = getWeekRange(weekOffset);
    periodStart = weekStart.toISOString().slice(0, 10);
    periodEnd = weekEnd.toISOString().slice(0, 10);
    // Widened by PR's UTC offset so an evening clock-in near the week
    // boundary isn't dropped by the query before prDayKey() can bucket it.
    const bounds = prQueryBounds(weekStart, weekEnd);
    entriesQueryStart = bounds.start.toISOString();
    entriesQueryEnd = bounds.end.toISOString();
  } else if (view === 'month') {
    const r = prMonthRange(year, month);
    entriesQueryStart = r.queryStart.toISOString();
    entriesQueryEnd = r.queryEnd.toISOString();
    periodStart = r.periodStart;
    periodEnd = r.periodEnd;
  } else {
    const r = prYearRange(year);
    entriesQueryStart = r.queryStart.toISOString();
    entriesQueryEnd = r.queryEnd.toISOString();
    periodStart = r.periodStart;
    periodEnd = r.periodEnd;
  }

  const [{ data: technicians }, { data: entries }, { data: adjustments }, { data: dayOverrides }, { data: rateRows }, { data: paidWeeks }] = await Promise.all([
    supabase.from('technicians').select('*').order('name'),
    supabase.from('time_entries')
      .select('*')
      .gte('clocked_in_at', entriesQueryStart)
      .lte('clocked_in_at', entriesQueryEnd)
      .not('clocked_out_at', 'is', null)
      .order('clocked_in_at'),
    supabase.from('payroll_adjustments')
      .select('*')
      // Overlap, not exact match — a month/year view spans several pay-weeks,
      // and no single adjustment row's period ever equals the whole range.
      .lte('period_start', periodEnd)
      .gte('period_end', periodStart),
    supabase.from('daily_hour_overrides')
      .select('*')
      .gte('work_date', periodStart)
      .lte('work_date', periodEnd),
    // Sin filtro de fecha a propósito: para saber qué tarifa regía en este
    // período hace falta la vigencia que arrancó ANTES de él, que casi nunca
    // cae dentro del rango consultado. Es una tabla de unas pocas filas por
    // técnico (una por cambio de tarifa), no de una por día.
    supabase.from('technician_rates').select('*'),
    // Las semanas ya marcadas como pagadas, de todos los tiempos: el
    // formulario de tarifa las usa para no dejar fechar una vigencia dentro
    // de una semana cuyo cheque ya salió.
    supabase.from('payroll_adjustments').select('technician_id, period_start').eq('paid', true),
  ]);

  const techs = technicians ?? [];
  const ents = entries ?? [];
  const adjs = adjustments ?? [];
  const dayOvs = dayOverrides ?? [];
  const ratesByTech = indexRates(rateRows ?? []);
  const currentProfile = await getCurrentProfile();
  const paidWeeksByTech = {};
  (paidWeeks ?? []).forEach(w => { (paidWeeksByTech[w.technician_id] ??= []).push(w.period_start); });
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].map(key => t(`months.${key}`));
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtH = h => `${Number(h).toFixed(1)}h`;

  const techStats = techs.map(tech => {
    const techEntries = ents.filter(e => e.technician_id === tech.id);
    const techDayOverrides = indexDayOverrides(dayOvs, tech.id);
    const techWeekAdjustments = adjs.filter(a => a.technician_id === tech.id);

    // Computed twice: once ignoring week-level payroll_adjustments (the
    // "raw" total the edit form resets to) and once applying every week in
    // range that has one — a month/year view spans several pay-weeks, so
    // each with its own adjustment must be substituted individually rather
    // than looking for a single adjustment matching the whole month/year.
    const rateFor = wsKey => rateForWeek(ratesByTech, tech.id, wsKey, tech.hourly_rate);
    const { regular: rawRegular, overtime: rawOvertime } = computeWeeklyOvertimeHours(techEntries, techDayOverrides, [], periodStart, periodEnd, rateFor);
    const { regular: regularHours, overtime: overtimeHours, grossOverridePay, regularPay, overtimePay } = computeWeeklyOvertimeHours(techEntries, techDayOverrides, techWeekAdjustments, periodStart, periodEnd, rateFor);

    const hasOverride = techWeekAdjustments.some(a => a.regular_hours_override != null || a.overtime_hours_override != null || a.gross_pay_override != null);

    const grossPay = grossOverridePay + regularPay + overtimePay;
    const retention = grossPay * 0.10;

    // La tarifa que se muestra en la columna es la vigente al CIERRE del
    // período. En vista de semana es la única que aplicó; en mes o año pudo
    // haber cambiado en medio, y para eso está rateVaried — el dinero de cada
    // semana ya se calculó con la suya, así que enseñar una sola como si
    // hubiera regido todo el período sería mentir sobre el total de al lado.
    const rateAtPeriodEnd = rateOn(ratesByTech, tech.id, periodEnd, tech.hourly_rate);
    const rateVaried = (ratesByTech[tech.id] ?? []).some(r => r.effective_from > periodStart && r.effective_from <= periodEnd);

    return {
      ...tech,
      hourly_rate: rateAtPeriodEnd,
      rateVaried,
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

  const totalGross = techStats.reduce((a, row) => a + row.grossPay, 0);
  const totalRetention = techStats.reduce((a, row) => a + row.retention, 0);
  const totalNet = techStats.reduce((a, row) => a + row.netPay, 0);
  const totalHours = techStats.reduce((a, row) => a + row.totalHours, 0);

  const yearBounds = prYearRange(year);
  const { data: allYearEntries } = view === 'year' ? await supabase
    .from('time_entries').select('*')
    .gte('clocked_in_at', yearBounds.queryStart.toISOString())
    .lte('clocked_in_at', yearBounds.queryEnd.toISOString())
    .not('clocked_out_at', 'is', null) : { data: ents };

  const monthlyPayroll = months.map((m, i) => {
    const { queryStart: mStart, queryEnd: mEnd } = prMonthRange(year, i);
    const mEntries = (allYearEntries ?? ents).filter(e => e.clocked_in_at >= mStart.toISOString() && e.clocked_in_at <= mEnd.toISOString());
    let gross = 0;
    techs.forEach(tech => {
      const te = mEntries.filter(e => e.technician_id === tech.id);
      // Entrada por entrada y no horas-del-mes × una tarifa: un cambio de
      // tarifa a mitad de mes tiene que partir la barra en su fecha.
      gross += te.reduce((a, e) => {
        const hours = computeHours(e.clocked_in_at, e.clocked_out_at, e.lunch_minutes).hours;
        return a + hours * rateOn(ratesByTech, tech.id, prDayKey(e.clocked_in_at), tech.hourly_rate);
      }, 0);
    });
    return { name: m.slice(0, 3), gross, net: gross * 0.9, idx: i };
  });

  const { weekStart, weekEnd } = getWeekRange(weekOffset);
  const fmtDate = d => new Date(d).toLocaleDateString(dateLocale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content main-content-wide">
        <div className="page-header">
          <div>
            <div className="page-title">{t('title')}</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
              {view === 'week' ? `${fmtDate(weekStart)} — ${fmtDate(weekEnd)}` :
               view === 'month' ? `${months[month]} ${year}` : t('yearLabel', { year })}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/accounting/payroll/historial" className="btn btn-amber">📜 {t('history')}</Link>
            <Link href="/accounting" className="btn btn-ghost">← {t('dashboard')}</Link>
          </div>
        </div>

        {/* View selector */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{t('view')}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['week', t('viewWeek')], ['month', t('viewMonth')], ['year', t('viewYear')]].map(([v, l]) => (
                  <Link key={v} href={`/accounting/payroll?view=${v}&year=${year}&month=${month}`}
                    className={`btn ${v === view ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13 }}>
                    {l}
                  </Link>
                ))}
              </div>
            </div>
            {view === 'week' && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{t('week')}</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Link href={`/accounting/payroll?view=week&week=${weekOffset - 1}`} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>← {t('previous')}</Link>
                  {weekOffset !== 0 && <Link href="/accounting/payroll?view=week" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>{t('current')}</Link>}
                  {weekOffset < 0 && <Link href={`/accounting/payroll?view=week&week=${weekOffset + 1}`} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>{t('next')} →</Link>}
                </div>
              </div>
            )}
            {(view === 'month' || view === 'year') && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{t('year')}</label>
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
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{t('month')}</label>
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
            <div className="stat-label">{t('totalHours')}</div>
            <div className="stat-value">{fmtH(totalHours)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('grossPay')}</div>
            <div className="stat-value" style={{ color: 'var(--navy)' }}>{fmt(totalGross)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('retention')}</div>
            <div className="stat-value" style={{ color: 'var(--warn)' }}>{fmt(totalRetention)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('netPay')}</div>
            <div className="stat-value" style={{ color: 'var(--ok)' }}>{fmt(totalNet)}</div>
          </div>
        </div>

        <PayrollClient
          key={`${view}_${periodStart}_${periodEnd}`}
          techStats={techStats}
          monthlyPayroll={monthlyPayroll}
          view={view}
          year={year}
          months={months}
          periodStart={periodStart}
          periodEnd={periodEnd}
          allTechnicians={techs}
          currentProfile={currentProfile}
          paidWeeksByTech={paidWeeksByTech}
        />
      </main>
    </div>
  );
}
