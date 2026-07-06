export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer as supabase } from "../../../lib/supabase";
import Sidebar from "../../Sidebar";
import Link from "next/link";
import GastosClient from "./GastosClient";

const CATEGORY_LABELS = {
  materiales: "Materiales",
  gasolina: "Gasolina",
  herramientas: "Herramientas",
  subcontratista: "Subcontratista",
  oficina: "Oficina",
  otro: "Otro",
};

function getWeekRange(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = (day + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - diffToMon + (offset * 7));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

export default async function GastosPage({ searchParams }) {
  const view = searchParams?.view ?? "month";
  const year = parseInt(searchParams?.year ?? new Date().getFullYear());
  const month = searchParams?.month !== undefined && searchParams.month !== "" ? parseInt(searchParams.month) : new Date().getMonth();
  const weekOffset = parseInt(searchParams?.week ?? "0");

  let dateStart, dateEnd, periodLabel;
  const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  if (view === "week") {
    const { weekStart, weekEnd } = getWeekRange(weekOffset);
    dateStart = weekStart.toISOString().slice(0, 10);
    dateEnd = weekEnd.toISOString().slice(0, 10);
    const fmtDate = d => d.toLocaleDateString("es-PR", { weekday: "short", month: "short", day: "numeric" });
    periodLabel = `${fmtDate(weekStart)} — ${fmtDate(weekEnd)}`;
  } else if (view === "month") {
    dateStart = new Date(year, month, 1).toISOString().slice(0, 10);
    dateEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);
    periodLabel = `${months[month]} ${year}`;
  } else {
    dateStart = `${year}-01-01`;
    dateEnd = `${year}-12-31`;
    periodLabel = `Año ${year}`;
  }

  const [{ data: expenses }, { data: jobs }] = await Promise.all([
    supabase.from("expenses")
      .select("*, jobs(title, job_number)")
      .gte("expense_date", dateStart)
      .lte("expense_date", dateEnd)
      .order("expense_date", { ascending: false }),
    supabase.from("jobs").select("id, title, job_number").order("created_at", { ascending: false }).limit(200),
  ]);

  const rows = expenses ?? [];
  const total = rows.reduce((a, e) => a + Number(e.amount ?? 0), 0);
  const totalGeneral = rows.filter(e => !e.job_id).reduce((a, e) => a + Number(e.amount ?? 0), 0);
  const totalPorTrabajo = rows.filter(e => e.job_id).reduce((a, e) => a + Number(e.amount ?? 0), 0);

  const byCategory = {};
  rows.forEach(e => {
    const key = e.category ?? "otro";
    byCategory[key] = (byCategory[key] ?? 0) + Number(e.amount ?? 0);
  });

  const fmt = n => `$${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const { weekStart, weekEnd } = getWeekRange(weekOffset);

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">Gastos</div>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>Materiales, gasolina, herramientas y otros — {periodLabel}</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/accounting" className="btn btn-ghost">← Dashboard</Link>
          </div>
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Vista</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[["week", "Semanal"], ["month", "Mensual"], ["year", "Anual"]].map(([v, l]) => (
                  <Link key={v} href={`/accounting/gastos?view=${v}&year=${year}&month=${month ?? ""}`}
                    className={`btn ${v === view ? "btn-primary" : "btn-ghost"}`} style={{ padding: "6px 14px", fontSize: 13 }}>
                    {l}
                  </Link>
                ))}
              </div>
            </div>

            {view === "week" && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Semana</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <Link href={`/accounting/gastos?view=week&week=${weekOffset - 1}`} className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}>← Anterior</Link>
                  {weekOffset !== 0 && <Link href="/accounting/gastos?view=week" className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}>Actual</Link>}
                  {weekOffset < 0 && <Link href={`/accounting/gastos?view=week&week=${weekOffset + 1}`} className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}>Siguiente →</Link>}
                </div>
              </div>
            )}

            {view !== "week" && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Año</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {years.map(y => (
                    <Link key={y} href={`/accounting/gastos?view=${view}&year=${y}&month=${month ?? ""}`}
                      className={`btn ${y === year ? "btn-primary" : "btn-ghost"}`} style={{ padding: "6px 14px", fontSize: 13 }}>
                      {y}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {view === "month" && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Mes</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Link href={`/accounting/gastos?view=year&year=${year}`} className="btn btn-ghost" style={{ padding: "6px 14px", fontSize: 13 }}>
                    Todo el año
                  </Link>
                  {months.map((m, i) => (
                    <Link key={i} href={`/accounting/gastos?view=month&year=${year}&month=${i}`}
                      className={`btn ${month === i ? "btn-primary" : "btn-ghost"}`} style={{ padding: "6px 10px", fontSize: 12 }}>
                      {m.slice(0, 3)}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Summary stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">Total gastos</div>
            <div className="stat-value">{fmt(total)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Gastos generales</div>
            <div className="stat-value" style={{ color: "var(--navy)" }}>{fmt(totalGeneral)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Gastos por trabajo</div>
            <div className="stat-value" style={{ color: "var(--amber)" }}>{fmt(totalPorTrabajo)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Transacciones</div>
            <div className="stat-value">{rows.length}</div>
          </div>
        </div>

        {/* By category */}
        {rows.length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: "var(--navy)", marginBottom: 14 }}>Por categoría — {periodLabel}</p>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Object.keys(byCategory).length}, 1fr)`, gap: 12 }}>
              {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                <div key={cat}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{CATEGORY_LABELS[cat] ?? cat}</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{fmt(amt)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <GastosClient expenses={rows} jobs={jobs ?? []} periodLabel={periodLabel} categoryLabels={CATEGORY_LABELS} />
      </main>
    </div>
  );
}
