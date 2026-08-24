export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import DispatchBoard from './DispatchBoard';
import { todayPR } from './dispatchUtils';
import { getTranslations } from 'next-intl/server';

// Puerto Rico usa AST (UTC-4) todo el año, sin horario de verano — el offset fijo es seguro aquí.
function dayBoundsPR(day) {
  return {
    start: new Date(`${day}T00:00:00-04:00`).toISOString(),
    end: new Date(`${day}T23:59:59.999-04:00`).toISOString(),
  };
}

// job_technicians se trae para contar técnicos de apoyo (badge "+N") y, junto con
// technicians(name), para mostrar nombres en el panel "Sin fecha" — el técnico
// "dueño" del bloque sigue siendo jobs.technician_id.
const JOB_FIELDS = 'id, title, job_number, status, technician_id, scheduled_start, scheduled_end, property_name, street, city, clients(name), technicians(name), job_technicians(technician_id, technicians(name))';

export default async function DispatchPage({ searchParams }) {
  const t = await getTranslations('admin.dispatch');
  const day = searchParams?.day ?? todayPR();
  const { start, end } = dayBoundsPR(day);

  const { data: technicians } = await supabase
    .from('technicians')
    .select('id, name')
    .order('name');

  // Jobs programados para este día (visita principal). Sin filtrar por technician_id:
  // asignar un técnico desde el job (app/trabajos/[id]/JobTabs.js) solo inserta en
  // job_technicians, así que jobs.technician_id casi siempre queda NULL y el filtro
  // dejaba fuera del board justamente los jobs del día. El board ya sabe repartirlos
  // (assignedTechIds mira job_technicians, y los que no tienen ninguno caen en la
  // fila "Sin técnico").
  const { data: scheduledJobs } = await supabase
    .from('jobs')
    .select(JOB_FIELDS)
    .gte('scheduled_start', start)
    .lte('scheduled_start', end)
    .order('scheduled_start');

  // Días extra de jobs multi-día (job_schedule_days) programados para este día — cada
  // fila es su propia visita (un técnico, un horario), separada de la visita principal.
  const { data: scheduleDayRows } = await supabase
    .from('job_schedule_days')
    .select(`
      id, job_id, scheduled_start, scheduled_end, technician_id, technicians(name),
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
      technicians: d.technicians,
      scheduled_start: d.scheduled_start,
      scheduled_end: d.scheduled_end,
      property_name: d.jobs.property_name,
      street: d.jobs.street,
      city: d.jobs.city,
      clients: d.jobs.clients,
      job_technicians: d.jobs.job_technicians ?? [],
    }));

  // Jobs sin fecha programada (cola de despacho), tengan o no ya un técnico asignado
  // (TechAssignControl puede fijar el técnico sin fecha) — van al panel "Sin fecha".
  const { data: unassignedJobs } = await supabase
    .from('jobs')
    .select(JOB_FIELDS)
    .is('scheduled_start', null)
    .not('status', 'in', '(completed,cancelled)')
    .order('created_at', { ascending: false });

  // Ausencias marcadas para este día (ver app/calendario/calendario-client.js) —
  // bloquean la fila del técnico en el Gantt para que no se le asignen jobs.
  const { data: absenceRows } = await supabase
    .from('technician_absences')
    .select('technician_id, reason')
    .eq('date', day);

  const absencesByTech = {};
  for (const a of absenceRows ?? []) absencesByTech[a.technician_id] = a.reason || t('absentDefault');

  // Clock-ins abiertos (Crew App) — para mostrar en qué job está cada técnico ahora
  // mismo, sin importar el día que se esté viendo en el board.
  const { data: openEntries } = await supabase
    .from('time_entries')
    .select('technician_id, job_id, jobs(title, job_number, clients(name))')
    .is('clocked_out_at', null)
    .not('job_id', 'is', null);

  const openEntryByTech = {};
  for (const e of openEntries ?? []) {
    if (!e.jobs) continue;
    openEntryByTech[e.technician_id] = {
      jobId: e.job_id,
      title: e.jobs.title,
      jobNumber: e.jobs.job_number,
      clientName: e.jobs.clients?.name ?? null,
    };
  }

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content dispatch-main">
        <DispatchBoard
          technicians={technicians ?? []}
          scheduledJobs={[...(scheduledJobs ?? []), ...extraDayJobs]}
          unassignedJobs={unassignedJobs ?? []}
          absencesByTech={absencesByTech}
          openEntryByTech={openEntryByTech}
          day={day}
        />
      </main>
    </div>
  );
}
