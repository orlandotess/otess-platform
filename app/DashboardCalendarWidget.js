import { supabaseServer as supabase } from '../lib/supabase';
import { getCurrentRole } from '../lib/supabase-server';
import Link from 'next/link';
import DashboardWeekItems from './DashboardWeekItems';

const TECH_COLORS = [
  '#16223d', '#e0972c', '#27ae60', '#2a4cb5', '#e05c2a',
  '#8e44ad', '#16a085', '#c0392b', '#d35400', '#1abc9c',
];

export default async function DashboardCalendarWidget() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Current week (Monday–Sunday), matching the /calendario week view.
  const dayOfWeek = now.getDay();
  const diffToMon = (dayOfWeek + 6) % 7;
  const weekStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon);
  const weekEndDate = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + 6);
  const weekStart = weekStartDate.toISOString().slice(0, 10);
  const weekEnd = weekEndDate.toISOString().slice(0, 10);

  const rangeStart = weekStart < monthStart ? weekStart : monthStart;
  const rangeEnd = weekEnd > monthEnd ? weekEnd : monthEnd;
  const rangeEndTs = rangeEnd + 'T23:59:59';

  const [
    { data: technicians },
    { data: jobs },
    { data: visits },
    { data: calendarEvents },
    { data: tasks },
    { data: absences },
    currentRole,
  ] = await Promise.all([
    supabase.from('technicians').select('id, name').order('name'),
    supabase.from('jobs')
      .select('id, title, status, scheduled_start, scheduled_end, technician_id, technicians(name), clients(name)')
      .not('scheduled_start', 'is', null)
      .gte('scheduled_start', rangeStart)
      .lte('scheduled_start', rangeEndTs)
      .order('scheduled_start'),
    supabase.from('visits')
      .select('id, request_id, technician_id, scheduled_at, duration_minutes, status, requests(title, clients(name)), technicians(name)')
      .gte('scheduled_at', rangeStart)
      .lte('scheduled_at', rangeEndTs)
      .order('scheduled_at'),
    supabase.from('calendar_events')
      .select('id, title, notes, address, start_at, end_at, client_id, technician_id, clients(name), technicians(name), calendar_event_technicians(technician_id, technicians(name))')
      .gte('start_at', rangeStart)
      .lte('start_at', rangeEndTs)
      .order('start_at'),
    supabase.from('tasks')
      .select('id, task_type, title, notes, due_at, client_id, technician_id, completed, clients(name), technicians(name)')
      .gte('due_at', rangeStart)
      .lte('due_at', rangeEndTs)
      .order('due_at'),
    supabase.from('technician_absences')
      .select('id, technician_id, date, reason, technicians(name)')
      .gte('date', rangeStart)
      .lte('date', rangeEnd)
      .order('date'),
    getCurrentRole(),
  ]);
  const canQuickReschedule = currentRole === 'admin';

  const techs = technicians ?? [];
  const allJobs = jobs ?? [];
  const allVisits = visits ?? [];
  const allEvents = calendarEvents ?? [];
  const allTasks = tasks ?? [];
  const allAbsences = absences ?? [];

  const techColors = {};
  // Hashed by ID rather than array index so a technician keeps the same color
  // even after others are added/removed/reordered in the technicians table.
  techs.forEach((t) => {
    let hash = 0;
    const id = String(t.id);
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    techColors[t.id] = TECH_COLORS[hash % TECH_COLORS.length];
  });

  const today = now.toISOString().slice(0, 10);
  const inWeek = dateStr => dateStr && dateStr <= weekEnd && dateStr >= weekStart;

  const weekJobs = allJobs.filter(j => {
    const start = j.scheduled_start?.slice(0, 10);
    const end = (j.scheduled_end ?? j.scheduled_start)?.slice(0, 10);
    return start && start <= weekEnd && end >= weekStart;
  });
  const weekVisits = allVisits.filter(v => inWeek(v.scheduled_at?.slice(0, 10)));
  const weekEvents = allEvents.filter(e => inWeek(e.start_at?.slice(0, 10)));
  const weekTasks = allTasks.filter(t => inWeek(t.due_at?.slice(0, 10)));
  const weekAbsences = allAbsences.filter(a => inWeek(a.date));

  const fmtRangeLabel = (start, end) => {
    const sameMonth = start.getMonth() === end.getMonth();
    const startLabel = start.toLocaleDateString('es-PR', { day: 'numeric', month: sameMonth ? undefined : 'short' });
    const endLabel = end.toLocaleDateString('es-PR', { day: 'numeric', month: 'short' });
    return `${startLabel} – ${endLabel}`;
  };
  const weekRangeLabel = fmtRangeLabel(weekStartDate, weekEndDate);

  // Mini month calendar
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevDays - i, current: false, date: null });
  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    cells.push({ day: i, current: true, date: dateStr });
  }
  const remaining = (cells.length <= 35 ? 35 : 42) - cells.length;
  for (let i = 1; i <= remaining; i++) cells.push({ day: i, current: false, date: null });

  // One combined map so the mini calendar's day dots reflect jobs, visits, events, tasks
  // and absences alike — matching the full picture shown on /calendario.
  const itemsByDate = {};
  const addRange = (startIso, endIso, technicianId) => {
    const start = startIso?.slice(0, 10);
    if (!start) return;
    const end = (endIso ?? startIso)?.slice(0, 10);
    let d = new Date(start);
    const endD = new Date(end);
    while (d <= endD) {
      const ds = d.toISOString().slice(0, 10);
      if (!itemsByDate[ds]) itemsByDate[ds] = [];
      itemsByDate[ds].push({ technicianId });
      d.setDate(d.getDate() + 1);
    }
  };
  allJobs.forEach(j => addRange(j.scheduled_start, j.scheduled_end, j.technician_id));
  allVisits.forEach(v => addRange(v.scheduled_at, v.scheduled_at, v.technician_id));
  allEvents.forEach(e => addRange(e.start_at, e.end_at, e.technician_id));
  allTasks.forEach(t => addRange(t.due_at, t.due_at, t.technician_id));
  allAbsences.forEach(a => addRange(a.date, a.date, a.technician_id));

  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>📅 Calendario — {months[month]} {year}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/calendario?view=week" className="btn btn-ghost" style={{ fontSize: 13, padding: '7px 14px' }}>Ver semana →</Link>
          <Link href="/calendario" className="btn btn-ghost" style={{ fontSize: 13, padding: '7px 14px' }}>Ver completo →</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>
        {/* Mini calendar */}
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
            {['D','L','M','X','J','V','S'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)', padding: '4px 0' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {cells.map((cell, idx) => {
              const dayItems = cell.date ? (itemsByDate[cell.date] ?? []) : [];
              const isToday = cell.date === today;
              const uniqueTechs = [...new Set(dayItems.map(i => i.technicianId).filter(Boolean))];
              return (
                <Link key={idx} href={cell.date ? `/calendario?view=month&year=${year}&month=${month}` : '#'}
                  style={{ minHeight: 54, padding: '4px 6px', borderRadius: 8, textDecoration: 'none',
                    background: isToday ? 'var(--info-tint)' : cell.current ? 'var(--surface)' : 'var(--surface-2)',
                    border: isToday ? '2px solid var(--navy)' : '1px solid var(--border)', display: 'block' }}>
                  <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: cell.current ? 'var(--text)' : 'var(--muted)' }}>{cell.day}</div>
                  {dayItems.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, marginTop: 4, flexWrap: 'wrap' }}>
                      {uniqueTechs.slice(0, 4).map(tid => (
                        <div key={tid} style={{ width: 6, height: 6, borderRadius: '50%', background: techColors[tid] ?? 'var(--ink-faint)' }} />
                      ))}
                      {dayItems.length > 4 && <span style={{ fontSize: 9, color: 'var(--muted)' }}>+{dayItems.length - 4}</span>}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
          {techs.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              {techs.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: techColors[t.id] }} />
                  {t.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* This week's items */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Esta semana</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{weekRangeLabel}</div>
          </div>
          <DashboardWeekItems
            jobs={weekJobs}
            visits={weekVisits}
            events={weekEvents}
            tasks={weekTasks}
            absences={weekAbsences}
            techColors={techColors}
            canQuickReschedule={canQuickReschedule}
          />
        </div>
      </div>
    </div>
  );
}
