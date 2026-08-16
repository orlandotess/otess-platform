import { createEvents } from 'ics';
import { supabaseServer as supabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

// Una evaluación en sitio no guarda duración propia; se exporta como un bloque fijo.
const ASSESSMENT_DURATION_MINUTES = 60;

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

  const [{ data: jobs }, { data: jobScheduleDays }, { data: visits }, { data: calendarEvents }, { data: tasks }] = await Promise.all([
    supabase.from('jobs')
      .select('id, title, status, scheduled_start, scheduled_end, technician_id, clients(name), job_technicians(technician_id)')
      .not('scheduled_start', 'is', null),
    // Extra visits added via "+ Añadir día" on a job — separate from the job's
    // own scheduled_start/end, so they need their own events or a technician's
    // synced phone calendar silently misses those visits entirely.
    supabase.from('job_schedule_days')
      .select('id, scheduled_start, scheduled_end, technician_id, jobs(title, status, clients(name))'),
    // Evaluaciones en sitio de solicitudes — reemplazan la tabla `visits` del
    // módulo Requests original, que nunca llegó a crearse.
    supabase.from('solicitudes')
      .select('id, title, assessment_date, assessment_completed, technician_id, clients(name), solicitud_technicians(technician_id)')
      .not('assessment_date', 'is', null).neq('status', 'archivada'),
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

  for (const d of jobScheduleDays ?? []) {
    if (technicianId && d.technician_id !== technicianId) continue;
    if (!d.scheduled_start || !d.scheduled_end) continue;
    icsEvents.push({
      uid: `job-day-${d.id}@otesspr.com`,
      title: d.jobs?.title ?? 'Trabajo',
      description: [d.jobs?.clients?.name, d.jobs?.status].filter(Boolean).join(' — '),
      start: toUTCArray(d.scheduled_start),
      startInputType: 'utc',
      startOutputType: 'utc',
      end: toUTCArray(d.scheduled_end),
      endInputType: 'utc',
      endOutputType: 'utc',
    });
  }

  for (const v of visits ?? []) {
    if (!matchesTech(v.technician_id, v.solicitud_technicians)) continue;
    icsEvents.push({
      uid: `visit-${v.id}@otesspr.com`,
      title: v.title ?? 'Visita',
      description: [v.clients?.name, v.assessment_completed ? 'completada' : 'agendada'].filter(Boolean).join(' — '),
      start: toUTCArray(v.assessment_date),
      startInputType: 'utc',
      startOutputType: 'utc',
      end: toUTCArray(addMinutes(v.assessment_date, ASSESSMENT_DURATION_MINUTES)),
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
