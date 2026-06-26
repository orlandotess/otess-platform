export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';
import PayrollClient from './PayrollClient';

function getWeekRange(offset = 0) {
  // Week: Wednesday to Tuesday
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  // Days since last Wednesday
  const daysSinceWed = (day + 4) % 7; // Wed=0, Thu=1, Fri=2, Sat=3, Sun=4, Mon=5, Tue=6
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysSinceWed + (offset * 7));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

export default async function HorarioPage({ searchParams }) {
  const weekOffset = parseInt(searchParams?.week ?? '0');
  const { weekStart, weekEnd } = getWeekRange(weekOffset);

  const [{ data: technicians }, { data: entries }] = await Promise.all([
    supabase.from('technicians').select('*').order('name'),
    supabase.from('time_entries')
      .select('*')
      .gte('clocked_in_at', weekStart.toISOString())
      .lte('clocked_in_at', weekEnd.toISOString())
      .not('clocked_out_at', 'is', null)
      .order('clocked_in_at'),
  ]);

  const fmtDate = d => d.toLocaleDateString('es-PR', { weekday: 'short', month: 'short', day: 'numeric' });
  const weekLabel = `${fmtDate(weekStart)} — ${fmtDate(weekEnd)}`;

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">Horario & Payroll</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{weekLabel}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href={`/horario?week=${weekOffset - 1}`} className="btn btn-ghost">← Semana anterior</Link>
            {weekOffset !== 0 && <Link href="/horario" className="btn btn-ghost">Semana actual</Link>}
            {weekOffset < 0 && <Link href={`/horario?week=${weekOffset + 1}`} className="btn btn-ghost">Semana siguiente →</Link>}
          </div>
        </div>

        <PayrollClient
          technicians={technicians ?? []}
          entries={entries ?? []}
          weekStart={weekStart.toISOString()}
          weekEnd={weekEnd.toISOString()}
          weekLabel={weekLabel}
        />
      </main>
    </div>
  );
}
