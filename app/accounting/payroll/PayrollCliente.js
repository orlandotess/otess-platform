'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';

export default function PayrollClient({ techStats: initialStats, monthlyPayroll, view, year, months, periodStart, periodEnd, allTechnicians = [] }) {
  const [stats, setStats] = useState(initialStats);
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualTechId, setManualTechId] = useState('');
  const [manualForm, setManualForm] = useState({ regular: '', overtime: '' });
  const [savingManual, setSavingManual] = useState(false);

  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtH = h => `${Number(h).toFixed(1)}h`;

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

    // Save hour overrides to payroll_adjustments
    await supabase.from('payroll_adjustments').upsert({
      technician_id: tech.id,
      period_start: periodStart,
      period_end: periodEnd,
      regular_hours_override: newRegular !== tech.regularHoursRaw ? newRegular : null,
      overtime_hours_override: newOvertime !== tech.overtimeHoursRaw ? newOvertime : null,
    }, { onConflict: 'technician_id,period_start,period_end' });

    const updated = recalc(newRate, newRegular, newOvertime);
    setStats(prev => prev.map(t => t.id === tech.id ? { ...t, hourly_rate: newRate, ...updated } : t));
    setEditing(null);
    setSaving(false);
  }

  async function saveManualPayroll() {
    if (!manualTechId) return;
    setSavingManual(true);
    const tech = stats.find(t => t.id === manualTechId) || allTechnicians.find(t => t.id === manualTechId);
    const regular = parseFloat(manualForm.regular) || 0;
    const overtime = parseFloat(manualForm.overtime) || 0;

    await supabase.from('payroll_adjustments').upsert({
      technician_id: manualTechId,
      period_start: periodStart,
      period_end: periodEnd,
      regular_hours_override: regular,
      overtime_hours_override: overtime,
    }, { onConflict: 'technician_id,period_start,period_end' });

    const rate = Number(tech?.hourly_rate ?? 0);
    const updated = recalc(rate, regular, overtime);

    setStats(prev => {
      const exists = prev.find(t => t.id === manualTechId);
      if (exists) {
        return prev.map(t => t.id === manualTechId ? { ...t, ...updated, hasOverride: true } : t);
      }
      return [...prev, { ...tech, ...updated, hasOverride: true }];
    });

    setShowManualAdd(false);
    setManualTechId('');
    setManualForm({ regular: '', overtime: '' });
    setSavingManual(false);
  }

  const totGross = stats.reduce((a, t) => a + t.grossPay, 0);
  const totRet = stats.reduce((a, t) => a + t.retention, 0);
  const totNet = stats.reduce((a, t) => a + t.netPay, 0);
  const totH = stats.reduce((a, t) => a + t.totalHours, 0);

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Por técnico</p>
          <button className="btn btn-amber" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setShowManualAdd(true)}>+ Agregar payroll manual</button>
        </div>
        {stats.every(t => t.totalHours === 0) ? (
          <div className="empty"><p>No hay entradas de tiempo para este período.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Técnico</th>
                  <th style={{ textAlign: 'right' }}>Tarifa/h</th>
                  <th style={{ textAlign: 'right' }}>Horas Reg.</th>
                  <th style={{ textAlign: 'right' }}>Horas OT</th>
                  <th style={{ textAlign: 'right' }}>Total Horas</th>
                  <th style={{ textAlign: 'right' }}>Pay Regular</th>
                  <th style={{ textAlign: 'right' }}>Pay OT (1.5x)</th>
                  <th style={{ textAlign: 'right' }}>Gross Pay</th>
                  <th style={{ textAlign: 'right' }}>Retención (10%)</th>
                  <th style={{ textAlign: 'right' }}>Net Pay</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stats.filter(t => t.totalHours > 0 || editing === t.id).map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 700 }}>{t.name}</td>
                    <td style={{ textAlign: 'right' }}>
                      {editing === t.id ? (
                        <input type="number" value={editData.rate} onChange={e => setEditData(d => ({ ...d, rate: e.target.value }))}
                          style={{ width: 80, padding: '4px 8px', border: '1.5px solid var(--amber)', borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }} />
                      ) : <span style={{ color: 'var(--muted)' }}>{fmt(t.hourly_rate)}/h</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {editing === t.id ? (
                        <input type="number" step="0.1" value={editData.regular} onChange={e => setEditData(d => ({ ...d, regular: e.target.value }))}
                          style={{ width: 80, padding: '4px 8px', border: '1.5px solid var(--amber)', borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }} />
                      ) : (
                        <span style={{ color: t.hasOverride ? 'var(--amber)' : 'var(--muted)' }}>
                          {fmtH(t.regularHours)}{t.hasOverride ? ' ✏️' : ''}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {editing === t.id ? (
                        <input type="number" step="0.1" value={editData.overtime} onChange={e => setEditData(d => ({ ...d, overtime: e.target.value }))}
                          style={{ width: 80, padding: '4px 8px', border: '1.5px solid var(--amber)', borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }} />
                      ) : (
                        <span style={{ color: t.overtimeHours > 0 ? 'var(--amber)' : 'var(--muted)' }}>{fmtH(t.overtimeHours)}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtH(t.totalHours)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(t.regularPay)}</td>
                    <td style={{ textAlign: 'right', color: t.overtimePay > 0 ? 'var(--amber)' : 'var(--muted)' }}>{fmt(t.overtimePay)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(t.grossPay)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--warn)' }}>{fmt(t.retention)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ok)' }}>{fmt(t.netPay)}</td>
                    <td>
                      {editing === t.id ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => saveTech(t)} disabled={saving}>
                            {saving ? '...' : '💾'}
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditing(null)}>✕</button>
                        </div>
                      ) : (
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => startEdit(t)}>✏️</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td colSpan={4} style={{ fontWeight: 700, paddingTop: 12 }}>TOTAL</td>
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
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Desglose mensual {year}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mes</th>
                  <th style={{ textAlign: 'right' }}>Gross Pay</th>
                  <th style={{ textAlign: 'right' }}>Retención (10%)</th>
                  <th style={{ textAlign: 'right' }}>Net Pay</th>
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
                  <td style={{ fontWeight: 700, paddingTop: 12 }}>TOTAL</td>
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
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Agregar payroll manual</h2>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Técnico</label>
              <select value={manualTechId} onChange={e => setManualTechId(e.target.value)}>
                <option value="">— Seleccionar técnico —</option>
                {allTechnicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div className="form-group">
                <label>Horas regulares</label>
                <input type="number" step="0.1" min="0" value={manualForm.regular} onChange={e => setManualForm(f => ({ ...f, regular: e.target.value }))} placeholder="0.0" />
              </div>
              <div className="form-group">
                <label>Horas overtime</label>
                <input type="number" step="0.1" min="0" value={manualForm.overtime} onChange={e => setManualForm(f => ({ ...f, overtime: e.target.value }))} placeholder="0.0" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={saveManualPayroll} disabled={savingManual || !manualTechId} style={{ flex: 1, justifyContent: 'center' }}>
                {savingManual ? 'Guardando...' : '💾 Guardar'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setShowManualAdd(false); setManualTechId(''); setManualForm({ regular: '', overtime: '' }); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
