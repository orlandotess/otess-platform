import { supabaseServer as supabase } from '../lib/supabase';
import { getCurrentRole } from '../lib/supabase-server';
import Link from 'next/link';
import DashboardWeekJobs from './DashboardWeekJobs';

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

  const [{ data: technicians }, { data: jobs }, currentRole] = await Promise.all([
    supabase.from('technicians').select('id, name').order('name'),
    supabase.from('jobs')
      .select('id, title, status, scheduled_start, scheduled_end, technician_id, technicians(name), clients(name)')
      .not('scheduled_start', 'is', null)
      .gte('scheduled_start', rangeStart)
      .lte('scheduled_start', rangeEnd + 'T23:59:59')
      .order('scheduled_start'),
    getCurrentRole(),
  ]);
  const canQuickReschedule = currentRole === 'admin';

  const techs = technicians ?? [];
  const allJobs = jobs ?? [];

  const techColors = {};
  techs.forEach((t, i) => { techColors[t.id] = TECH_COLORS[i % TECH_COLORS.length]; });

  const today = now.toISOString().slice(0, 10);
  const weekJobs = allJobs
    .filter(j => {
      const start = j.scheduled_start?.slice(0, 10);
      const end = (j.scheduled_end ?? j.scheduled_start)?.slice(0, 10);
      return start && start <= weekEnd && end >= weekStart;
    })
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));

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

  const jobsByDate = {};
  allJobs.forEach(j => {
    const start = j.scheduled_start?.slice(0, 10);
    const end = (j.scheduled_end ?? j.scheduled_start)?.slice(0, 10);
    if (!start) return;
    let d = new Date(start);
    const endD = new Date(end);
    while (d <= endD) {
      const ds = d.toISOString().slice(0, 10);
      if (!jobsByDate[ds]) jobsByDate[ds] = [];
      jobsByDate[ds].push(j);
      d.setDate(d.getDate() + 1);
    }
  });

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
              const dayJobs = cell.date ? (jobsByDate[cell.date] ?? []) : [];
              const isToday = cell.date === today;
              const uniqueTechs = [...new Set(dayJobs.map(j => j.technician_id).filter(Boolean))];
              return (
                <Link key={idx} href={cell.date ? `/calendario?view=month&year=${year}&month=${month}` : '#'}
                  style={{ minHeight: 54, padding: '4px 6px', borderRadius: 8, textDecoration: 'none',
                    background: isToday ? '#f0f4ff' : cell.current ? 'var(--surface)' : 'var(--surface-2)',
                    border: isToday ? '2px solid var(--navy)' : '1px solid var(--border)', display: 'block' }}>
                  <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: cell.current ? 'var(--text)' : 'var(--muted)' }}>{cell.day}</div>
                  {dayJobs.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, marginTop: 4, flexWrap: 'wrap' }}>
                      {uniqueTechs.slice(0, 4).map(tid => (
                        <div key={tid} style={{ width: 6, height: 6, borderRadius: '50%', background: techColors[tid] ?? 'var(--ink-faint)' }} />
                      ))}
                      {dayJobs.length > 4 && <span style={{ fontSize: 9, color: 'var(--muted)' }}>+{dayJobs.length - 4}</span>}
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

        {/* This week's jobs */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Trabajos de esta semana</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{weekRangeLabel}</div>
          </div>
          <DashboardWeekJobs
            jobs={weekJobs}
            techColors={techColors}
            canQuickReschedule={canQuickReschedule}
          />
        </div>
      </div>
    </div>
  );
}
