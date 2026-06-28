
'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';

const TECH_COLORS = [
  '#16223d', '#e0972c', '#27ae60', '#2a4cb5', '#e05c2a',
  '#8e44ad', '#16a085', '#c0392b', '#d35400', '#1abc9c',
];

const STATUS_COLORS = {
  estimate: '#888',
  scheduled: '#2a4cb5',
  in_progress: '#e0972c',
  completed: '#27ae60',
  cancelled: '#ccc',
};

const STATUS_LABELS = {
  estimate: 'Estimado',
  scheduled: 'Programado',
  in_progress: 'En progreso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function CalendarioClient({ jobs, technicians, initialView, initialYear, initialMonth, initialWeek }) {
  const [view, setView] = useState(initialView);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [weekOffset, setWeekOffset] = useState(initialWeek);
  const [selectedTech, setSelectedTech] = useState('all');
  const [selectedJob, setSelectedJob] = useState(null);

  // Assign colors to technicians
  const techColors = useMemo(() => {
    const map = {};
    technicians.forEach((t, i) => { map[t.id] = TECH_COLORS[i % TECH_COLORS.length]; });
    return map;
  }, [technicians]);

  // Filter jobs by technician
  const filteredJobs = useMemo(() =>
    selectedTech === 'all' ? jobs : jobs.filter(j => j.technician_id === selectedTech),
    [jobs, selectedTech]
  );

  // Get jobs for a specific date
  const getJobsForDate = (dateStr) =>
    filteredJobs.filter(j => {
      const start = j.scheduled_start?.slice(0, 10);
      const end = j.scheduled_end?.slice(0, 10);
      return start <= dateStr && dateStr <= end;
    });

  // Week start (Monday)
  const getWeekStart = (offset = 0) => {
    const now = new Date();
    const day = now.getDay();
    const diffToMon = (day + 6) % 7;
    const ws = new Date(now);
    ws.setDate(now.getDate() - diffToMon + offset * 7);
    ws.setHours(0, 0, 0, 0);
    return ws;
  };

  const weekStart = getWeekStart(weekOffset);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const today = new Date().toISOString().slice(0, 10);
  const fmtDate = d => d.toISOString().slice(0, 10);
  const fmtTime = d => new Date(d).toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' });

  // ─── ANNUAL VIEW ───
  const AnnualView = () => (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {MONTHS.map((mName, mIdx) => {
          const firstDay = new Date(year, mIdx, 1).getDay();
          const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
          const monthJobs = filteredJobs.filter(j => {
            const s = j.scheduled_start?.slice(0, 7);
            const e = j.scheduled_end?.slice(0, 7);
            const m = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
            return s <= m && m <= e;
          });

          return (
            <div key={mIdx} className="card" style={{ cursor: 'pointer', padding: '14px 16px' }}
              onClick={() => { setMonth(mIdx); setView('month'); }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{mName}</div>
                {monthJobs.length > 0 && (
                  <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                    {monthJobs.length}
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {['D','L','M','X','J','V','S'].map(d => (
                  <div key={d} style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center', fontWeight: 600 }}>{d}</div>
                ))}
                {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const dateStr = `${year}-${String(mIdx + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                  const dayJobs = getJobsForDate(dateStr);
                  const isToday = dateStr === today;
                  return (
                    <div key={i} style={{ textAlign: 'center', fontSize: 10, borderRadius: 4, padding: '2px 0',
                      background: isToday ? 'var(--navy)' : dayJobs.length > 0 ? 'var(--amber)' : 'transparent',
                      color: isToday || dayJobs.length > 0 ? '#fff' : 'var(--text)', fontWeight: dayJobs.length > 0 ? 700 : 400 }}>
                      {i + 1}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ─── MONTHLY VIEW ───
  const MonthlyView = () => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();

    const cells = [];
    // Prev month days
    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({ day: prevDays - i, current: false, date: null });
    }
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      cells.push({ day: i, current: true, date: dateStr });
    }
    // Next month days
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      cells.push({ day: i, current: false, date: null });
    }

    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 2 }}>
          {DAYS_SHORT.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--muted)', padding: '8px 0' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((cell, idx) => {
            const dayJobs = cell.date ? getJobsForDate(cell.date) : [];
            const isToday = cell.date === today;
            return (
              <div key={idx} style={{
                minHeight: 100, padding: '6px 8px', borderRadius: 8,
                background: isToday ? '#f0f4ff' : cell.current ? '#fff' : '#f8f9fb',
                border: isToday ? '2px solid var(--navy)' : '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 13, fontWeight: isToday ? 800 : 500, color: cell.current ? 'var(--text)' : 'var(--muted)', marginBottom: 4 }}>
                  {cell.day}
                </div>
                {dayJobs.slice(0, 3).map(j => (
                  <div key={j.id} onClick={() => setSelectedJob(j)}
                    style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, marginBottom: 2, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      background: techColors[j.technician_id] ?? '#888', color: '#fff' }}>
                    {j.title}
                  </div>
                ))}
                {dayJobs.length > 3 && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>+{dayJobs.length - 3} más</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── WEEKLY VIEW ───
  const WeeklyView = () => {
    const startHour = 6;
    const endHour = 20;
    const hours = Array.from({ length: endHour - startHour }, (_, i) => i + startHour);

    return (
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', minWidth: 700 }}>
          {/* Header */}
          <div style={{ borderBottom: '2px solid var(--border)', padding: '8px 0' }} />
          {weekDays.map((d, i) => {
            const dateStr = fmtDate(d);
            const isToday = dateStr === today;
            return (
              <div key={i} style={{ textAlign: 'center', padding: '8px 4px', borderBottom: '2px solid var(--border)', background: isToday ? '#f0f4ff' : 'transparent' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{DAYS_SHORT[d.getDay()]}</div>
                <div style={{ fontSize: 18, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--navy)' : 'var(--text)' }}>{d.getDate()}</div>
              </div>
            );
          })}

          {/* Hour rows */}
          {hours.map(hour => (
            <>
              <div key={`h${hour}`} style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', paddingRight: 8, paddingTop: 4, borderTop: '1px solid var(--border)', height: 60 }}>
                {hour}:00
              </div>
              {weekDays.map((d, di) => {
                const dateStr = fmtDate(d);
                const hourJobs = filteredJobs.filter(j => {
                  if (!j.scheduled_start) return false;
                  const start = new Date(j.scheduled_start);
                  const end = new Date(j.scheduled_end ?? j.scheduled_start);
                  const startH = start.getHours();
                  const endH = end.getHours();
                  return start.toISOString().slice(0, 10) === dateStr && startH === hour;
                });
                return (
                  <div key={`${hour}-${di}`} style={{ borderTop: '1px solid var(--border)', borderLeft: '1px solid var(--border)', height: 60, position: 'relative', padding: 2 }}>
                    {hourJobs.map(j => {
                      const start = new Date(j.scheduled_start);
                      const end = new Date(j.scheduled_end ?? j.scheduled_start);
                      const duration = Math.max((end - start) / 3600000, 0.5);
                      return (
                        <div key={j.id} onClick={() => setSelectedJob(j)}
                          style={{ background: techColors[j.technician_id] ?? '#888', color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            height: `${Math.min(duration * 60, 60) - 4}px`, overflow: 'hidden' }}>
                          {j.title}
                          <div style={{ fontSize: 10, opacity: 0.85 }}>{fmtTime(j.scheduled_start)}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div className="page-title">Calendario</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {/* View selector */}
          {[['year','Anual'],['month','Mensual'],['week','Semanal']].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              className={`btn ${v === view ? 'btn-primary' : 'btn-ghost'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Navigation */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={() => {
            if (view === 'year') setYear(y => y - 1);
            else if (view === 'month') { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
            else setWeekOffset(w => w - 1);
          }}>←</button>

          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', minWidth: 160, textAlign: 'center' }}>
            {view === 'year' ? year :
             view === 'month' ? `${MONTHS[month]} ${year}` :
             `${weekDays[0].toLocaleDateString('es-PR', { month: 'short', day: 'numeric' })} — ${weekDays[6].toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' })}`}
          </span>

          <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={() => {
            if (view === 'year') setYear(y => y + 1);
            else if (view === 'month') { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }
            else setWeekOffset(w => w + 1);
          }}>→</button>

          <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => {
            const now = new Date();
            setYear(now.getFullYear());
            setMonth(now.getMonth());
            setWeekOffset(0);
          }}>Hoy</button>
        </div>

        {/* Technician filter */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setSelectedTech('all')}
            className={`btn ${selectedTech === 'all' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 12, padding: '5px 12px' }}>
            Todos
          </button>
          {technicians.map(t => (
            <button key={t.id} onClick={() => setSelectedTech(selectedTech === t.id ? 'all' : t.id)}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '1.5px solid', cursor: 'pointer', fontWeight: 600,
                borderColor: techColors[t.id], background: selectedTech === t.id ? techColors[t.id] : 'transparent',
                color: selectedTech === t.id ? '#fff' : techColors[t.id] }}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar views */}
      {view === 'year' && <AnnualView />}
      {view === 'month' && <MonthlyView />}
      {view === 'week' && <WeeklyView />}

      {/* Job detail modal */}
      {selectedJob && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setSelectedJob(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>{selectedJob.title}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{selectedJob.clients?.name}</div>
              </div>
              <button onClick={() => setSelectedJob(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>Estado</span>
                <span style={{ fontWeight: 600, color: STATUS_COLORS[selectedJob.status] }}>{STATUS_LABELS[selectedJob.status]}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>Técnico</span>
                <span style={{ fontWeight: 600 }}>{selectedJob.technicians?.name ?? '— Sin asignar —'}</span>
              </div>
              {selectedJob.scheduled_start && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>Inicio</span>
                  <span style={{ fontWeight: 600 }}>{new Date(selectedJob.scheduled_start).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
              {selectedJob.scheduled_end && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>Fin</span>
                  <span style={{ fontWeight: 600 }}>{new Date(selectedJob.scheduled_end).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
            </div>
            <Link href={`/trabajos/${selectedJob.id}`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Ver trabajo completo →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
