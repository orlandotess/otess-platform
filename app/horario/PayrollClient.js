'use client';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';

const OVERTIME_THRESHOLD = 8; // hours per day
const OVERTIME_MULTIPLIER = 1.5;
const RETENTION_RATE = 0.10;

function calcDayHours(entries) {
  // Group by day
  const byDay = {};
  entries.forEach(e => {
    if (!e.clocked_out_at) return;
    const day = new Date(e.clocked_in_at).toDateString();
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(e);
  });

  let regularHours = 0;
  let overtimeHours = 0;
  const dayDetails = [];

  Object.entries(byDay).forEach(([day, dayEntries]) => {
    let dayTotal = 0;
    dayEntries.forEach(e => {
      const duration = (new Date(e.clocked_out_at) - new Date(e.clocked_in_at)) / 3600000 - (e.lunch_minutes ?? 0) / 60;
      dayTotal += duration;
    });
    const reg = Math.min(dayTotal, OVERTIME_THRESHOLD);
    const ot = Math.max(0, dayTotal - OVERTIME_THRESHOLD);
    regularHours += reg;
    overtimeHours += ot;
    dayDetails.push({ day, total: dayTotal, regular: reg, overtime: ot, entries: dayEntries });
  });

  return { regularHours, overtimeHours, totalHours: regularHours + overtimeHours, dayDetails };
}

function calcPay(regularHours, overtimeHours, hourlyRate) {
  const regularPay = regularHours * hourlyRate;
  const overtimePay = overtimeHours * hourlyRate * OVERTIME_MULTIPLIER;
  const grossPay = regularPay + overtimePay;
  const retention = grossPay * RETENTION_RATE;
  const netPay = grossPay - retention;
  return { regularPay, overtimePay, grossPay, retention, netPay };
}

const fmt = n => `$${Number(n).toFixed(2)}`;
const fmtH = h => `${h.toFixed(2)}h`;
const fmtTime = d => new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
const fmtDate = d => new Date(d).toLocaleDateString('es-PR', { weekday: 'short', month: 'short', day: 'numeric' });

