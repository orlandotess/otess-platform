"use client";

export default function ExportIVUButton({ monthlyData, year, totals }) {
  function exportCSV() {
    const headers = ["Mes", "IVU Productos", "IVU Labor Final", "IVU Labor B2B", "Estatal (10.5%)", "Municipal (1%)", "Total IVU"];
    const rows = monthlyData.map(m => [
      m.name,
      m.mProd.toFixed(2),
      m.mLaborFinal.toFixed(2),
      m.mLaborB2B.toFixed(2),
      m.estatal.toFixed(2),
      m.municipal.toFixed(2),
      m.total.toFixed(2),
    ]);
    const totalRow = [
      "TOTAL",
      totals.totProducts.toFixed(2),
      totals.totLaborFinal.toFixed(2),
      totals.totB2B.toFixed(2),
      totals.totEstatal.toFixed(2),
      totals.totMunicipal.toFixed(2),
      totals.totIVU.toFixed(2),
    ];

    const csvContent = [headers, ...rows, totalRow]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `IVU_${year}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <button onClick={exportCSV} className="btn btn-ghost" style={{ padding: "6px 14px", fontSize: 13 }}>
      ⬇ Exportar CSV
    </button>
  );
}
