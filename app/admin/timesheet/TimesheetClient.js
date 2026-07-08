'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import SearchBox from '../../SearchBox';

const DAYS = ['Mié', 'Jue', 'Vie', 'Sáb', 'Dom', 'Lun', 'Mar'];

export default function TimesheetClient({ techStats, weekDays, techFilter }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedTech, setSelectedTech] = useState(null);
  const [editingTech, setEditingTech] = useState(null);
  const [editRegular, setEditRegular] = useState('');
  const [editOvertime, setEditOvertime] = useState('');
  const [editingEntry, setEditingEntry] = useState(null);
  const [editInTime, setEditInTime] = useState('');
  const [editOutTime, setEditOutTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [localStats, setLocalStats] = useState(techStats);
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const filteredTechs = localStats
    .filter(t => techFilter === 'all' || t.id === techFilter)
    .filter(t => !query || t.name.toLowerCase().includes(query));
  const todayPR = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);

  function getRawDayHours(tech, dayIso) {
    const dayKey = dayIso.slice(0, 10);
    const dayEntries = tech.byDay[dayKey] ?? [];
    return dayEntries.reduce((a, e) => a + (e.clocked_out_at
      ? (new Date(e.clocked_out_at) - new Date(e.clocked_in_at)) / 3600000 - (e.lunch_minutes ?? 0) / 60
      : (Date.now() - new Date(e.clocked_in_at)) / 3600000), 0);
  }

  function getDayHours(tech, dayIso) {
    const rawHours = getRawDayHours(tech, dayIso);
    if (!tech.hasOverride || rawHours === 0) return rawHours;
    const totalRaw = tech.regularHoursRaw + tech.overtimeHoursRaw;
    if (totalRaw === 0) return 0;
    const ratio = rawHours / totalRaw;
    return tech.totalHours * ratio;
  }

  function getDayEntries(tech, dayIso) {
    return tech.byDay[dayIso.slice(0, 10)] ?? [];
  }

  function computeRawWeekHours(byDay) {
    let regular = 0, overtime = 0, cumulative = 0;
    weekDays.forEach(dayIso => {
      const dayEntries = byDay[dayIso.slice(0, 10)] ?? [];
      const hours = dayEntries.reduce((a, e) => a + (e.clocked_out_at
        ? (new Date(e.clocked_out_at) - new Date(e.clocked_in_at)) / 3600000 - (e.lunch_minutes ?? 0) / 60
        : (Date.now() - new Date(e.clocked_in_at)) / 3600000), 0);
      const dayRegular = Math.min(hours, Math.max(0, 40 - cumulative));
      regular += dayRegular;
      overtime += hours - dayRegular;
      cumulative += hours;
    });
    return { regular, overtime };
  }

  function getDayOvertimeHours(tech, dayIso) {
    let cumulative = 0;
    for (const d of weekDays) {
      const hours = getRawDayHours(tech, d);
      if (d.slice(0, 10) === dayIso.slice(0, 10)) {
        const dayRegular = Math.min(hours, Math.max(0, 40 - cumulative));
        return hours - dayRegular;
      }
      cumulative += hours;
    }
    return 0;
  }

  function startEdit(tech) {
    setEditingTech(tech.id);
    setEditRegular(tech.regularHours.toFixed(2));
    setEditOvertime(tech.overtimeHours.toFixed(2));
  }

  async function saveEdit(tech, weekStart, weekEnd) {
    setSaving(true);
    const regular = parseFloat(editRegular) || 0;
    const overtime = parseFloat(editOvertime) || 0;
    const rate = Number(tech.hourly_rate ?? 0);
    const grossPay = (regular * rate) + (overtime * rate * 1.5);

    await supabase.from('payroll_adjustments').upsert({
      technician_id: tech.id,
      period_start: weekStart,
      period_end: weekEnd,
      regular_hours_override: regular,
      overtime_hours_override: overtime,
    }, { onConflict: 'technician_id,period_start,period_end' });

    setLocalStats(prev => prev.map(t => t.id === tech.id
      ? { ...t, regularHours: regular, overtimeHours: overtime, totalHours: regular + overtime, grossPay, hasOverride: true }
      : t
    ));

    setEditingTech(null);
    setSaving(false);
  }

  async function resetOverride(tech, weekStart, weekEnd) {
    if (!confirm(`¿Borrar el ajuste manual de ${tech.name} para esta semana? Las horas volverán al cálculo automático.`)) return;
    setSaving(true);

    await supabase.from('payroll_adjustments').delete()
      .eq('technician_id', tech.id)
      .eq('period_start', weekStart)
      .eq('period_end', weekEnd);

    const rate = Number(tech.hourly_rate ?? 0);
    const regularHours = tech.regularHoursRaw;
    const overtimeHours = tech.overtimeHoursRaw;
    const grossPay = (regularHours * rate) + (overtimeHours * rate * 1.5);

    setLocalStats(prev => prev.map(t => t.id === tech.id
      ? { ...t, regularHours, overtimeHours, totalHours: regularHours + overtimeHours, grossPay, hasOverride: false }
      : t
    ));

    setEditingTech(null);
    setSaving(false);
  }

  function startEditEntry(entry) {
    setEditingEntry(entry.id);
    const inDate = new Date(entry.clocked_in_at);
    const outDate = entry.clocked_out_at ? new Date(entry.clocked_out_at) : null;
    setEditInTime(inDate.toTimeString().slice(0, 5));
    setEditOutTime(outDate ? outDate.toTimeString().slice(0, 5) : '');
  }

  async function saveEntry(entry) {
    setSaving(true);
    const baseDate = entry.clocked_in_at.slice(0, 10);
    const newIn = new Date(baseDate + 'T' + editInTime + ':00');
    const newOut = editOutTime ? new Date(baseDate + 'T' + editOutTime + ':00') : null;

    await supabase.from('time_entries').update({
      clocked_in_at: newIn.toISOString(),
      clocked_out_at: newOut ? newOut.toISOString() : null,
    }).eq('id', entry.id);

    setLocalStats(prev => prev.map(t => {
      const newByDay = { ...t.byDay };
      const dayKey = baseDate;
      if (newByDay[dayKey]) {
        newByDay[dayKey] = newByDay[dayKey].map(e => e.id === entry.id
          ? { ...e, clocked_in_at: newIn.toISOString(), clocked_out_at: newOut ? newOut.toISOString() : null }
          : e
        );
      } else {
        return t;
      }

      const { regular: regularHoursRaw, overtime: overtimeHoursRaw } = computeRawWeekHours(newByDay);
      if (t.hasOverride) {
        return { ...t, byDay: newByDay, regularHoursRaw, overtimeHoursRaw };
      }
      const rate = Number(t.hourly_rate ?? 0);
      const totalHours = regularHoursRaw + overtimeHoursRaw;
      const grossPay = (regularHoursRaw * rate) + (overtimeHoursRaw * rate * 1.5);
      return { ...t, byDay: newByDay, regularHoursRaw, overtimeHoursRaw, regularHours: regularHoursRaw, overtimeHours: overtimeHoursRaw, totalHours, grossPay };
    }));

    setEditingEntry(null);
    setSaving(false);
  }

  const weekStart = weekDays[0]?.slice(0, 10);
  const weekEnd = weekDays[6]?.slice(0, 10);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar técnico..." />
      </div>
      {filteredTechs.map(tech => (
        <div key={tech.id} className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>{tech.name}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>${Number(tech.hourly_rate ?? 0).toFixed(2)}/hr</div>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, alignItems: 'center' }}>
              {editingTech === tech.id ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Regular</div>
                    <input type="number" value={editRegular} onChange={e => setEditRegular(e.target.value)} step="0.1" min="0"
                      style={{ width: 70, padding: '4px 8px', border: '2px solid var(--navy)', borderRadius: 8, fontSize: 14, fontWeight: 700, textAlign: 'center' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>OT</div>
                    <input type="number" value={editOvertime} onChange={e => setEditOvertime(e.target.value)} step="0.1" min="0"
                      style={{ width: 70, padding: '4px 8px', border: '2px solid var(--warn)', borderRadius: 8, fontSize: 14, fontWeight: 700, textAlign: 'center' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
                    <button onClick={() => saveEdit(tech, weekStart, weekEnd)} disabled={saving}
                      className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 12 }}>
                      {saving ? '...' : '💾'}
                    </button>
                    {tech.hasOverride && (
                      <button onClick={() => resetOverride(tech, weekStart, weekEnd)} disabled={saving}
                        className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12, color: 'var(--warn)' }} title="Borrar ajuste manual">
                        🗑
                      </button>
                    )}
                    <button onClick={() => setEditingTech(null)} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}>✕</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Regular</div>
                    <div style={{ fontWeight: 700, color: 'var(--ok)' }}>{tech.regularHours.toFixed(1)}h</div>
                  </div>
                  {tech.overtimeHours > 0 && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>OT</div>
                      <div style={{ fontWeight: 700, color: 'var(--warn)' }}>{tech.overtimeHours.toFixed(1)}h ⚡</div>
                    </div>
                  )}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Total</div>
                    <div style={{ fontWeight: 700, color: 'var(--navy)' }}>{tech.totalHours.toFixed(1)}h</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Gross</div>
                    <div style={{ fontWeight: 700, color: 'var(--ok)' }}>${tech.grossPay.toFixed(2)}</div>
                  </div>
                  {tech.hasOverride && (
                    <div style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700 }} title="Horas ajustadas manualmente">✏️ ajuste manual</div>
                  )}
                  <button onClick={() => startEdit(tech)} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}>✏️ Editar</button>
                  {tech.hasOverride && (
                    <button onClick={() => resetOverride(tech, weekStart, weekEnd)} disabled={saving}
                      className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12, color: 'var(--warn)' }} title="Borrar ajuste manual">
                      🗑
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 16 }}>
            {weekDays.map((dayIso, i) => {
              const hours = getDayHours(tech, dayIso);
              const isToday = dayIso.slice(0, 10) === todayPR;
              const hasHours = getRawDayHours(tech, dayIso) > 0;
              const isOvertime = getDayOvertimeHours(tech, dayIso) > 0;
              const isSelected = selectedDay === dayIso && selectedTech === tech.id;
              const [y,m,d] = dayIso.slice(0,10).split('-');
              return (
                <div key={dayIso} onClick={() => { if (hasHours) { setSelectedDay(isSelected ? null : dayIso); setSelectedTech(isSelected ? null : tech.id); } }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 4px', borderRadius: 10, cursor: hasHours ? 'pointer' : 'default',
                    background: isSelected ? 'var(--navy)' : isToday ? '#f0f4ff' : '#f8f9fb',
                    border: isToday ? '2px solid var(--navy)' : '2px solid transparent' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isSelected ? '#fff' : isToday ? 'var(--navy)' : 'var(--muted)' }}>{DAYS[i]}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#fff' : isOvertime ? 'var(--warn)' : hasHours ? 'var(--navy)' : '#ccc' }}>
                    {hasHours ? hours.toFixed(1) + 'h' : '—'}
                  </div>
                  <div style={{ fontSize: 11, color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--muted)' }}>{new Date(y, m-1, d).getDate()}</div>
                  {isOvertime && <div style={{ fontSize: 9, fontWeight: 700, color: isSelected ? '#ffd700' : 'var(--warn)' }}>OT</div>}
                </div>
              );
            })}
          </div>

          {selectedDay && selectedTech === tech.id && (
            <div style={{ background: '#f8f9fb', borderRadius: 10, padding: '14px 18px', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', marginBottom: 12 }}>
                {(() => { const [y,m,d] = selectedDay.slice(0,10).split('-'); return new Date(y, m-1, d).toLocaleDateString('es-PR', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); })()}
              </div>
              {getDayEntries(tech, selectedDay).map((e, i, arr) => {
                const inTime = new Date(e.clocked_in_at);
                const outTime = e.clocked_out_at ? new Date(e.clocked_out_at) : null;
                const dur = outTime ? ((outTime - inTime) / 3600000 - (e.lunch_minutes ?? 0) / 60).toFixed(2) : null;
                const isEditingThis = editingEntry === e.id;
                return (
                  <div key={e.id} style={{ padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    {isEditingThis ? (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Clock In</div>
                          <input type="time" value={editInTime} onChange={e => setEditInTime(e.target.value)}
                            style={{ padding: '6px 10px', border: '2px solid var(--navy)', borderRadius: 8, fontSize: 14 }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Clock Out</div>
                          <input type="time" value={editOutTime} onChange={e => setEditOutTime(e.target.value)}
                            style={{ padding: '6px 10px', border: '2px solid var(--navy)', borderRadius: 8, fontSize: 14 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
                          <button onClick={() => saveEntry(e)} disabled={saving} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 12 }}>
                            {saving ? '...' : '💾 Guardar'}
                          </button>
                          <button onClick={() => setEditingEntry(null)} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>
                            {inTime.toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })}
                            {outTime ? ' → ' + outTime.toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' }) : ' → En progreso ⏱'}
                          </div>
                          {e.job_id && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Trabajo asociado</div>}
                          {(e.lunch_minutes ?? 0) > 0 && <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 2 }}>🍽️ Lunch -{(e.lunch_minutes / 60).toFixed(1)}h</div>}
                          {e.notes && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, fontStyle: 'italic' }}>"{e.notes}"</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ fontWeight: 700, color: dur ? 'var(--navy)' : 'var(--amber)', fontSize: 15 }}>{dur ? dur + 'h' : '—'}</div>
                          <button onClick={() => startEditEntry(e)} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}>✏️</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '2px solid var(--border)', fontWeight: 800, fontSize: 15, color: 'var(--navy)' }}>
                <span>Total del día</span>
                <span>{getDayHours(tech, selectedDay).toFixed(2)}h</span>
              </div>
            </div>
          )}
        </div>
      ))}

      {filteredTechs.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
          {query ? `Sin resultados para "${search}".` : 'No hay técnicos registrados.'}
        </div>
      )}
    </div>
  );
}
