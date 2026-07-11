export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer as supabase } from "../../../../lib/supabase";
import Sidebar from "../../../Sidebar";
import Link from "next/link";
import HistorialClient from "./HistorialClient";

function getWeekRange(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const daysSinceWed = (day + 4) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysSinceWed + (offset * 7));
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

export default async function PayrollHistorial() {
  const [{ data: technicians }, { data: allEntries }, { data: allAdjustments }] = await Promise.all([
    supabase.from("technicians").select("*").order("name"),
    supabase.from("time_entries").select("*").not("clocked_out_at", "is", null).order("clocked_in_at"),
    supabase.from("payroll_adjustments").select("*").order("period_start", { ascending: false }),
  ]);

  const techs = technicians ?? [];
  const entries = allEntries ?? [];
  const adjustments = allAdjustments ?? [];

  // Build a set of all week period_start values that have activity (from entries or adjustments)
  const weekStarts = new Set();
  const nowWeekStart = getWeekRange(0);

  entries.forEach(e => {
    const d = new Date(e.clocked_in_at);
    const day = d.getDay();
    const daysSinceWed = (day + 4) % 7;
    const ws = new Date(d);
    ws.setDate(d.getDate() - daysSinceWed);
    ws.setHours(0, 0, 0, 0);
    weekStarts.add(ws.toISOString().slice(0, 10));
  });
  adjustments.forEach(a => weekStarts.add(a.period_start));

  const months = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  // Build rows: one per technician per week
  const rows = [];
  [...weekStarts].sort((a, b) => new Date(b) - new Date(a)).forEach(wsStr => {
    const weekStart = new Date(wsStr + "T00:00:00");
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const fridayDate = new Date(weekStart);
    fridayDate.setDate(weekStart.getDate() + 2);

    techs.forEach(tech => {
      const techEntries = entries.filter(e => {
        const day = e.clocked_in_at.slice(0, 10);
        return e.technician_id === tech.id && day >= wsStr && day <= weekEndStr;
      });

      const byDay = {};
      techEntries.forEach(e => {
        const day = e.clocked_in_at.slice(0, 10);
        if (!byDay[day]) byDay[day] = 0;
        byDay[day] += (new Date(e.clocked_out_at) - new Date(e.clocked_in_at)) / 3600000 - (e.lunch_minutes ?? 0) / 60;
      });
      let rawRegular = 0, rawOvertime = 0, cumulativeHours = 0;
      Object.keys(byDay).sort().forEach(day => {
        const h = byDay[day];
        const dayRegular = Math.min(h, Math.max(0, 40 - cumulativeHours));
        rawRegular += dayRegular;
        rawOvertime += h - dayRegular;
        cumulativeHours += h;
      });

      const adj = adjustments.find(a => a.technician_id === tech.id && a.period_start === wsStr && a.period_end === weekEndStr);
      const regularHours = adj?.regular_hours_override ?? rawRegular;
      const overtimeHours = adj?.overtime_hours_override ?? rawOvertime;
      const totalHours = regularHours + overtimeHours;
      const hasGrossOverride = adj?.gross_pay_override !== null && adj?.gross_pay_override !== undefined;

      if (totalHours === 0 && !adj) return; // skip empty rows with no adjustment record

      const rate = Number(tech.hourly_rate ?? 0);
      // A direct gross-pay override (historical backfill where hours/rate at the time are unknown) wins.
      const gross = hasGrossOverride ? Number(adj.gross_pay_override) : (regularHours * rate) + (overtimeHours * rate * 1.5);
      const retention = gross * 0.10;
      const net = gross - retention;

      rows.push({
        id: `${tech.id}-${wsStr}`,
        techId: tech.id,
        techName: tech.name,
        weekStart: wsStr,
        weekEnd: weekEndStr,
        payDate: fridayDate.toISOString().slice(0, 10),
        monthLabel: `${months[fridayDate.getMonth()]} ${fridayDate.getFullYear()}`,
        totalHours,
        gross,
        retention,
        net,
        paid: adj?.paid ?? false,
        byDay,
      });
    });
  });

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">Historial de Payroll</div>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>Todos los pagos por técnico</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/accounting/payroll" className="btn btn-ghost">← Resumen</Link>
          </div>
        </div>

        <HistorialClient rows={rows} technicians={techs} />
      </main>
    </div>
  );
}
