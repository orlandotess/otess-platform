"use client";
import { useState, Fragment } from "react";
import { supabase } from "../../../../lib/supabase";

const DAY_LABELS = ["Mié", "Jue", "Vie", "Sáb", "Dom", "Lun", "Mar"];

export default function HistorialClient({ rows: initialRows, technicians }) {
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [techFilter, setTechFilter] = useState("all");
  const [sortDir, setSortDir] = useState("asc");
  const [saving, setSaving] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  const fmt = n => `$${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = d => {
    const [y, m, day] = d.split("-");
    return new Date(y, m - 1, day).toLocaleDateString("es-PR", { month: "long", day: "numeric", year: "numeric" });
  };

  function weekDayHours(row) {
    const [y, m, d] = row.weekStart.split("-").map(Number);
    const start = new Date(y, m - 1, d);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = day.toISOString().slice(0, 10);
      return { label: DAY_LABELS[i], date: day.getDate(), hours: row.byDay?.[key] ?? 0 };
    });
  }

  const sortedRows = [...rows].sort((a, b) => sortDir === "desc" ? new Date(b.payDate) - new Date(a.payDate) : new Date(a.payDate) - new Date(b.payDate));

  const filtered = sortedRows.filter(r => {
    const matchesSearch = search.trim() === "" ||
      r.techName.toLowerCase().includes(search.toLowerCase()) ||
      r.payDate.includes(search) ||
      fmtDate(r.payDate).toLowerCase().includes(search.toLowerCase());
    const matchesTech = techFilter === "all" || r.techId === techFilter;
    return matchesSearch && matchesTech;
  });

  const totGross = filtered.reduce((a, r) => a + r.gross, 0);
  const totRet = filtered.reduce((a, r) => a + r.retention, 0);
  const totNet = filtered.reduce((a, r) => a + r.net, 0);
  const totHours = filtered.reduce((a, r) => a + r.totalHours, 0);

  async function deletePayrollRow(row) {
    if (!confirm(`¿Eliminar el registro de payroll de ${row.techName} — ${fmtDate(row.payDate)}?`)) return;
    setSaving(s => ({ ...s, [row.id]: true }));
    await supabase.from("payroll_adjustments").delete()
      .eq("technician_id", row.techId)
      .eq("period_start", row.weekStart)
      .eq("period_end", row.weekEnd);
    await supabase.from("time_entries").delete()
      .eq("technician_id", row.techId)
      .gte("clocked_in_at", row.weekStart)
      .lte("clocked_in_at", row.weekEnd + "T23:59:59");
    setRows(prev => prev.filter(r => r.id !== row.id));
    setSaving(s => ({ ...s, [row.id]: false }));
  }

  async function togglePaid(row) {
    setSaving(s => ({ ...s, [row.id]: true }));
    await supabase.from("payroll_adjustments").upsert({
      technician_id: row.techId,
      period_start: row.weekStart,
      period_end: row.weekEnd,
      paid: !row.paid,
    }, { onConflict: "technician_id,period_start,period_end" });
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, paid: !r.paid } : r));
    setSaving(s => ({ ...s, [row.id]: false }));
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar técnico o fecha..."
              style={{ width: "100%", padding: "10px 14px 10px 36px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14 }} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setTechFilter("all")} className={`btn ${techFilter === "all" ? "btn-primary" : "btn-ghost"}`} style={{ fontSize: 13, padding: "8px 14px" }}>Todos</button>
            {technicians.map(t => (
              <button key={t.id} onClick={() => setTechFilter(t.id)} className={`btn ${techFilter === t.id ? "btn-primary" : "btn-ghost"}`} style={{ fontSize: 13, padding: "8px 14px" }}>{t.name}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setSortDir("asc")} className={`btn ${sortDir === "asc" ? "btn-primary" : "btn-ghost"}`} style={{ fontSize: 13, padding: "8px 14px" }}>↑ Ascendente</button>
            <button onClick={() => setSortDir("desc")} className={`btn ${sortDir === "desc" ? "btn-primary" : "btn-ghost"}`} style={{ fontSize: 13, padding: "8px 14px" }}>↓ Descendente</button>
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-label">Horas totales</div><div className="stat-value">{totHours.toFixed(1)}h</div></div>
        <div className="stat-card"><div className="stat-label">Gross total</div><div className="stat-value" style={{ color: "var(--navy)" }}>{fmt(totGross)}</div></div>
        <div className="stat-card"><div className="stat-label">Retención total</div><div className="stat-value" style={{ color: "var(--warn)" }}>{fmt(totRet)}</div></div>
        <div className="stat-card"><div className="stat-label">Net total</div><div className="stat-value" style={{ color: "var(--ok)" }}>{fmt(totNet)}</div></div>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty"><p>No hay registros de payroll.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="table-dense">
              <thead>
                <tr>
                  <th></th>
                  <th>Técnico</th>
                  <th>Fecha de pago</th>
                  <th style={{ textAlign: "right" }}>Horas</th>
                  <th style={{ textAlign: "right" }}>Bruto</th>
                  <th style={{ textAlign: "right" }}>10%</th>
                  <th style={{ textAlign: "right" }}>Pagado</th>
                  <th>Mes</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <Fragment key={r.id}>
                  <tr style={{ opacity: r.paid ? 1 : 0.85 }}>
                    <td>
                      <input type="checkbox" checked={r.paid} disabled={saving[r.id]} onChange={() => togglePaid(r)} style={{ width: 18, height: 18, cursor: "pointer" }} />
                    </td>
                    <td style={{ fontWeight: 700 }}>{r.techName}</td>
                    <td style={{ color: "var(--muted)", fontSize: 13 }}>{fmtDate(r.payDate)}</td>
                    <td style={{ textAlign: "right" }}>{r.totalHours.toFixed(2)}</td>
                    <td style={{ textAlign: "right" }}>{fmt(r.gross)}</td>
                    <td style={{ textAlign: "right", color: "var(--warn)" }}>{fmt(r.retention)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--ok)" }}>{fmt(r.net)}</td>
                    <td style={{ color: "var(--amber)", fontWeight: 600, fontSize: 13 }}>{r.monthLabel}</td>
                    <td>
                      <button onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                        className={`btn ${expandedId === r.id ? "btn-primary" : "btn-ghost"}`} style={{ fontSize: 12, padding: "6px 12px" }}>
                        {expandedId === r.id ? "Ocultar" : "Ver"}
                      </button>
                    </td>
                    <td>
                      <button onClick={() => deletePayrollRow(r)} disabled={saving[r.id]} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 14 }}>🗑</button>
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr>
                      <td colSpan={10} style={{ background: "var(--surface-2)", padding: "14px 18px" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase" }}>
                          Horas de la semana — {fmtDate(r.weekStart)} al {fmtDate(r.weekEnd)}
                        </div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {weekDayHours(r).map(d => (
                            <div key={d.label + d.date} style={{
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 14px",
                              borderRadius: 10, background: d.hours > 0 ? "var(--surface)" : "transparent", border: "1.5px solid var(--border)", minWidth: 64,
                            }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{d.label} {d.date}</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: d.hours > 0 ? "var(--navy)" : "var(--ink-faint)" }}>
                                {d.hours > 0 ? d.hours.toFixed(1) + "h" : "—"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td colSpan={3} style={{ fontWeight: 700, paddingTop: 12 }}>TOTAL</td>
                  <td style={{ textAlign: "right", fontWeight: 700, paddingTop: 12 }}>{totHours.toFixed(2)}</td>
                  <td style={{ textAlign: "right", fontWeight: 900, color: "var(--navy)", paddingTop: 12 }}>{fmt(totGross)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "var(--warn)", paddingTop: 12 }}>{fmt(totRet)}</td>
                  <td style={{ textAlign: "right", fontWeight: 900, color: "var(--ok)", paddingTop: 12 }}>{fmt(totNet)}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
