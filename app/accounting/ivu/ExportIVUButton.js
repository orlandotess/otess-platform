"use client";
import { useState } from "react";

export default function ExportIVUButton({ monthlyData, year, totals }) {
  const [showModal, setShowModal] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState(monthlyData.map(m => m.idx));

  function toggleMonth(idx) {
    setSelectedMonths(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  }

  function selectAll() {
    setSelectedMonths(monthlyData.map(m => m.idx));
  }

  function selectNone() {
    setSelectedMonths([]);
  }

  function exportCSV() {
    const filtered = monthlyData.filter(m => selectedMonths.includes(m.idx));
    const headers = ["Mes", "IVU Productos", "IVU Labor Final", "IVU Labor B2B", "Estatal (10.5%)", "Municipal (1%)", "Total IVU"];
    const rows = filtered.map(m => [
      m.name,
      m.mProd.toFixed(2),
      m.mLaborFinal.toFixed(2),
      m.mLaborB2B.toFixed(2),
      m.estatal.toFixed(2),
      m.municipal.toFixed(2),
      m.total.toFixed(2),
    ]);

    const sumField = (field) => filtered.reduce((a, m) => a + m[field], 0);
    const totalRow = [
      "TOTAL",
      sumField("mProd").toFixed(2),
      sumField("mLaborFinal").toFixed(2),
      sumField("mLaborB2B").toFixed(2),
      sumField("estatal").toFixed(2),
      sumField("municipal").toFixed(2),
      sumField("total").toFixed(2),
    ];

    const csvContent = [headers, ...rows, totalRow]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const monthLabel = filtered.length === 12 ? "completo" : filtered.map(m => m.name).join("-");
    link.download = `IVU_${year}_${monthLabel}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowModal(false);
  }

  return (
    <>
      <button onClick={() => setShowModal(true)} className="btn btn-ghost" style={{ padding: "6px 14px", fontSize: 13 }}>
        ⬇ Exportar CSV
      </button>

      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 420 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--navy)", marginBottom: 16 }}>Exportar IVU {year}</h2>

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button onClick={selectAll} className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 10px" }}>Todos</button>
              <button onClick={selectNone} className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 10px" }}>Ninguno</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 24 }}>
              {monthlyData.map(m => (
                <label key={m.idx} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                  border: `2px solid ${selectedMonths.includes(m.idx) ? "var(--navy)" : "var(--border)"}`,
                  background: selectedMonths.includes(m.idx) ? "var(--info-tint)" : "var(--surface)", fontSize: 13,
                }}>
                  <input type="checkbox" checked={selectedMonths.includes(m.idx)} onChange={() => toggleMonth(m.idx)} />
                  {m.name}
                </label>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={exportCSV} disabled={selectedMonths.length === 0} className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }}>
                ⬇ Descargar CSV ({selectedMonths.length} {selectedMonths.length === 1 ? "mes" : "meses"})
              </button>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
