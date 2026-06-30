import { supabaseServer as supabase } from '../lib/supabase';
import Link from 'next/link';

const TECH_COLORS = [
  '#16223d', '#e0972c', '#27ae60', '#2a4cb5', '#e05c2a',
  '#8e44ad', '#16a085', '#c0392b', '#d35400', '#1abc9c',
];

const STATUS_LABELS = {
  estimate: 'Estimado', scheduled: 'Programado', in_progress: 'En progreso',
  completed: 'Completado', cancelled: 'Cancelado',
};

export default async function DashboardCalendarWidget() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [{ data: technicians }, { data: jobs }] = await Promise.all([
    supabase.from('technicians').select('id, name').order('name'),
    supabase.from('jobs')
      .select('id, title, status, scheduled_start, scheduled_end, technician_id, technicians(name), clients(name)')
      .not('scheduled_start', 'is', null)
      .gte('scheduled_start', monthStart)
      .lte('scheduled_start', monthEnd + 'T23:59:59')
      .order('scheduled_start'),
  ]);

  const techs = technicians ?? [];
  const allJobs = jobs ?? [];

  const techColors = {};
  techs.forEach((t, i) => { techColors[t.id] = TECH_COLORS[i % TECH_COLORS.length]; });

  const today = now.toISOString().slice(0, 10);
  const upcoming = allJobs
    .filter(j => j.scheduled_start.slice(0, 10) >= today && j.status !== 'cancelled' && j.status !== 'completed')
    .slice(0, 6);

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
  const fmtTime = iso => new Date(iso).toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' });
  const fmtDay = iso => new Date(iso).toLocaleDateString('es-PR', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>📅 Calendario — {months[month]} {year}</h2>
        <Link href="/calendario" className="btn btn-ghost" style={{ fontSize: 13, padding: '7px 14px' }}>Ver completo →</Link>
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
                    background: isToday ? '#f0f4ff' : cell.current ? '#fff' : '#f8f9fb',
                    border: isToday ? '2px solid var(--navy)' : '1px solid var(--border)', display: 'block' }}>
                  <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: cell.current ? 'var(--text)' : 'var(--muted)' }}>{cell.day}</div>
                  {dayJobs.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, marginTop: 4, flexWrap: 'wrap' }}>
                      {uniqueTechs.slice(0, 4).map(tid => (
                        <div key={tid} style={{ width: 6, height: 6, borderRadius: '50%', background: techColors[tid] ?? '#888' }} />
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

        {/* Upcoming jobs timeline */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>Próximos trabajos</div>
          {upcoming.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>No hay trabajos próximos.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upcoming.map(j => (
                <Link key={j.id} href={`/trabajos/${j.id}`} style={{ textDecoration: 'none', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: techColors[j.technician_id] ?? '#888', marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{j.clients?.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {fmtDay(j.scheduled_start)} · {fmtTime(j.scheduled_start)} {j.technicians?.name ? `· ${j.technicians.name}` : ''}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