export default function PayrollClient({ technicians, entries, weekStart, weekEnd, weekLabel }) {
  const router = useRouter();
  const [selected, setSelected] = useState(null);
  const [editingRate, setEditingRate] = useState(null);
  const [newRate, setNewRate] = useState('');
  const [saving, setSaving] = useState(false);

  async function saveRate(techId) {
    setSaving(true);
    await supabase.from('technicians').update({ hourly_rate: parseFloat(newRate) }).eq('id', techId);
    setSaving(false);
    setEditingRate(null);
    router.refresh();
  }

  // Summary totals
  const totals = technicians.map(tech => {
    const techEntries = entries.filter(e => e.technician_id === tech.id);
    const { regularHours, overtimeHours, totalHours, dayDetails } = calcDayHours(techEntries);
    const pay = calcPay(regularHours, overtimeHours, tech.hourly_rate ?? 0);
    return { tech, regularHours, overtimeHours, totalHours, dayDetails, ...pay };
  });

  const selectedTech = selected ? totals.find(t => t.tech.id === selected) : null;

  return (
    <div>
      {/* Summary table */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Resumen semanal — {weekLabel}</h2>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Semana: Mié → Mar · Overtime después de 8h/día · Retención 10%</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Técnico</th>
                <th>Rate/hr</th>
                <th style={{ textAlign: 'right' }}>Hrs regulares</th>
                <th style={{ textAlign: 'right' }}>Hrs overtime</th>
                <th style={{ textAlign: 'right' }}>Total hrs</th>
                <th style={{ textAlign: 'right' }}>Pago regular</th>
                <th style={{ textAlign: 'right' }}>Pago OT</th>
                <th style={{ textAlign: 'right' }}>Bruto</th>
                <th style={{ textAlign: 'right' }}>Retención 10%</th>
                <th style={{ textAlign: 'right' }}>Neto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {totals.map(row => (
                <tr key={row.tech.id} style={{ cursor: 'pointer', background: selected === row.tech.id ? '#f0f4ff' : 'transparent' }}
                  onClick={() => setSelected(selected === row.tech.id ? null : row.tech.id)}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{row.tech.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{row.tech.position}</div>
                  </td>
                  <td>
                    {editingRate === row.tech.id ? (
                      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                        <input type="number" value={newRate} onChange={e => setNewRate(e.target.value)}
                          style={{ width: 70, padding: '4px 8px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 13 }}
                          placeholder="0.00" step="0.50" min="0" autoFocus />
                        <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => saveRate(row.tech.id)} disabled={saving}>✓</button>
                        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setEditingRate(null)}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 600 }}>{fmt(row.tech.hourly_rate ?? 0)}</span>
                        <button onClick={e => { e.stopPropagation(); setEditingRate(row.tech.id); setNewRate(row.tech.hourly_rate ?? ''); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)', fontSize: 12 }}>✏️</button>
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmtH(row.regularHours)}</td>
                  <td style={{ textAlign: 'right', color: row.overtimeHours > 0 ? 'var(--orange)' : 'var(--muted)' }}>
                    {row.overtimeHours > 0 ? <strong>{fmtH(row.overtimeHours)}</strong> : fmtH(row.overtimeHours)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtH(row.totalHours)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(row.regularPay)}</td>
                  <td style={{ textAlign: 'right', color: row.overtimePay > 0 ? 'var(--orange)' : 'inherit' }}>{fmt(row.overtimePay)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(row.grossPay)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--warn)' }}>-{fmt(row.retention)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--ok)', fontSize: 15 }}>{fmt(row.netPay)}</td>
                  <td><span style={{ color: 'var(--amber)', fontSize: 12 }}>{selected === row.tech.id ? '▲' : '▼'}</span></td>
                </tr>
              ))}
            </tbody>
            {totals.length > 1 && (
              <tfoot>
                <tr style={{ background: '#f8f9fb' }}>
                  <td colSpan={2} style={{ fontWeight: 700, padding: '12px 16px', fontSize: 13 }}>TOTALES</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, padding: '12px 16px' }}>{fmtH(totals.reduce((a, r) => a + r.regularHours, 0))}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, padding: '12px 16px' }}>{fmtH(totals.reduce((a, r) => a + r.overtimeHours, 0))}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, padding: '12px 16px' }}>{fmtH(totals.reduce((a, r) => a + r.totalHours, 0))}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, padding: '12px 16px' }}>{fmt(totals.reduce((a, r) => a + r.regularPay, 0))}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, padding: '12px 16px' }}>{fmt(totals.reduce((a, r) => a + r.overtimePay, 0))}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, padding: '12px 16px' }}>{fmt(totals.reduce((a, r) => a + r.grossPay, 0))}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, padding: '12px 16px', color: 'var(--warn)' }}>-{fmt(totals.reduce((a, r) => a + r.retention, 0))}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, padding: '12px 16px', color: 'var(--ok)', fontSize: 15 }}>{fmt(totals.reduce((a, r) => a + r.netPay, 0))}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selectedTech && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>{selectedTech.tech.name}</h2>
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>{selectedTech.tech.position} · {fmt(selectedTech.tech.hourly_rate ?? 0)}/hr</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, textAlign: 'center' }}>
              {[
                { label: 'Horas totales', value: fmtH(selectedTech.totalHours), color: 'var(--navy)' },
                { label: 'Pago bruto', value: fmt(selectedTech.grossPay), color: 'var(--navy)' },
                { label: 'Retención 10%', value: fmt(selectedTech.retention), color: 'var(--warn)' },
                { label: 'Pago neto', value: fmt(selectedTech.netPay), color: 'var(--ok)' },
              ].map(s => (
                <div key={s.label} style={{ background: '#f8f9fb', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {selectedTech.dayDetails.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>No hay horas registradas esta semana.</p>
          ) : (
            selectedTech.dayDetails.map(day => (
              <div key={day.day} style={{ marginBottom: 16, border: '1.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ background: '#f8f9fb', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtDate(day.entries[0].clocked_in_at)}</div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                    <span style={{ color: 'var(--muted)' }}>Total: <strong style={{ color: 'var(--text)' }}>{fmtH(day.total)}</strong></span>
                    {day.overtime > 0 && <span style={{ color: 'var(--orange)', fontWeight: 700 }}>OT: {fmtH(day.overtime)}</span>}
                    <span style={{ color: 'var(--ok)', fontWeight: 700 }}>
                      {fmt(calcPay(day.regular, day.overtime, selectedTech.tech.hourly_rate ?? 0).grossPay)}
                    </span>
                  </div>
                </div>
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Entrada</th>
                      <th>Salida</th>
                      <th style={{ textAlign: 'right' }}>Duración</th>
                      <th style={{ textAlign: 'right' }}>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.entries.map((e, i) => {
                      const duration = (new Date(e.clocked_out_at) - new Date(e.clocked_in_at)) / 3600000 - (e.lunch_minutes ?? 0) / 60;
                      return (
                        <tr key={e.id}>
                          <td>{fmtTime(e.clocked_in_at)}</td>
                          <td>{fmtTime(e.clocked_out_at)}</td>
                          <td style={{ textAlign: 'right' }}>{fmtH(duration)}{(e.lunch_minutes ?? 0) > 0 && ' 🍽️'}</td>
                          <td style={{ textAlign: 'right' }}>
                            {duration > OVERTIME_THRESHOLD
                              ? <span className="badge badge-red">Incluye OT</span>
                              : <span className="badge badge-green">Regular</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))
          )}

          {/* Pay breakdown */}
          <div style={{ marginTop: 20, padding: 20, background: 'var(--navy)', borderRadius: 12, color: '#fff' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, opacity: 0.7, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Desglose de pago</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ opacity: 0.7 }}>{fmtH(selectedTech.regularHours)} hrs regulares × {fmt(selectedTech.tech.hourly_rate ?? 0)}</span>
                <span>{fmt(selectedTech.regularPay)}</span>
              </div>
              {selectedTech.overtimeHours > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ opacity: 0.7 }}>{fmtH(selectedTech.overtimeHours)} hrs OT × {fmt((selectedTech.tech.hourly_rate ?? 0) * 1.5)} (×1.5)</span>
                  <span style={{ color: '#fbbf24' }}>{fmt(selectedTech.overtimePay)}</span>
                </div>
              )}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>Pago bruto</span><span>{fmt(selectedTech.grossPay)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ opacity: 0.7 }}>Retención 10%</span>
                <span style={{ color: '#f87171' }}>-{fmt(selectedTech.retention)}</span>
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 20 }}>
                <span>Pago neto</span><span style={{ color: '#4ade80' }}>{fmt(selectedTech.netPay)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
