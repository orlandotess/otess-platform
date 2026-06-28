
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import CalendarioClient from './CalendarioClient';

export default async function CalendarioPage({ searchParams }) {
  const view = searchParams?.view ?? 'month';
  const year = parseInt(searchParams?.year ?? new Date().getFullYear());
  const month = parseInt(searchParams?.month ?? new Date().getMonth());
  const week = parseInt(searchParams?.week ?? '0');

  // Fetch jobs with technician info
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, status, scheduled_start, scheduled_end, technician_id, technicians(id, name), clients(name)')
    .not('scheduled_start', 'is', null)
    .order('scheduled_start');

  const { data: technicians } = await supabase
    .from('technicians')
    .select('id, name')
    .order('name');

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content" style={{ padding: '24px 28px' }}>
        <CalendarioClient
          jobs={jobs ?? []}
          technicians={technicians ?? []}
          initialView={view}
          initialYear={year}
          initialMonth={month}
          initialWeek={week}
        />
      </main>
    </div>
  );
}
