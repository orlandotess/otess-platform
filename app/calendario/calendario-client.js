'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const TECH_COLORS = [
  '#16223d', '#e0972c', '#27ae60', '#2a4cb5', '#e05c2a',
  '#8e44ad', '#16a085', '#c0392b', '#d35400', '#1abc9c',
];

const STATUS_COLORS = {
  estimate: '#888', scheduled: '#2a4cb5', in_progress: '#e0972c',
  completed: '#27ae60', cancelled: '#ccc',
};

const STATUS_LABELS = {
  estimate: 'Estimado', scheduled: 'Programado', in_progress: 'En progreso',
  completed: 'Completado', cancelled: 'Cancelado',
};

const VISIT_STATUS_LABELS = {
  agendada: 'Agendada', en_progreso: 'En progreso', completada: 'Completada', cancelada: 'Cancelada',
};

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

export default function CalendarioClient({ jobs, technicians, visits, pendingRequests, initialView, initialYear, initialMonth, initialWeek }) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [weekOffset, setWeekOffset] = useState(initialWeek);
  const [selectedTech, setSelectedTech] = useState('all');
  const [selectedJob, setSelectedJob] = useState(null);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [showRequests, setShowRequests] = useState(true);
  const [scheduleModal, setScheduleModal] = useState(null); // { requestId?, date?, hour? }
  const [saving, setSaving] = useState(false);

  const techColors = useMemo(() => {
    const map = {};
    technicians.forEach((t, i) => { map[t.id] = TECH_COLORS[i % TECH_COLORS.length]; });
    return map;
  }, [technicians]);

  const filteredJobs = useMemo(() =>
    selectedTech === 'all' ? jobs : jobs.filter(j => j.technician_id === selectedTech),
    [jobs, selectedTech]
  );

  const filteredVisits = useMemo(() =>
    selectedTech === 'all' ? visits : visits.filter(v => v.technician_id === selectedTech),
    [visits, selectedTech]
  );

  const getJobsForDate = (dateStr) =>
    filteredJobs.filter(j => {
      const start = j.scheduled_start?.slice(0, 10);
      const end = j.scheduled_end?.slice(0, 10);
      return start && end && start <= dateStr && dateStr <= end;
    });

  const getVisitsForDate = (dateStr) =>
    filteredVisits.filter(v => v.scheduled_at?.slice(0, 10) === dateStr);

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
  const fmtTime = iso => new Date(iso).toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' });

  const navLabel = view === 'year' ? String(year) :
    view === 'month' ? `${MONTHS[month]} ${year}` :
    `${weekDays[0].toLocaleDateString('es-PR', { month: 'short', day: 'numeric' })} — ${weekDays[6].toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  function navPrev() {
    if (view === 'year') setYear(y => y - 1);
    else if (view === 'month') { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
    else setWeekOffset(w => w - 1);
  }
  function navNext() {
    if (view === 'year') setYear(y => y + 1);
    else if (view === 'month') { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }
    else setWeekOffset(w => w + 1);
  }
  function navToday() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setWeekOffset(0);
  }

  async function handleSchedule({ requestId, technicianId, dateStr, time, duration }) {
    setSaving(true);
    try {
      const scheduled_at = new Date(`${dateStr}T${time}:00`).toISOString();
      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          technician_id: technicianId,
          scheduled_at,
          duration_minutes: duration,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? 'Error al agendar visita');
        return;
      }
      setScheduleModal(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div className="page-title">Calendario</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['year','Anual'],['month','Mensual'],['week','Semanal']].map(([v, l]) => (
              <button key={v} onClick={() => setView(v)} className={`btn ${v === view ? 'btn-primary' : 'btn-ghost'}`}>{l}</button>
            ))}
            <button onClick={() => setShowRequests(s => !s)} className="btn btn-ghost">
              {showRequests ? 'Ocultar' : 'Ver'} solicitudes {pendingRequests.length > 0 && `(${pendingRequests.length})`}
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={navPrev}>←</button>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', minWidth: 200, textAlign: 'center' }}>{navLabel}</span>
            <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={navNext}>→</button>
            <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={navToday}>Hoy</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setSelectedTech('all')} className={`btn ${selectedTech === 'all' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 12, padding: '5px 12px' }}>Todos</button>
            {technicians.map(t => (
              <button key={t.id} onClick={() => setSelectedTech(selectedTech === t.id ? 'all' : t.id)}
                style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '2px solid', cursor: 'pointer', fontWeight: 600,
                  borderColor: techColors[t.id], background: selectedTech === t.id ? techColors[t.id] : 'transparent',
                  color: selectedTech === t.id ? '#fff' : techColors[t.id] }}>
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* ─── ANNUAL VIEW ─── */}
        {view === 'year' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {MONTHS.map((mName, mIdx) => {
              const firstDay = new Date(year, mIdx, 1).getDay();
              const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
              const mStr = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
              const monthCount = filteredJobs.filter(j => j.scheduled_start?.slice(0, 7) === mStr).length
                + filteredVisits.filter(v => v.scheduled_at?.slice(0, 7) === mStr).length;
              return (
                <div key={mIdx} className="card" style={{ cursor: 'pointer', padding: '14px 16px' }}
                  onClick={() => { setMonth(mIdx); setView('month'); }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{mName}</div>
                    {monthCount > 0 && (
                      <span style={{ background: 'var(--amber)', color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{monthCount}</span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                    {['D','L','M','X','J','V','S'].map(d => (
                      <div key={d} style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center', fontWeight: 600 }}>{d}</div>
                    ))}
                    {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const dateStr = `${mStr}-${String(i + 1).padStart(2, '0')}`;
                      const hasItems = getJobsForDate(dateStr).length > 0 || getVisitsForDate(dateStr).length > 0;
                      const isToday = dateStr === today;
                      return (
                        <div key={i} style={{ textAlign: 'center', fontSize: 10, borderRadius: 4, padding: '2px 0',
                          background: isToday ? 'var(--navy)' : hasItems ? 'var(--amber)' : 'transparent',
                          color: isToday || hasItems ? '#fff' : 'var(--text)', fontWeight: hasItems ? 700 : 400 }}>
                          {i + 1}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── MONTHLY VIEW ─── */}
        {view === 'month' && (() => {
          const firstDay = new Date(year, month, 1).getDay();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const prevDays = new Date(year, month, 0).getDate();
          const cells = [];
          for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevDays - i, current: false, date: null });
          for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            cells.push({ day: i, current: true, date: dateStr });
          }
          const remaining = 42 - cells.length;
          for (let i = 1; i <= remaining; i++) cells.push({ day: i, current: false, date: null });
          return (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
                {DAYS_SHORT.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--muted)', padding: '8px 0' }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {cells.map((cell, idx) => {
                  const dayJobs = cell.date ? getJobsForDate(cell.date) : [];
                  const dayVisits = cell.date ? getVisitsForDate(cell.date) : [];
                  const isToday = cell.date === today;
                  return (
                    <div key={idx} style={{ minHeight: 100, height: 100, padding: '6px 8px', borderRadius: 8,
                      background: isToday ? '#f0f4ff' : '#fff',
                      border: isToday ? '2px solid var(--navy)' : '1px solid var(--border)',
                      opacity: cell.current ? 1 : 0.4,
                      boxSizing: 'border-box', overflow: 'hidden', position: 'relative', cursor: cell.current ? 'pointer' : 'default' }}
                      onClick={() => { if (cell.current) setScheduleModal({ dateStr: cell.date, time: '09:00' }); }}>
                      <div style={{ fontSize: 13, fontWeight: isToday ? 800 : 500, color: cell.current ? 'var(--text)' : 'var(--muted)', marginBottom: 4 }}>{cell.day}</div>
                      {dayVisits.slice(0, 2).map(v => (
                        <div key={`v${v.id}`} onClick={(e) => { e.stopPropagation(); setSelectedVisit(v); }}
                          style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, marginBottom: 2, cursor: 'pointer',
                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                            background: '#fff', border: `2px solid ${techColors[v.technician_id] ?? '#888'}`, color: techColors[v.technician_id] ?? '#888' }}>
                          👁 {v.requests?.title ?? 'Visita'}
                        </div>
                      ))}
                      {dayJobs.slice(0, 3 - Math.min(dayVisits.length, 2)).map(j => (
                        <div key={j.id} onClick={(e) => { e.stopPropagation(); setSelectedJob(j); }}
                          style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, marginBottom: 2, cursor: 'pointer',
                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                            background: techColors[j.technician_id] ?? '#888', color: '#fff' }}>
                          {j.title}
                        </div>
                      ))}
                      {(dayJobs.length + dayVisits.length) > 3 && <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>+{dayJobs.length + dayVisits.length - 3} más</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ─── WEEKLY VIEW ─── */}
        {view === 'week' && (() => {
          const startHour = 6;
          const endHour = 20;
          const hours = Array.from({ length: endHour - startHour }, (_, i) => i + startHour);
          return (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', minWidth: 700 }}>
                <div style={{ borderBottom: '2px solid var(--border)', padding: '8px 0' }} />
                {weekDays.map((d, i) => {
                  const isToday = fmtDate(d) === today;
                  return (
                    <div key={i} style={{ textAlign: 'center', padding: '8px 4px', borderBottom: '2px solid var(--border)', background: isToday ? '#f0f4ff' : 'transparent' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{DAYS_SHORT[d.getDay()]}</div>
                      <div style={{ fontSize: 18, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--navy)' : 'var(--text)' }}>{d.getDate()}</div>
                    </div>
                  );
                })}
                {hours.map(hour => (
                  [
                    <div key={`h${hour}`} style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', paddingRight: 8, paddingTop: 4, borderTop: '1px solid var(--border)', height: 64 }}>
                      {String(hour).padStart(2,'0')}:00
                    </div>,
                    ...weekDays.map((d, di) => {
                      const dateStr = fmtDate(d);
                      const hourJobs = filteredJobs.filter(j => {
                        if (!j.scheduled_start) return false;
                        const start = new Date(j.scheduled_start);
                        return start.toISOString().slice(0, 10) === dateStr && start.getHours() === hour;
                      });
                      const hourVisits = filteredVisits.filter(v => {
                        if (!v.scheduled_at) return false;
                        const start = new Date(v.scheduled_at);
                        return start.toISOString().slice(0, 10) === dateStr && start.getHours() === hour;
                      });
                      return (
                        <div key={`${hour}-${di}`} style={{ borderTop: '1px solid var(--border)', borderLeft: '1px solid var(--border)', height: 64, padding: 2, cursor: 'pointer' }}
                          onClick={() => setScheduleModal({ dateStr, time: `${String(hour).padStart(2,'0')}:00` })}>
                          {hourVisits.map(v => (
                            <div key={`v${v.id}`} onClick={(e) => { e.stopPropagation(); setSelectedVisit(v); }}
                              style={{ background: '#fff', border: `2px solid ${techColors[v.technician_id] ?? '#888'}`, color: techColors[v.technician_id] ?? '#888',
                                borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 2, overflow: 'hidden' }}>
                              👁 {v.requests?.title ?? 'Visita'}
                              <div style={{ fontSize: 10, opacity: 0.85 }}>{fmtTime(v.scheduled_at)}</div>
                            </div>
                          ))}
                          {hourJobs.map(j => {
                            const start = new Date(j.scheduled_start);
                            const end = new Date(j.scheduled_end ?? j.scheduled_start);
                            const duration = Math.max((end - start) / 3600000, 0.5);
                            return (
                              <div key={j.id} onClick={(e) => { e.stopPropagation(); setSelectedJob(j); }}
                                style={{ background: techColors[j.technician_id] ?? '#888', color: '#fff', borderRadius: 4, padding: '2px 6px',
                                  fontSize: 11, fontWeight: 600, cursor: 'pointer', height: `${Math.min(duration * 64, 60)}px`, overflow: 'hidden' }}>
                                {j.title}
                                <div style={{ fontSize: 10, opacity: 0.85 }}>{fmtTime(j.scheduled_start)}</div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })
                  ]
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ─── SIDE PANEL: Pending Requests ─── */}
      {showRequests && (
        <div className="card" style={{ width: 280, flexShrink: 0, padding: 16, position: 'sticky', top: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--navy)', marginBottom: 12 }}>
            Solicitudes pendientes {pendingRequests.length > 0 && `(${pendingRequests.length})`}
          </div>
          {pendingRequests.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>No hay solicitudes nuevas.</div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {pendingRequests.map(r => (
              <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--navy)' }}>{r.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6 }}>{r.clients?.name}</div>
                <button className="btn btn-primary" style={{ width: '100%', fontSize: 11.5, padding: '5px 0' }}
                  onClick={() => setScheduleModal({ requestId: r.id })}>
                  Agendar visita
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── SCHEDULE MODAL ─── */}
      {scheduleModal && (
        <ScheduleModal
          data={scheduleModal}
          pendingRequests={pendingRequests}
          technicians={technicians}
          saving={saving}
          onClose={() => setScheduleModal(null)}
          onSubmit={handleSchedule}
        />
      )}

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
            <div style={{ display: 'grid', gap: 0, marginBottom: 20 }}>
              {[
                ['Estado', <span style={{ fontWeight: 600, color: STATUS_COLORS[selectedJob.status] }}>{STATUS_LABELS[selectedJob.status]}</span>],
                ['Técnico', selectedJob.technicians?.name ?? '— Sin asignar —'],
                ['Inicio', selectedJob.scheduled_start ? new Date(selectedJob.scheduled_start).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'],
                ['Fin', selectedJob.scheduled_end ? new Date(selectedJob.scheduled_end).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{value}</span>
                </div>
              ))}
            </div>
            <Link href={`/trabajos/${selectedJob.id}`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Ver trabajo completo →
            </Link>
          </div>
        </div>
      )}

      {/* Visit detail modal */}
      {selectedVisit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setSelectedVisit(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>{selectedVisit.requests?.title ?? 'Visita'}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{selectedVisit.requests?.clients?.name}</div>
              </div>
              <button onClick={() => setSelectedVisit(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: 0, marginBottom: 20 }}>
              {[
                ['Estado', VISIT_STATUS_LABELS[selectedVisit.status] ?? selectedVisit.status],
                ['Técnico', selectedVisit.technicians?.name ?? '— Sin asignar —'],
                ['Fecha/Hora', selectedVisit.scheduled_at ? new Date(selectedVisit.scheduled_at).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'],
                ['Duración', `${selectedVisit.duration_minutes ?? 60} min`],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{value}</span>
                </div>
              ))}
            </div>
            <Link href={`/solicitudes/${selectedVisit.request_id}`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Ver solicitud completa →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleModal({ data, pendingRequests, technicians, saving, onClose, onSubmit }) {
  const [requestId, setRequestId] = useState(data.requestId ?? '');
  const [technicianId, setTechnicianId] = useState('');
  const [dateStr, setDateStr] = useState(data.dateStr ?? new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(data.time ?? '09:00');
  const [duration, setDuration] = useState(60);

  const canSubmit = requestId && technicianId && dateStr && time;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>Agendar visita</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
        </div>

        <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Solicitud</label>
            <select value={requestId} onChange={e => setRequestId(e.target.value)} className="input" style={{ width: '100%' }}>
              <option value="">— Selecciona —</option>
              {pendingRequests.map(r => (
                <option key={r.id} value={r.id}>{r.title} — {r.clients?.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Técnico</label>
            <select value={technicianId} onChange={e => setTechnicianId(e.target.value)} className="input" style={{ width: '100%' }}>
              <option value="">— Selecciona —</option>
              {technicians.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Fecha</label>
              <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} className="input" style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Hora</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="input" style={{ width: '100%' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Duración (min)</label>
            <input type="number" step="15" value={duration} onChange={e => setDuration(parseInt(e.target.value) || 60)} className="input" style={{ width: '100%' }} />
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
          disabled={!canSubmit || saving}
          onClick={() => onSubmit({ requestId, technicianId, dateStr, time, duration })}>
          {saving ? 'Agendando...' : 'Agendar visita'}
        </button>
      </div>
    </div>
  );
}
