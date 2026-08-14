'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { supabase } from '../../../lib/supabase';
import SearchBox from '../../SearchBox';

export default function PayrollClient({ techStats: initialStats, monthlyPayroll, view, year, months, periodStart, periodEnd, allTechnicians = [] }) {
  const router = useRouter();
  const t = useTranslations('accounting.payrollClient');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';
  const [stats, setStats] = useState(initialStats);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualTechId, setManualTechId] = useState('');
  const [manualForm, setManualForm] = useState({ regular: '', overtime: '', date: periodStart, grossPay: '', paid: false });
  const [savingManual, setSavingManual] = useState(false);

  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtH = h => `${Number(h).toFixed(1)}h`;

  const payDate = (() => {
    const end = new Date(periodEnd + 'T00:00:00');
    const friday = new Date(end);
    friday.setDate(end.getDate() + 3); // Tue (period end) + 3 = following Fri
    return friday.toLocaleDateString(dateLocale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  })();

  function startEdit(tech) {
    setEditing(tech.id);
    setEditData({
      rate: tech.hourly_rate ?? 0,
      regular: tech.regularHours.toFixed(1),
      overtime: tech.overtimeHours.toFixed(1),
    });
  }

  function recalc(rate, regular, overtime) {
    const r = parseFloat(rate) || 0;
    const rh = parseFloat(regular) || 0;
    const oh = parseFloat(overtime) || 0;
    const regularPay = rh * r;
    const overtimePay = oh * r * 1.5;
    const grossPay = regularPay + overtimePay;
    const retention = grossPay * 0.10;
    return { regularHours: rh, overtimeHours: oh, totalHours: rh + oh, regularPay, overtimePay, grossPay, retention, netPay: grossPay - retention };
  }

  async function saveTech(tech) {
    setSaving(true);
    const newRate = parseFloat(editData.rate) || 0;
    const newRegular = parseFloat(editData.regular) || 0;
    const newOvertime = parseFloat(editData.overtime) || 0;

    // Save rate to technicians table
    await supabase.from('technicians').update({ hourly_rate: newRate }).eq('id', tech.id);

    // Only touch payroll_adjustments if the hours actually differ from the
    // computed raw total — editing just the rate (hours left untouched)
    // used to still upsert a row with both hour fields set to null, which
    // silently zeroed out that tech's real hours everywhere else the
    // adjustment was read.
    const hoursChanged = newRegular !== tech.regularHoursRaw || newOvertime !== tech.overtimeHoursRaw;
    if (hoursChanged) {
      // Editing hours here means the pay should follow hours × rate going
      // forward, so clear any previous direct gross-pay override for this period.
      await supabase.from('payroll_adjustments').upsert({
        technician_id: tech.id,
        period_start: periodStart,
        period_end: periodEnd,
        regular_hours_override: newRegular,
        overtime_hours_override: newOvertime,
        gross_pay_override: null,
      }, { onConflict: 'technician_id,period_start,period_end' });
    } else if (tech.hasOverride) {
      // Hours now match the raw computed total — the override is redundant, remove it.
      await supabase.from('payroll_adjustments').delete()
        .eq('technician_id', tech.id)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd);
    }

    const updated = recalc(newRate, newRegular, newOvertime);
    setStats(prev => prev.map(row => row.id === tech.id ? { ...row, hourly_rate: newRate, ...updated, hasOverride: hoursChanged } : row));
    setEditing(null);
    setSaving(false);
  }

  async function resetOverride(tech) {
    if (!confirm(t('confirmResetOverride', { name: tech.name }))) return;
    setSaving(true);

    await supabase.from('payroll_adjustments').delete()
      .eq('technician_id', tech.id)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd);

    const updated = recalc(tech.hourly_rate, tech.regularHoursRaw, tech.overtimeHoursRaw);
    setStats(prev => prev.map(row => row.id === tech.id ? { ...row, ...updated, hasOverride: false } : row));
    setEditing(null);
    setSaving(false);
  }

  function getWeekRangeForDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    const daysSinceWed = (day + 4) % 7;
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - daysSinceWed);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return { start: weekStart.toISOString().slice(0, 10), end: weekEnd.toISOString().slice(0, 10) };
  }

  async function saveManualPayroll() {
    const hasValue = parseFloat(manualForm.regular) > 0 || parseFloat(manualForm.overtime) > 0
      || (manualForm.grossPay !== '' && parseFloat(manualForm.grossPay) > 0);
    if (!manualTechId || !hasValue) return;
    setSavingManual(true);
    const tech = stats.find(row => row.id === manualTechId) || allTechnicians.find(row => row.id === manualTechId);
    const regular = parseFloat(manualForm.regular) || 0;
    const overtime = parseFloat(manualForm.overtime) || 0;
    const grossOverride = manualForm.grossPay !== '' ? parseFloat(manualForm.grossPay) : null;
    const { start: targetPeriodStart, end: targetPeriodEnd } = getWeekRangeForDate(manualForm.date || periodStart);

    await supabase.from('payroll_adjustments').upsert({
      technician_id: manualTechId,
      period_start: targetPeriodStart,
      period_end: targetPeriodEnd,
      regular_hours_override: regular,
      overtime_hours_override: overtime,
      gross_pay_override: grossOverride,
      paid: manualForm.paid,
    }, { onConflict: 'technician_id,period_start,period_end' });

    const isCurrentPeriod = targetPeriodStart === periodStart && targetPeriodEnd === periodEnd;

    setShowManualAdd(false);
    setManualTechId('');
    setSavingManual(false);

    if (isCurrentPeriod) {
      const rate = Number(tech?.hourly_rate ?? 0);
      const updated = grossOverride != null
        ? { regularHours: regular, overtimeHours: overtime, totalHours: regular + overtime, regularPay: grossOverride, overtimePay: 0, grossPay: grossOverride, retention: grossOverride * 0.10, netPay: grossOverride * 0.90 }
        : recalc(rate, regular, overtime);
      setStats(prev => {
        const exists = prev.find(row => row.id === manualTechId);
        if (exists) {
          return prev.map(row => row.id === manualTechId ? { ...row, ...updated, hasOverride: true } : row);
        }
        return [...prev, { ...tech, ...updated, hasOverride: true }];
      });
      setManualForm({ regular: '', overtime: '', date: periodStart, grossPay: '', paid: false });
    } else {
      // Navigate to the week view containing the chosen date so the entry is visible immediately
      const now = new Date();
      const currentWeekStart = new Date(now);
      const day = now.getDay();
      currentWeekStart.setDate(now.getDate() - ((day + 4) % 7));
      const weeksDiff = Math.round((new Date(targetPeriodStart) - currentWeekStart) / (7 * 86400000));
      router.push(`/accounting/payroll?view=week&week=${weeksDiff}`);
    }
  }

  const totGross = stats.reduce((a, row) => a + row.grossPay, 0);
  const totRet = stats.reduce((a, row) => a + row.retention, 0);
  const totNet = stats.reduce((a, row) => a + row.netPay, 0);
  const totH = stats.reduce((a, row) => a + row.totalHours, 0);

  const query = search.trim().toLowerCase();
  const visibleStats = query ? stats.filter(row => row.name.toLowerCase().includes(query)) : stats;

  const manualHasValue = parseFloat(manualForm.regular) > 0 || parseFloat(manualForm.overtime) > 0
    || (manualForm.grossPay !== '' && parseFloat(manualForm.grossPay) > 0);
  const manualWeekRange = getWeekRangeForDate(manualForm.date || periodStart);

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{t('byTechnician')}</p>
            {view === 'week' && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>💰 {t('payDate', { date: payDate })}</p>}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
            <button className="btn btn-amber" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setShowManualAdd(true)}>{t('addManualPayroll')}</button>
          </div>
        </div>
        {stats.every(row => row.totalHours === 0 && !row.hasOverride) ? (
          <div className="empty"><p>{t('emptyPeriod')}</p></div>
        ) : visibleStats.length === 0 ? (
          <div className="empty"><p>{t('noResultsFor', { search })}</p></div>
        ) : (
          <div className="table-wrap">
            <table className="table-dense">
              <thead>
                <tr>
                  <th>{t('columns.technician')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.rate')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.regularHours')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.overtimeHours')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.totalHours')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.regularPay')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.overtimePay')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.grossPay')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.retention')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.netPay')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleStats.filter(row => row.totalHours > 0 || row.hasOverride || editing === row.id).map(row => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 700 }}>{row.name}</td>
                    <td style={{ textAlign: 'right' }}>
                      {editing === row.id ? (
                        <input type="number" value={editData.rate} onChange={e => setEditData(d => ({ ...d, rate: e.target.value }))}
                          style={{ width: 80, padding: '4px 8px', border: '1.5px solid var(--amber)', borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }} />
                      ) : <span style={{ color: 'var(--muted)' }}>{fmt(row.hourly_rate)}/h</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {editing === row.id ? (
                        <input type="number" step="0.1" value={editData.regular} onChange={e => setEditData(d => ({ ...d, regular: e.target.value }))}
                          style={{ width: 80, padding: '4px 8px', border: '1.5px solid var(--amber)', borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }} />
                      ) : (
                        <span style={{ color: row.hasOverride ? 'var(--amber)' : 'var(--muted)' }}>
                          {fmtH(row.regularHours)}{row.hasOverride ? ' ✏️' : ''}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {editing === row.id ? (
                        <input type="number" step="0.1" value={editData.overtime} onChange={e => setEditData(d => ({ ...d, overtime: e.target.value }))}
                          style={{ width: 80, padding: '4px 8px', border: '1.5px solid var(--amber)', borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }} />
                      ) : (
                        <span style={{ color: row.overtimeHours > 0 ? 'var(--amber)' : 'var(--muted)' }}>{fmtH(row.overtimeHours)}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtH(row.totalHours)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(row.regularPay)}</td>
                    <td style={{ textAlign: 'right', color: row.overtimePay > 0 ? 'var(--amber)' : 'var(--muted)' }}>{fmt(row.overtimePay)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(row.grossPay)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--warn)' }}>{fmt(row.retention)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ok)' }}>{fmt(row.netPay)}</td>
                    <td>
                      {editing === row.id ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => saveTech(row)} disabled={saving}>
                            {saving ? '...' : '💾'}
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditing(null)}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => startEdit(row)}>✏️</button>
                          {row.hasOverride && (
                            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', color: 'var(--warn)' }} onClick={() => resetOverride(row)} disabled={saving} title={t('deleteOverride')}>🗑</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td colSpan={4} style={{ fontWeight: 700, paddingTop: 12 }}>{t('total')}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmtH(totH)}</td>
                  <td colSpan={2} style={{ paddingTop: 12 }}></td>
                  <td style={{ textAlign: 'right', fontWeight: 900, color: 'var(--navy)', paddingTop: 12 }}>{fmt(totGross)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--warn)', paddingTop: 12 }}>{fmt(totRet)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 900, color: 'var(--ok)', paddingTop: 12 }}>{fmt(totNet)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {view === 'year' && (
        <div className="card">
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>{t('monthlyBreakdown', { year })}</p>
          <div className="table-wrap">
            <table className="table-dense">
              <thead>
                <tr>
                  <th>{t('columns.month')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.grossPay')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.retention')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.netPay')}</th>
                </tr>
              </thead>
              <tbody>
                {monthlyPayroll.map(m => (
                  <tr key={m.idx} style={{ opacity: m.gross === 0 ? 0.4 : 1 }}>
                    <td style={{ color: 'var(--amber)', fontWeight: 600 }}>{m.name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(m.gross)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--warn)' }}>{fmt(m.gross * 0.1)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ok)' }}>{fmt(m.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td style={{ fontWeight: 700, paddingTop: 12 }}>{t('total')}</td>
                  <td style={{ textAlign: 'right', fontWeight: 900, color: 'var(--navy)', paddingTop: 12 }}>{fmt(totGross)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--warn)', paddingTop: 12 }}>{fmt(totRet)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 900, color: 'var(--ok)', paddingTop: 12 }}>{fmt(totNet)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      {showManualAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>{t('modal.title')}</h2>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>{t('modal.technician')}</label>
              <select value={manualTechId} onChange={e => setManualTechId(e.target.value)}>
                <option value="">{t('modal.selectTechnician')}</option>
                {allTechnicians.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>{t('modal.dateLabel')}</label>
              <input type="date" value={manualForm.date} onChange={e => setManualForm(f => ({ ...f, date: e.target.value }))} />
              <p style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4, fontWeight: 700 }}>
                {t('modal.payWeek', { start: manualWeekRange.start, end: manualWeekRange.end })}
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div className="form-group">
                <label>{t('modal.regularHours')}</label>
                <input type="number" step="0.1" min="0" value={manualForm.regular} onChange={e => setManualForm(f => ({ ...f, regular: e.target.value }))} placeholder="0.0" />
              </div>
              <div className="form-group">
                <label>{t('modal.overtimeHours')}</label>
                <input type="number" step="0.1" min="0" value={manualForm.overtime} onChange={e => setManualForm(f => ({ ...f, overtime: e.target.value }))} placeholder="0.0" />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>{t('modal.grossPayLabel')}</label>
              <input type="number" step="0.01" min="0" value={manualForm.grossPay} onChange={e => setManualForm(f => ({ ...f, grossPay: e.target.value }))} placeholder="0.00" />
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t('modal.grossPayHint')}</p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={manualForm.paid} onChange={e => setManualForm(f => ({ ...f, paid: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              {t('modal.alreadyPaid')}
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={saveManualPayroll} disabled={savingManual || !manualTechId || !manualHasValue} style={{ flex: 1, justifyContent: 'center' }}>
                {savingManual ? t('modal.saving') : t('modal.save')}
              </button>
              <button className="btn btn-ghost" onClick={() => { setShowManualAdd(false); setManualTechId(''); setManualForm({ regular: '', overtime: '', date: periodStart, grossPay: '', paid: false }); }}>{t('modal.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
