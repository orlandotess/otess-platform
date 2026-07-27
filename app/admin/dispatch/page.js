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

const JOB_FIELDS = 'id, title, job_number, status, technician_id, scheduled_start, scheduled_end, property_name, street, city, clients(name)';

export default async function DispatchPage({ searchParams }) {
  const day = searchParams?.day ?? todayPR();
  const { start, end } = dayBoundsPR(day);

  const { data: technicians } = await supabase
    .from('technicians')
    .select('id, name')
    .order('name');

  // Jobs ya asignados a un técnico y programados para este día.
  const { data: scheduledJobs } = await supabase
    .from('jobs')
    .select(JOB_FIELDS)
    .not('technician_id', 'is', null)
    .gte('scheduled_start', start)
    .lte('scheduled_start', end)
    .order('scheduled_start');

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
          scheduledJobs={scheduledJobs ?? []}
          unassignedJobs={unassignedJobs ?? []}
          day={day}
        />
      </main>
    </div>
  );
}
