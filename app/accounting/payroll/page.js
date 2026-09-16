export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import { getCurrentProfile } from '../../../lib/supabase-server';
import { computeHours, prDayKey, prMonthRange, prYearRange } from '../../../lib/hours';
import { indexDayOverrides, splitRegularOvertime } from '../../../lib/payrollOverrides';
import { indexRates, rateForWeek, rateOn } from '../../../lib/technicianRates';
import { computeRetentions, payDateForWeek } from '../../../lib/payrollRetention';
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
  // Además del total del período, el desglose semana por semana: la retención
  // necesita el bruto de CADA semana por separado (los primeros $500 del año
  // se consumen en orden de fecha de pago), y la gráfica mensual necesita
  // repartir esas mismas semanas por mes sin volver a calcular nada.
  const weeks = {};
  Object.keys(byWeek).sort().forEach(wsKey => {
    const weekAdj = weekAdjByStart[wsKey];
    const isNoOpAdj = weekAdj && weekAdj.regular_hours_override == null && weekAdj.overtime_hours_override == null && weekAdj.gross_pay_override == null;
    if (weekAdj && !isNoOpAdj) {
      const belongsHere = !rangeStart || !rangeEnd || (wsKey >= rangeStart && wsKey <= rangeEnd);
      if (belongsHere) {
        if (weekAdj.gross_pay_override !== null && weekAdj.gross_pay_override !== undefined) {
          grossOverridePay += Number(weekAdj.gross_pay_override);
          weeks[wsKey] = { regular: 0, overtime: 0, regularPay: 0, overtimePay: 0, grossOverridePay: Number(weekAdj.gross_pay_override) };
        } else {
          const adjRegular = Number(weekAdj.regular_hours_override ?? 0);
          const adjOvertime = Number(weekAdj.overtime_hours_override ?? 0);
          const adjRate = rateForWeekStart(wsKey);
          regular += adjRegular;
          overtime += adjOvertime;
          regularPay += adjRegular * adjRate;
          overtimePay += adjOvertime * adjRate * 1.5;
          weeks[wsKey] = { regular: adjRegular, overtime: adjOvertime, regularPay: adjRegular * adjRate, overtimePay: adjOvertime * adjRate * 1.5, grossOverridePay: 0 };
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
    weeks[wsKey] = { regular: wkRegular, overtime: wkOvertime, regularPay: wkRegular * wkRate, overtimePay: wkOvertime * wkRate * 1.5, grossOverridePay: 0 };
  });
  return { regular, overtime, grossOverridePay, regularPay, overtimePay, weeks };
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

  // Solo hacen falta los bordes del período: las entradas se consultan por año
  // completo (ver abajo) y cada semana se atribuye al período de su miércoles,
  // así que ya no hay que recortar la consulta al período exacto.
  let periodStart, periodEnd;
  if (view === 'week') {
    const { weekStart, weekEnd } = getWeekRange(weekOffset);
    periodStart = weekStart.toISOString().slice(0, 10);
    periodEnd = weekEnd.toISOString().slice(0, 10);
  } else if (view === 'month') {
    const r = prMonthRange(year, month);
    periodStart = r.periodStart;
    periodEnd = r.periodEnd;
  } else {
    const r = prYearRange(year);
    periodStart = r.periodStart;
    periodEnd = r.periodEnd;
  }

  // Se consulta el AÑO COMPLETO que cubre el período, no solo el período.
  // La retención lo obliga: los primeros $500 del año de cada técnico van
  // exentos y se consumen en orden de fecha de pago, así que para saber
  // cuánta exención le queda a la semana que se está mirando hay que conocer
  // todas las semanas anteriores de ese año. De paso, trabajar sobre el año
  // entero deja que cada semana se atribuya completa al período de su
  // miércoles — igual que hace el dashboard — en vez de partirse por días
  // cuando cruza un fin de mes, que era la razón por la que las dos pantallas
  // no cuadraban mes a mes.
  // Cubre el año del período y también el del selector (`year`), que en vista
  // semanal pueden ser distintos: la gráfica de barras es siempre la de `year`.
  const retYearStart = prYearRange(Math.min(parseInt(periodStart.slice(0, 4)), year));
  const retYearEnd = prYearRange(Math.max(parseInt(periodEnd.slice(0, 4)), year));
  // Ensanchado 14 días por cada lado: una semana se atribuye al período de su
  // FECHA DE PAGO (el viernes, 9 días después del miércoles en que arranca),
  // así que la semana que paga el 2 de enero arrancó en diciembre y hay que
  // traerla igual.
  const MS_14D = 14 * 86400000;
  const yearQueryStart = new Date(retYearStart.queryStart.getTime() - MS_14D).toISOString();
  const yearQueryEnd = new Date(retYearEnd.queryEnd.getTime() + MS_14D).toISOString();
  const yearStartStr = new Date(new Date(retYearStart.periodStart + 'T00:00:00').getTime() - MS_14D).toISOString().slice(0, 10);
  const yearEndStr = new Date(new Date(retYearEnd.periodEnd + 'T00:00:00').getTime() + MS_14D).toISOString().slice(0, 10);

  const [{ data: technicians }, { data: entries }, { data: adjustments }, { data: dayOverrides }, { data: rateRows }, { data: paidWeeks }] = await Promise.all([
    supabase.from('technicians').select('*').order('name'),
    supabase.from('time_entries')
      .select('*')
      .gte('clocked_in_at', yearQueryStart)
      .lte('clocked_in_at', yearQueryEnd)
      .not('clocked_out_at', 'is', null)
      .order('clocked_in_at'),
    supabase.from('payroll_adjustments')
      .select('*')
      .lte('period_start', yearEndStr)
      .gte('period_end', yearStartStr),
    supabase.from('daily_hour_overrides')
      .select('*')
      .gte('work_date', yearStartStr)
      .lte('work_date', yearEndStr),
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

  // Una pasada por técnico sobre el AÑO completo. De ahí sale todo: el
  // desglose por semana alimenta la retención (que necesita el año entero) y
  // la gráfica mensual, y el período que se está mirando es un filtro sobre
  // esas mismas semanas — nunca un cálculo aparte que pudiera discrepar.
  const yearByTech = {};
  techs.forEach(tech => {
    const techEntries = ents.filter(e => e.technician_id === tech.id);
    const techDayOverrides = indexDayOverrides(dayOvs, tech.id);
    const techWeekAdjustments = adjs.filter(a => a.technician_id === tech.id);
    const rateFor = wsKey => rateForWeek(ratesByTech, tech.id, wsKey, tech.hourly_rate);
    // Dos veces: una ignorando los ajustes de semana (el total "crudo" al que
    // vuelve el editor cuando se borra la corrección) y otra aplicándolos.
    yearByTech[tech.id] = {
      raw: computeWeeklyOvertimeHours(techEntries, techDayOverrides, [], null, null, rateFor).weeks,
      applied: computeWeeklyOvertimeHours(techEntries, techDayOverrides, techWeekAdjustments, null, null, rateFor).weeks,
      hasAnyAdjustment: techWeekAdjustments,
    };
  });

  // La retención de una semana depende de las anteriores del año, así que se
  // resuelve de una sola vez para todas las semanas de todos los técnicos.
  const retentionEvents = [];
  techs.forEach(tech => {
    Object.entries(yearByTech[tech.id].applied).forEach(([wsKey, w]) => {
      retentionEvents.push({
        key: `${tech.id}|${wsKey}`,
        technicianId: tech.id,
        payDate: payDateForWeek(wsKey),
        gross: w.regularPay + w.overtimePay + w.grossOverridePay,
      });
    });
  });
  const retentionByWeek = computeRetentions(retentionEvents);

  // Una semana pertenece al período en que se PAGA (el viernes), no al del
  // miércoles en que arrancó. Es como el Historial ya agrupaba sus meses
  // (usa fridayDate), y es lo que hace que el dinero y su retención caigan
  // siempre juntos: la exención de los $500 se consume por año de fecha de
  // pago. Atribuyendo por miércoles, la semana del 31 dic 2025 — que paga el
  // 9 de enero — se caía de todas las vistas de 2026 y se llevaba consigo la
  // exención que había consumido.
  const inPeriod = wsKey => {
    const pd = payDateForWeek(wsKey);
    return pd >= periodStart && pd <= periodEnd;
  };

  const techStats = techs.map(tech => {
    const { raw, applied, hasAnyAdjustment } = yearByTech[tech.id];
    const techWeekAdjustments = hasAnyAdjustment;

    let rawRegular = 0, rawOvertime = 0;
    Object.entries(raw).forEach(([wsKey, w]) => {
      if (!inPeriod(wsKey)) return;
      rawRegular += w.regular; rawOvertime += w.overtime;
    });

    let regularHours = 0, overtimeHours = 0, grossOverridePay = 0, regularPay = 0, overtimePay = 0, retention = 0;
    Object.entries(applied).forEach(([wsKey, w]) => {
      if (!inPeriod(wsKey)) return;
      regularHours += w.regular; overtimeHours += w.overtime;
      regularPay += w.regularPay; overtimePay += w.overtimePay;
      grossOverridePay += w.grossOverridePay;
      retention += retentionByWeek[`${tech.id}|${wsKey}`]?.retention ?? 0;
    });

    const hasOverride = techWeekAdjustments.some(a => inPeriod(a.period_start)
      && (a.regular_hours_override != null || a.overtime_hours_override != null || a.gross_pay_override != null));

    const grossPay = grossOverridePay + regularPay + overtimePay;

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

  // La gráfica sale de las MISMAS semanas ya calculadas, repartidas por el mes
  // de su miércoles. Antes se recalculaba aparte a partir de las horas crudas
  // por tarifa, sin el corte de 40h y sin los ajustes manuales, así que la
  // barra de un mes podía quedar muy por debajo de la tabla de esta misma
  // página (julio: $2,764 en la barra contra $6,095 en la tabla).
  const monthlyPayroll = months.map((m, i) => {
    let gross = 0, retention = 0;
    techs.forEach(tech => {
      Object.entries(yearByTech[tech.id].applied).forEach(([wsKey, w]) => {
        const pd = new Date(payDateForWeek(wsKey) + 'T00:00:00');
        if (pd.getFullYear() !== year || pd.getMonth() !== i) return;
        gross += w.regularPay + w.overtimePay + w.grossOverridePay;
        retention += retentionByWeek[`${tech.id}|${wsKey}`]?.retention ?? 0;
      });
    });
    return { name: m.slice(0, 3), gross, net: gross - retention, idx: i };
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
