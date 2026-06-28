
'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';

export default function PayrollClient({ techStats, totalGross, totalRetention, totalNet, totalHours, monthlyPayroll, view, year, months }) {
  const [editing, setEditing] = useState(null); // tech id being edited
  const [editRate, setEditRate] = useState('');
  const [editHours, setEditHours] = useState({}); // { entryId: hours }
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState(techStats);

  const fmt = n => `$${Number(n ?? 0).toFixed(2)}`;
  const fmtH = h => `${Number(h).toFixed(1)}h`;

  function startEdit(tech) {
    setEditing(tech.id);
    setEditRate(tech.hourly_rate ?? 0);
  }

  async function saveRate(tech) {
    setSaving(true);
    const newRate = parseFloat(editRate);
    await supabase.from('technicians').update({ hourly_rate: newRate }).eq('id', tech.id);
    setStats(prev => prev.map(t => {
      if (t.id !== tech.id) return t;
      const regularPay = t.regularHours * newRate;
      const overtimePay = t.overtimeHours * newRate * 1.5;
      const grossPay = regularPay + overtimePay;
      const retention = grossPay * 0.10;
      return { ...t, hourly_rate: newRate, regularPay, overtimePay, grossPay, retention, netPay: grossPay - retention };
    }));
    setEditing(null);
    setSaving(false);
  }

  const totGross = stats.reduce((a, t) => a + t.grossPay, 0);
  const totRet = stats.reduce((a, t) => a + t.retention, 0);
  const totNet = stats.reduce((a, t) => a + t.netPay, 0);
  const totH = stats.reduce((a, t) => a + t.totalHours, 0);

  return (
    <>
      {/* Per technician breakdown */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Por técnico</p>
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
                {stats.filter(t => t.totalHours > 0).map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 700 }}>{t.name}</td>
                    <td style={{ textAlign: 'right' }}>
                      {editing === t.id ? (
                        <input type="number" value={editRate} onChange={e => setEditRate(e.target.value)}
                          style={{ width: 80, padding: '4px 8px', border: '1.5px solid var(--amber)', borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }} />
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>{fmt(t.hourly_rate)}/h</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmtH(t.regularHours)}</td>
                    <td style={{ textAlign: 'right', color: t.overtimeHours > 0 ? 'var(--amber)' : 'var(--muted)' }}>{fmtH(t.overtimeHours)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtH(t.totalHours)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(t.regularPay)}</td>
                    <td style={{ textAlign: 'right', color: t.overtimePay > 0 ? 'var(--amber)' : 'var(--muted)' }}>{fmt(t.overtimePay)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(t.grossPay)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--warn)' }}>{fmt(t.retention)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ok)' }}>{fmt(t.netPay)}</td>
                    <td>
                      {editing === t.id ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => saveRate(t)} disabled={saving}>
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

      {/* Monthly breakdown for year view */}
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
    </>
  );
}
