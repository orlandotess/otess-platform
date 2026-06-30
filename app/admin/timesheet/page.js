export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import TimesheetClient from './TimesheetClient';

function getWeekRange(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const daysSinceWed = (day + 4) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysSinceWed + (offset * 7));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

export default async function TimesheetPage({ searchParams }) {
  const weekOffset = parseInt(searchParams?.week ?? "0");
  const techFilter = searchParams?.tech ?? "all";
  const { weekStart, weekEnd } = getWeekRange(weekOffset);

  const [{ data: technicians }, { data: entries }] = await Promise.all([
    supabase.from("technicians").select("*").order("name"),
    supabase.from("time_entries")
      .select("*, technicians(name)")
      .gte("clocked_in_at", weekStart.toISOString())
      .lte("clocked_in_at", weekEnd.toISOString())
      .order("clocked_in_at"),
  ]);

  const techs = technicians ?? [];
  const ents = entries ?? [];

  const fmtDate = d => new Date(d).toLocaleDateString("es-PR", { weekday: "short", month: "short", day: "numeric" });

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  // PR timezone offset (UTC-4)
  const PR_OFFSET = 4 * 60 * 60 * 1000;
  const toPRDate = (isoStr) => new Date(new Date(isoStr).getTime() - PR_OFFSET).toISOString().slice(0, 10);

  const techStats = techs.map(tech => {
    const techEntries = ents.filter(e => e.technician_id === tech.id);
    const byDay = {};
    weekDays.forEach(d => { byDay[toPRDate(d.toISOString())] = []; });
    techEntries.forEach(e => {
      const day = toPRDate(e.clocked_in_at);
      if (byDay[day] !== undefined) byDay[day].push(e);
    });

    let regularHours = 0, overtimeHours = 0;
    Object.values(byDay).forEach(dayEntries => {
      const hours = dayEntries.reduce((a, e) => a + (e.clocked_out_at
        ? (new Date(e.clocked_out_at) - new Date(e.clocked_in_at)) / 3600000
        : (Date.now() - new Date(e.clocked_in_at)) / 3600000), 0);
      if (hours > 8) { regularHours += 8; overtimeHours += hours - 8; }
      else regularHours += hours;
    });

    const rate = Number(tech.hourly_rate ?? 0);
    const grossPay = (regularHours * rate) + (overtimeHours * rate * 1.5);

    return { ...tech, regularHours, overtimeHours, totalHours: regularHours + overtimeHours, grossPay, byDay, entries: techEntries };
  });

  const filtered = techStats.filter(t => techFilter === "all" || t.id === techFilter);

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">Timesheet</div>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
              {fmtDate(weekStart)} — {fmtDate(weekEnd)}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/accounting/payroll?view=week" className="btn btn-ghost">⏱ Payroll</Link>
            <Link href="/accounting" className="btn btn-ghost">← Dashboard</Link>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Semana</label>
              <div style={{ display: "flex", gap: 6 }}>
                <Link href={`/admin/timesheet?week=${weekOffset - 1}&tech=${techFilter}`} className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}>← Anterior</Link>
                {weekOffset !== 0 && <Link href={`/admin/timesheet?tech=${techFilter}`} className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}>Actual</Link>}
                {weekOffset < 0 && <Link href={`/admin/timesheet?week=${weekOffset + 1}&tech=${techFilter}`} className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}>Siguiente →</Link>}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Técnico</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Link href={`/admin/timesheet?week=${weekOffset}&tech=all`} className={`btn ${techFilter === "all" ? "btn-primary" : "btn-ghost"}`} style={{ padding: "6px 14px", fontSize: 13 }}>Todos</Link>
                {techs.map(t => (
                  <Link key={t.id} href={`/admin/timesheet?week=${weekOffset}&tech=${t.id}`} className={`btn ${techFilter === t.id ? "btn-primary" : "btn-ghost"}`} style={{ padding: "6px 14px", fontSize: 13 }}>{t.name}</Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 20 }}>
          <div className="stat-card"><div className="stat-label">Horas regulares</div><div className="stat-value">{filtered.reduce((a, t) => a + t.regularHours, 0).toFixed(1)}h</div></div>
          <div className="stat-card"><div className="stat-label">Overtime</div><div className="stat-value" style={{ color: "var(--warn)" }}>{filtered.reduce((a, t) => a + t.overtimeHours, 0).toFixed(1)}h</div></div>
          <div className="stat-card"><div className="stat-label">Total horas</div><div className="stat-value">{filtered.reduce((a, t) => a + t.totalHours, 0).toFixed(1)}h</div></div>
          <div className="stat-card"><div className="stat-label">Gross estimado</div><div className="stat-value" style={{ color: "var(--ok)" }}>${filtered.reduce((a, t) => a + t.grossPay, 0).toFixed(2)}</div></div>
        </div>

        <TimesheetClient techStats={techStats} weekDays={weekDays.map(d => d.toISOString())} techFilter={techFilter} />
      </main>
    </div>
  );
}
