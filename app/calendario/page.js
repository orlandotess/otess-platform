
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import { getCurrentRole } from '../../lib/supabase-server';
import Sidebar from '../Sidebar';
import CalendarioClient from './calendario-client';

export default async function CalendarioPage({ searchParams }) {
  const view = searchParams?.view ?? 'month';
  const year = parseInt(searchParams?.year ?? new Date().getFullYear());
  const month = parseInt(searchParams?.month ?? new Date().getMonth());
  const week = parseInt(searchParams?.week ?? '0');

  const currentRole = await getCurrentRole();

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

  const { data: visits } = await supabase
    .from('visits')
    .select('id, request_id, technician_id, scheduled_at, duration_minutes, status, requests(title, clients(name)), technicians(name)')
    .order('scheduled_at');

  const { data: calendarEvents } = await supabase
    .from('calendar_events')
    .select('id, title, notes, address, start_at, end_at, client_id, technician_id, clients(name), technicians(name), calendar_event_technicians(technician_id, technicians(name))')
    .order('start_at');

  const { data: tasksRaw } = await supabase
    .from('tasks')
    .select('id, task_type, title, notes, due_at, client_id, technician_id, completed, clients(name), technicians(name), task_items(id, text, done, sort_order, attachments)')
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
      return { ...item, attachment_urls };
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

  // Client service requests waiting to be scheduled into a visit.
  const { data: pendingRequests } = await supabase
    .from('requests')
    .select('id, title, status, clients(name)')
    .not('status', 'in', '(agendado,cancelado)')
    .order('created_at', { ascending: true });

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content" style={{ padding: '24px 28px' }}>
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
          currentRole={currentRole}
          initialView={view}
          initialYear={year}
          initialMonth={month}
          initialWeek={week}
        />
      </main>
    </div>
  );
}
