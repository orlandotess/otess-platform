import { createEvents } from 'ics';
import { supabaseServer as supabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

function toUTCArray(iso) {
  const d = new Date(iso);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()];
}

function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

export async function GET(req) {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return new Response('Falta token', { status: 400 });

  let technicianId = null;
  if (token !== process.env.CALENDAR_ADMIN_TOKEN) {
    const { data: tech } = await supabase.from('technicians').select('id').eq('ics_token', token).maybeSingle();
    if (!tech) return new Response('Token inválido', { status: 404 });
    technicianId = tech.id;
  }

  const [{ data: jobs }, { data: visits }, { data: calendarEvents }, { data: tasks }] = await Promise.all([
    supabase.from('jobs')
      .select('id, title, status, scheduled_start, scheduled_end, technician_id, clients(name), job_technicians(technician_id)')
      .not('scheduled_start', 'is', null),
    supabase.from('visits')
      .select('id, technician_id, scheduled_at, duration_minutes, status, requests(title, clients(name))'),
    supabase.from('calendar_events')
      .select('id, title, notes, start_at, end_at, technician_id, clients(name), calendar_event_technicians(technician_id)'),
    supabase.from('tasks')
      .select('id, task_type, title, notes, due_at, technician_id, clients(name)'),
  ]);

  const matchesTech = (jobTechnicianId, jobTechnicians) => {
    if (!technicianId) return true;
    if (jobTechnicianId === technicianId) return true;
    return (jobTechnicians ?? []).some(jt => jt.technician_id === technicianId);
  };

  const icsEvents = [];

  for (const j of jobs ?? []) {
    if (!matchesTech(j.technician_id, j.job_technicians)) continue;
    icsEvents.push({
      uid: `job-${j.id}@otesspr.com`,
      title: j.title,
      description: [j.clients?.name, j.status].filter(Boolean).join(' — '),
      start: toUTCArray(j.scheduled_start),
      startInputType: 'utc',
      startOutputType: 'utc',
      end: toUTCArray(j.scheduled_end ?? addMinutes(j.scheduled_start, 60)),
      endInputType: 'utc',
      endOutputType: 'utc',
    });
  }

  for (const v of visits ?? []) {
    if (technicianId && v.technician_id !== technicianId) continue;
    icsEvents.push({
      uid: `visit-${v.id}@otesspr.com`,
      title: v.requests?.title ?? 'Visita',
      description: [v.requests?.clients?.name, v.status].filter(Boolean).join(' — '),
      start: toUTCArray(v.scheduled_at),
      startInputType: 'utc',
      startOutputType: 'utc',
      end: toUTCArray(addMinutes(v.scheduled_at, v.duration_minutes ?? 60)),
      endInputType: 'utc',
      endOutputType: 'utc',
    });
  }

  for (const e of calendarEvents ?? []) {
    if (!matchesTech(e.technician_id, e.calendar_event_technicians)) continue;
    icsEvents.push({
      uid: `event-${e.id}@otesspr.com`,
      title: e.title,
      description: [e.clients?.name, e.notes].filter(Boolean).join(' — '),
      start: toUTCArray(e.start_at),
      startInputType: 'utc',
      startOutputType: 'utc',
      end: toUTCArray(e.end_at),
      endInputType: 'utc',
      endOutputType: 'utc',
    });
  }

  for (const t of tasks ?? []) {
    if (technicianId && t.technician_id !== technicianId) continue;
    const label = t.task_type === 'checklist' ? 'Checklist' : 'Recordatorio';
    icsEvents.push({
      uid: `task-${t.id}@otesspr.com`,
      title: `${label}: ${t.title}`,
      description: [t.clients?.name, t.notes].filter(Boolean).join(' — '),
      start: toUTCArray(t.due_at),
      startInputType: 'utc',
      startOutputType: 'utc',
      end: toUTCArray(addMinutes(t.due_at, 30)),
      endInputType: 'utc',
      endOutputType: 'utc',
    });
  }

  const { error, value } = createEvents(icsEvents);
  if (error) return new Response('Error generando el feed', { status: 500 });

  return new Response(value, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="otess-calendario.ics"',
    },
  });
}
