export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import DispatchBoard from './DispatchBoard';
import { todayPR } from './dispatchUtils';

// Puerto Rico usa AST (UTC-4) todo el año, sin horario de verano — el offset fijo es seguro aquí.
function dayBoundsPR(day) {
  return {
    start: new Date(`${day}T00:00:00-04:00`).toISOString(),
    end: new Date(`${day}T23:59:59.999-04:00`).toISOString(),
  };
}

// job_technicians se trae solo para contar técnicos de apoyo (badge "+N") — el
// técnico "dueño" del bloque sigue siendo jobs.technician_id.
const JOB_FIELDS = 'id, title, job_number, status, technician_id, scheduled_start, scheduled_end, property_name, street, city, clients(name), job_technicians(technician_id)';

export default async function DispatchPage({ searchParams }) {
  const day = searchParams?.day ?? todayPR();
  const { start, end } = dayBoundsPR(day);

  const { data: technicians } = await supabase
    .from('technicians')
    .select('id, name')
    .order('name');

  // Jobs ya asignados a un técnico y programados para este día (visita principal).
  const { data: scheduledJobs } = await supabase
    .from('jobs')
    .select(JOB_FIELDS)
    .not('technician_id', 'is', null)
    .gte('scheduled_start', start)
    .lte('scheduled_start', end)
    .order('scheduled_start');

  // Días extra de jobs multi-día (job_schedule_days) programados para este día — cada
  // fila es su propia visita (un técnico, un horario), separada de la visita principal.
  const { data: scheduleDayRows } = await supabase
    .from('job_schedule_days')
    .select(`
      id, job_id, scheduled_start, scheduled_end, technician_id,
      jobs (title, job_number, status, property_name, street, city, clients(name), job_technicians(technician_id))
    `)
    .not('technician_id', 'is', null)
    .gte('scheduled_start', start)
    .lte('scheduled_start', end)
    .order('scheduled_start');

  const extraDayJobs = (scheduleDayRows ?? [])
    .filter(d => d.jobs)
    .map(d => ({
      id: `day-${d.id}`,
      schedule_day_id: d.id,
      job_id: d.job_id,
      title: d.jobs.title,
      job_number: d.jobs.job_number,
      status: d.jobs.status,
      technician_id: d.technician_id,
      scheduled_start: d.scheduled_start,
      scheduled_end: d.scheduled_end,
      property_name: d.jobs.property_name,
      street: d.jobs.street,
      city: d.jobs.city,
      clients: d.jobs.clients,
      job_technicians: d.jobs.job_technicians ?? [],
    }));

  // Jobs sin técnico asignado (cola de despacho), sin importar el día — van al panel lateral.
  const { data: unassignedJobs } = await supabase
    .from('jobs')
    .select(JOB_FIELDS)
    .is('technician_id', null)
    .not('status', 'in', '(completed,cancelled)')
    .order('created_at', { ascending: false });

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content dispatch-main">
        <DispatchBoard
          technicians={technicians ?? []}
          scheduledJobs={[...(scheduledJobs ?? []), ...extraDayJobs]}
          unassignedJobs={unassignedJobs ?? []}
          day={day}
        />
      </main>
    </div>
  );
}
