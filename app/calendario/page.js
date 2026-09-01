
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import { getCurrentRole, getCurrentUserName } from '../../lib/supabase-server';
import Sidebar from '../Sidebar';
import CalendarioClient from './calendario-client';

const IMAGE_PATH = /\.(jpe?g|png|gif|webp|heic|heif)$/i;
const ATTACHMENT_THUMB = { transform: { width: 400, height: 400, resize: 'contain' } };

// Una evaluación en sitio no guarda duración propia; se dibuja como un bloque fijo,
// igual que el que ofrecía el formulario de agendado.
const ASSESSMENT_DURATION_MINUTES = 60;

export default async function CalendarioPage(props) {
  const searchParams = await props.searchParams;
  const view = searchParams?.view ?? 'month';
  const year = parseInt(searchParams?.year ?? new Date().getFullYear());
  const month = parseInt(searchParams?.month ?? new Date().getMonth());
  const week = parseInt(searchParams?.week ?? '0');

  const currentRole = await getCurrentRole();
  const currentUserName = await getCurrentUserName();

  // Fetch jobs with technician info (both the legacy single technician_id and the
  // job_technicians junction table, since jobs can be assigned solely via the latter).
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, status, scheduled_start, scheduled_end, technician_id, technicians(id, name), clients(name), job_technicians(technician_id)')
    .not('scheduled_start', 'is', null)
    .order('scheduled_start');

  // Extra work days for jobs that span multiple (possibly non-consecutive) days.
  // Each is rendered as its own calendar entry, carrying the parent job's info.
  const { data: scheduleDayRows } = await supabase
    .from('job_schedule_days')
    .select('id, job_id, scheduled_start, scheduled_end, technician_id, technicians(id, name), jobs(id, title, status, clients(name), job_technicians(technician_id))')
    .order('scheduled_start');

  const extraJobDays = (scheduleDayRows ?? [])
    .filter(d => d.jobs)
    .map(d => ({
      id: `day-${d.id}`,
      job_id: d.job_id,
      schedule_day_id: d.id,
      title: d.jobs.title,
      status: d.jobs.status,
      scheduled_start: d.scheduled_start,
      scheduled_end: d.scheduled_end,
      technician_id: d.technician_id,
      technicians: d.technicians,
      clients: d.jobs.clients,
      job_technicians: d.jobs.job_technicians ?? [],
    }));

  const allJobs = [...(jobs ?? []), ...extraJobDays];

  // Las "visitas" del calendario son las evaluaciones en sitio de una solicitud
  // (solicitudes.assessment_date). El par requests/visits que se leía aquí quedó
  // superseded por el módulo Solicitudes y su tabla `visits` nunca llegó a crearse,
  // así que esta capa salía siempre vacía y el error se perdía en silencio.
  const { data: assessments, error: assessmentsError } = await supabase
    .from('solicitudes')
    .select('id, title, assessment_date, assessment_completed, status, technician_id, clients(name), technicians(name), solicitud_technicians(technician_id)')
    .not('assessment_date', 'is', null)
    .neq('status', 'archivada')
    .order('assessment_date');

  if (assessmentsError) console.error('Calendario: error cargando evaluaciones en sitio:', assessmentsError.message);

  const visits = (assessments ?? []).map(s => ({
    id: s.id,
    solicitud_id: s.id,
    title: s.title,
    clients: s.clients,
    technician_id: s.technician_id,
    technicians: s.technicians,
    solicitud_technicians: s.solicitud_technicians ?? [],
    scheduled_at: s.assessment_date,
    duration_minutes: ASSESSMENT_DURATION_MINUTES,
    status: s.assessment_completed ? 'completada' : 'agendada',
  }));

  const { data: calendarEvents } = await supabase
    .from('calendar_events')
    .select('id, title, notes, address, property_name, start_at, end_at, client_id, technician_id, clients(name), technicians(name), calendar_event_technicians(technician_id, technicians(name))')
    .order('start_at');

  const { data: tasksRaw } = await supabase
    .from('tasks')
    .select('id, task_type, title, notes, address, due_at, client_id, technician_id, completed, clients(name), technicians(name), task_items(id, text, done, sort_order, attachments), task_technicians(technician_id, technicians(name))')
    .order('due_at');

  // Resolve a signed URL (1h) for each stored attachment path so images/videos can render inline.
  const tasks = await Promise.all((tasksRaw ?? []).map(async (t) => ({
    ...t,
    task_items: await Promise.all((t.task_items ?? []).map(async (item) => {
      const paths = item.attachments ?? [];
      const attachment_urls = await Promise.all(paths.map(async (p) => {
        const { data } = await supabase.storage.from('Job-photos').createSignedUrl(p, 3600);
        return data?.signedUrl ?? null;
      }));
      // Attachments show as 56px tiles but come off a phone camera at several MB
      // each — serve the tiles a resized render and keep the originals for the
      // lightbox. Videos/PDFs can't be transformed, so they fall back to the original.
      const attachment_thumb_urls = await Promise.all(paths.map(async (p, i) => {
        if (!IMAGE_PATH.test(p)) return attachment_urls[i];
        const { data } = await supabase.storage.from('Job-photos').createSignedUrl(p, 3600, ATTACHMENT_THUMB);
        return data?.signedUrl ?? attachment_urls[i];
      }));
      return { ...item, attachment_urls, attachment_thumb_urls };
    })),
  })));

  const { data: technicians } = await supabase
    .from('technicians')
    .select('id, name, ics_token')
    .order('name');

  const { data: absences } = await supabase
    .from('technician_absences')
    .select('id, technician_id, date, reason, technicians(name)')
    .order('date');

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .order('name');

  const { data: clientProperties } = await supabase
    .from('client_properties')
    .select('id, client_id, name, street, city, state, zip, is_primary')
    .order('is_primary', { ascending: false });

  // Solicitudes que todavía no tienen una evaluación en sitio puesta en el calendario.
  const { data: pendingRequests, error: pendingError } = await supabase
    .from('solicitudes')
    .select('id, title, status, clients(name)')
    .is('assessment_date', null)
    .not('status', 'in', '(convertida,archivada)')
    .order('created_at', { ascending: true });

  if (pendingError) console.error('Calendario: error cargando solicitudes pendientes:', pendingError.message);

  // Jobs without a date yet (same "cola de despacho" the Dispatch Board's "Sin fecha"
  // panel uses) — candidates for the "+ Reserva" booking modal.
  const { data: unscheduledJobs } = await supabase
    .from('jobs')
    .select('id, title, status, technician_id, clients(name), job_technicians(technician_id)')
    .is('scheduled_start', null)
    .not('status', 'in', '(completed,cancelled)')
    .order('created_at', { ascending: false });

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content calendario-main" style={{ padding: '24px 28px' }}>
        <CalendarioClient
          jobs={allJobs}
          technicians={technicians ?? []}
          visits={visits ?? []}
          calendarEvents={calendarEvents ?? []}
          tasks={tasks ?? []}
          absences={absences ?? []}
          clients={clients ?? []}
          clientProperties={clientProperties ?? []}
          pendingRequests={pendingRequests ?? []}
          unscheduledJobs={unscheduledJobs ?? []}
          currentRole={currentRole}
          currentUserName={currentUserName}
          initialView={view}
          initialYear={year}
          initialMonth={month}
          initialWeek={week}
        />
      </main>
    </div>
  );
}
