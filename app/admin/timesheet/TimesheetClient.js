'use client';
import { useState } from 'react';

const DAYS = ['Mié', 'Jue', 'Vie', 'Sáb', 'Dom', 'Lun', 'Mar'];

export default function TimesheetClient({ techStats, weekDays, techFilter }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedTech, setSelectedTech] = useState(null);

  const filteredTechs = techStats.filter(t => techFilter === 'all' || t.id === techFilter);
  const today = new Date().toISOString().slice(0, 10);

  function getDayHours(tech, dayIso) {
    const dayKey = dayIso.slice(0, 10);
    const dayEntries = tech.byDay[dayKey] ?? [];
    return dayEntries.reduce((a, e) => a + (e.clocked_out_at
      ? (new Date(e.clocked_out_at) - new Date(e.clocked_in_at)) / 3600000
      : (Date.now() - new Date(e.clocked_in_at)) / 3600000), 0);
  }

  function getDayEntries(tech, dayIso) {
    return tech.byDay[dayIso.slice(0, 10)] ?? [];
  }

  return (
    <div>
      {filteredTechs.map(tech => (
        <div key={tech.id} className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>{tech.name}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>${Number(tech.hourly_rate ?? 0).toFixed(2)}/hr</div>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
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
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 16 }}>
            {weekDays.map((dayIso, i) => {
              const hours = getDayHours(tech, dayIso);
              const isToday = dayIso.slice(0, 10) === today;
              const hasHours = hours > 0;
              const isOvertime = hours > 8;
              const isSelected = selectedDay === dayIso && selectedTech === tech.id;
              return (
                <div key={dayIso} onClick={() => { if (hasHours) { setSelectedDay(isSelected ? null : dayIso); setSelectedTech(isSelected ? null : tech.id); } }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 4px', borderRadius: 10, cursor: hasHours ? 'pointer' : 'default',
                    background: isSelected ? 'var(--navy)' : isToday ? '#f0f4ff' : '#f8f9fb',
                    border: isToday ? '2px solid var(--navy)' : '2px solid transparent' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isSelected ? '#fff' : isToday ? 'var(--navy)' : 'var(--muted)' }}>{DAYS[i]}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#fff' : isOvertime ? 'var(--warn)' : hasHours ? 'var(--navy)' : '#ccc' }}>
                    {hasHours ? hours.toFixed(1) + 'h' : '—'}
                  </div>
                  <div style={{ fontSize: 11, color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--muted)' }}>{new Date(dayIso).getDate()}</div>
                  {isOvertime && <div style={{ fontSize: 9, fontWeight: 700, color: isSelected ? '#ffd700' : 'var(--warn)' }}>OT</div>}
                </div>
              );
            })}
          </div>

          {selectedDay && selectedTech === tech.id && (
            <div style={{ background: '#f8f9fb', borderRadius: 10, padding: '14px 18px', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', marginBottom: 12 }}>
                {new Date(selectedDay).toLocaleDateString('es-PR', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              {getDayEntries(tech, selectedDay).map((e, i, arr) => {
                const inTime = new Date(e.clocked_in_at);
                const outTime = e.clocked_out_at ? new Date(e.clocked_out_at) : null;
                const dur = outTime ? ((outTime - inTime) / 3600000).toFixed(2) : null;
                return (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {inTime.toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })}
                        {outTime ? ' → ' + outTime.toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' }) : ' → En progreso ⏱'}
                      </div>
                      {e.job_id && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Trabajo asociado</div>}
                    </div>
                    <div style={{ fontWeight: 700, color: dur ? 'var(--navy)' : 'var(--amber)', fontSize: 15 }}>{dur ? dur + 'h' : '—'}</div>
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
          No hay técnicos registrados.
        </div>
      )}
    </div>
  );
}
