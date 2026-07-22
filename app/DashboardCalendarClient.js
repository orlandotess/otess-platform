"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { formatTimePR, formatDatePR } from "../lib/datetimeLocal";
import { prDayKey } from "../lib/hours";

const TECH_COLORS = [
  "#16223d", "#e0972c", "#27ae60", "#2a4cb5", "#e05c2a",
  "#8e44ad", "#16a085", "#c0392b", "#d35400", "#1abc9c",
];

export default function DashboardCalendarClient({ techs, allJobs, year, month, monthName }) {
  const [selectedTech, setSelectedTech] = useState("all");

  const techColors = useMemo(() => {
    const map = {};
    // Hashed by ID rather than array index so a technician keeps the same color
    // even after others are added/removed/reordered in the technicians table.
    techs.forEach((t) => {
      let hash = 0;
      const id = String(t.id);
      for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
      map[t.id] = TECH_COLORS[hash % TECH_COLORS.length];
    });
    return map;
  }, [techs]);

  const filteredJobs = useMemo(() =>
    selectedTech === "all" ? allJobs : allJobs.filter(j => j.technician_id === selectedTech),
    [allJobs, selectedTech]
  );

  // PR calendar day, not the browser's raw UTC slice of "now" — otherwise this rolls over up
  // to 4 hours early relative to PR time depending on the viewer's own timezone.
  const today = prDayKey(new Date());

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevDays - i, current: false, date: null });
  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    cells.push({ day: i, current: true, date: dateStr });
  }
  const remaining = (cells.length <= 35 ? 35 : 42) - cells.length;
  for (let i = 1; i <= remaining; i++) cells.push({ day: i, current: false, date: null });

  const jobsByDate = {};
  filteredJobs.forEach(j => {
    const start = j.scheduled_start?.slice(0, 10);
    const end = (j.scheduled_end ?? j.scheduled_start)?.slice(0, 10);
    if (!start) return;
    let d = new Date(start);
    const endD = new Date(end);
    while (d <= endD) {
      const ds = d.toISOString().slice(0, 10);
      if (!jobsByDate[ds]) jobsByDate[ds] = [];
      jobsByDate[ds].push(j);
      d.setDate(d.getDate() + 1);
    }
  });

  const upcoming = filteredJobs
    .filter(j => j.scheduled_start && prDayKey(j.scheduled_start) >= today && j.status !== "cancelled" && j.status !== "completed")
    .slice(0, 6);

  const fmtTime = iso => formatTimePR(iso, { hour: "2-digit", minute: "2-digit" });
  const fmtDay = iso => formatDatePR(iso, { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)" }}>📅 Calendario — {monthName} {year}</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setSelectedTech("all")}
              className={`btn ${selectedTech === "all" ? "btn-primary" : "btn-ghost"}`}
              style={{ fontSize: 12, padding: "5px 12px" }}>Todos</button>
            {techs.map(t => (
              <button key={t.id} onClick={() => setSelectedTech(selectedTech === t.id ? "all" : t.id)}
                style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, border: "2px solid", cursor: "pointer", fontWeight: 600,
                  borderColor: techColors[t.id], background: selectedTech === t.id ? techColors[t.id] : "transparent",
                  color: selectedTech === t.id ? "#fff" : techColors[t.id] }}>
                {t.name}
              </button>
            ))}
          </div>
          <Link href="/calendario" className="btn btn-ghost" style={{ fontSize: 13, padding: "7px 14px" }}>Ver completo →</Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20 }}>
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
            {["D","L","M","X","J","V","S"].map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--muted)", padding: "4px 0" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {cells.map((cell, idx) => {
              const dayJobs = cell.date ? (jobsByDate[cell.date] ?? []) : [];
              const isToday = cell.date === today;
              const uniqueTechs = [...new Set(dayJobs.map(j => j.technician_id).filter(Boolean))];
              return (
                <Link key={idx} href={cell.date ? `/calendario?view=month&year=${year}&month=${month}` : "#"}
                  style={{ minHeight: 54, height: 54, padding: "4px 6px", borderRadius: 8, textDecoration: "none",
                    background: isToday ? "var(--info-tint)" : "var(--surface)",
                    border: isToday ? "2px solid var(--navy)" : "1px solid var(--border)",
                    opacity: cell.current ? 1 : 0.4, display: "block", boxSizing: "border-box", overflow: "hidden" }}>
                  <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: cell.current ? "var(--text)" : "var(--muted)" }}>{cell.day}</div>
                  {dayJobs.length > 0 && (
                    <div style={{ display: "flex", gap: 2, marginTop: 4, flexWrap: "wrap" }}>
                      {uniqueTechs.slice(0, 4).map(tid => (
                        <div key={tid} style={{ width: 6, height: 6, borderRadius: "50%", background: techColors[tid] ?? "var(--ink-faint)" }} />
                      ))}
                      {dayJobs.length > 4 && <span style={{ fontSize: 9, color: "var(--muted)" }}>+{dayJobs.length - 4}</span>}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
          {techs.length > 0 && (
            <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              {techs.map(t => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: techColors[t.id] }} />
                  {t.name}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 10 }}>Próximos trabajos</div>
          {upcoming.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)", padding: "12px 0" }}>No hay trabajos próximos.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {upcoming.map(j => (
                <Link key={j.id} href={`/trabajos/${j.id}`} style={{ textDecoration: "none", display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: techColors[j.technician_id] ?? "var(--ink-faint)", marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.title}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{j.clients?.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      {fmtDay(j.scheduled_start)} · {fmtTime(j.scheduled_start)} {j.technicians?.name ? `· ${j.technicians.name}` : ""}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
