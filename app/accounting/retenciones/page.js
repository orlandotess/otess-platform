
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer as supabase } from "../../../lib/supabase";
import Sidebar from "../../Sidebar";
import Link from "next/link";
import RetencionesClient from "./RetencionesClient";
import RetencionesByClientClient from "./RetencionesByClientClient";
import { computeExemptionStatus } from "../../../lib/retenciones";
import { getTranslations, getLocale } from "next-intl/server";

// Anchored to Puerto Rico's fixed UTC-4 offset via UTC methods (matches
// admin/timesheet, accounting/payroll, and accounting/facturas) so the
// default week shown doesn't roll over up to 4 hours early relative to PR
// time depending on the server's own timezone. weekStart/weekEnd are then
// real UTC instants anchored to PR-calendar-day midnight, so fmtDate below
// must read them back via UTC too.
function getWeekRange(offset = 0) {
  const now = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const day = now.getUTCDay();
  const diffToMon = (day + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - diffToMon + (offset * 7));
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

const nowPR = () => new Date(Date.now() - 4 * 60 * 60 * 1000);

export default async function RetencionesPage(props) {
  const searchParams = await props.searchParams;
  const t = await getTranslations("accounting.retenciones");
  const locale = await getLocale();
  const tab = searchParams?.tab ?? "cliente";
  const view = searchParams?.view ?? "year";
  const year = parseInt(searchParams?.year ?? nowPR().getUTCFullYear());
  const month = searchParams?.month !== undefined && searchParams.month !== "" ? parseInt(searchParams.month) : null;
  const weekOffset = parseInt(searchParams?.week ?? "0");

  let dateStart, dateEnd, periodLabel;
  const months = [
    t("months.jan"), t("months.feb"), t("months.mar"), t("months.apr"), t("months.may"), t("months.jun"),
    t("months.jul"), t("months.aug"), t("months.sep"), t("months.oct"), t("months.nov"), t("months.dec"),
  ];
  const currentYear = nowPR().getUTCFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];
  const dateLocale = locale === "en" ? "en-US" : "es-PR";

  if (view === "week") {
    const { weekStart, weekEnd } = getWeekRange(weekOffset);
    dateStart = weekStart.toISOString().slice(0, 10);
    dateEnd = weekEnd.toISOString().slice(0, 10);
    const fmtDate = d => d.toLocaleDateString(dateLocale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    periodLabel = `${fmtDate(weekStart)} — ${fmtDate(weekEnd)}`;
  } else if (view === "month" && month !== null) {
    dateStart = new Date(year, month, 1).toISOString().slice(0, 10);
    dateEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);
    periodLabel = `${months[month]} ${year}`;
  } else {
    dateStart = `${year}-01-01`;
    dateEnd = `${year}-12-31`;
    periodLabel = t("yearLabel", { year });
  }

  const [{ data: retenciones }, { data: clients }, { data: allTimeRetenciones }] = await Promise.all([
    supabase.from("retenciones")
      .select("*, clients(name)")
      .gte("fecha", dateStart)
      .lte("fecha", dateEnd)
      .order("fecha", { ascending: false }),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("retenciones").select("client_id, fecha, monto_facturado, monto_exento, retencion_aplicada, retencion_calculada, created_at, invoices(invoice_number), clients(name)"),
  ]);

  const rets = retenciones ?? [];
  const thisYear = String(new Date().getFullYear());

  // All-time per-client totals for the "Por cliente" tab (landing view),
  // plus this year's $500 exemption status so staff can see at a glance
  // when retention starts for each client.
  const byClientAllTime = {};
  (allTimeRetenciones ?? []).forEach(r => {
    if (!r.client_id) return;
    if (!byClientAllTime[r.client_id]) {
      byClientAllTime[r.client_id] = { id: r.client_id, name: r.clients?.name ?? t("noClient"), totalFacturado: 0, totalRetenido: 0, totalCalculado: 0, count: 0, thisYearRecords: [] };
    }
    byClientAllTime[r.client_id].totalFacturado += Number(r.monto_facturado ?? 0);
    byClientAllTime[r.client_id].totalRetenido += Number(r.retencion_aplicada ?? 0);
    byClientAllTime[r.client_id].totalCalculado += Number(r.retencion_calculada ?? 0);
    byClientAllTime[r.client_id].count++;
    if (r.fecha?.slice(0, 4) === thisYear) byClientAllTime[r.client_id].thisYearRecords.push(r);
  });
  const clientTotals = Object.values(byClientAllTime).map(c => {
    const { thisYearRecords, ...rest } = c;
    const status = computeExemptionStatus(thisYearRecords);
    return {
      ...rest,
      exemption: {
        usedExemption: status.usedExemption,
        remainingExemption: status.remainingExemption,
        exhausted: status.exhausted,
        exhaustedInvoice: status.exhaustedAt?.invoices?.invoice_number ?? null,
        exhaustedDate: status.exhaustedAt?.fecha ?? null,
      },
    };
  }).sort((a, b) => b.totalRetenido - a.totalRetenido);

  const byClient = {};
  rets.forEach(r => {
    const key = r.client_id ?? "sin-cliente";
    const name = r.clients?.name ?? t("noClient");
    if (!byClient[key]) byClient[key] = { name, totalFacturado: 0, totalRetenido: 0, totalCalculado: 0, count: 0 };
    byClient[key].totalFacturado += Number(r.monto_facturado ?? 0);
    byClient[key].totalRetenido += Number(r.retencion_aplicada ?? 0);
    byClient[key].totalCalculado += Number(r.retencion_calculada ?? 0);
    byClient[key].count++;
  });

  const totalFacturado = rets.reduce((a, r) => a + Number(r.monto_facturado ?? 0), 0);
  const totalRetenido = rets.reduce((a, r) => a + Number(r.retencion_aplicada ?? 0), 0);
  const totalCalculado = rets.reduce((a, r) => a + Number(r.retencion_calculada ?? 0), 0);
  const totalDiferencia = totalCalculado - totalRetenido;

  const { weekStart, weekEnd } = getWeekRange(weekOffset);

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">{t("pageTitle")}</div>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>{t("subtitle", { period: periodLabel })}</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/accounting" className="btn btn-ghost">← {t("backToDashboard")}</Link>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          <Link href="/accounting/retenciones?tab=cliente" className={`btn ${tab === "cliente" ? "btn-primary" : "btn-ghost"}`}>{t("tabs.byClient")}</Link>
          <Link href={`/accounting/retenciones?tab=periodo&view=${view}&year=${year}&month=${month ?? ""}`} className={`btn ${tab === "periodo" ? "btn-primary" : "btn-ghost"}`}>{t("tabs.byPeriod")}</Link>
        </div>

        {tab === "cliente" && (
          <RetencionesByClientClient clientTotals={clientTotals} exemptionYear={thisYear} />
        )}

        {tab === "periodo" && (
        <>
        {/* Filters */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("filters.view")}</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[["week", t("filters.weekly")], ["month", t("filters.monthly")], ["year", t("filters.yearly")]].map(([v, l]) => (
                  <Link key={v} href={`/accounting/retenciones?view=${v}&year=${year}&month=${month ?? ""}`}
                    className={`btn ${v === view ? "btn-primary" : "btn-ghost"}`} style={{ padding: "6px 14px", fontSize: 13 }}>
                    {l}
                  </Link>
                ))}
              </div>
            </div>

            {view === "week" && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("filters.week")}</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <Link href={`/accounting/retenciones?view=week&week=${weekOffset - 1}`} className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}>← {t("filters.previous")}</Link>
                  {weekOffset !== 0 && <Link href="/accounting/retenciones?view=week" className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}>{t("filters.current")}</Link>}
                  {weekOffset < 0 && <Link href={`/accounting/retenciones?view=week&week=${weekOffset + 1}`} className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}>{t("filters.next")} →</Link>}
                </div>
              </div>
            )}

            {view !== "week" && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("filters.year")}</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {years.map(y => (
                    <Link key={y} href={`/accounting/retenciones?view=${view}&year=${y}&month=${month ?? ""}`}
                      className={`btn ${y === year ? "btn-primary" : "btn-ghost"}`} style={{ padding: "6px 14px", fontSize: 13 }}>
                      {y}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {view === "month" && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("filters.month")}</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Link href={`/accounting/retenciones?view=year&year=${year}`} className="btn btn-ghost" style={{ padding: "6px 14px", fontSize: 13 }}>
                    {t("filters.wholeYear")}
                  </Link>
                  {months.map((m, i) => (
                    <Link key={i} href={`/accounting/retenciones?view=month&year=${year}&month=${i}`}
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
            <div className="stat-label">{t("stats.totalInvoiced")}</div>
            <div className="stat-value">${Number(totalFacturado).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t("stats.calculatedRetention")}</div>
            <div className="stat-value" style={{ color: "var(--navy)" }}>${Number(totalCalculado).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t("stats.appliedRetention")}</div>
            <div className="stat-value" style={{ color: "var(--amber)" }}>${Number(totalRetenido).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t("stats.difference")}</div>
            <div className="stat-value" style={{ color: totalDiferencia > 0.01 ? "var(--warn)" : "var(--ok)" }}>
              ${Number(totalDiferencia).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
          </div>
        </div>

        {/* Per client summary */}
        {Object.keys(byClient).length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: "var(--navy)", marginBottom: 14 }}>{t("clientSummary.title", { period: periodLabel })}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("clientSummary.columns.client")}</th>
                    <th style={{ textAlign: "right" }}>{t("clientSummary.columns.transactions")}</th>
                    <th style={{ textAlign: "right" }}>{t("clientSummary.columns.totalInvoiced")}</th>
                    <th style={{ textAlign: "right" }}>{t("clientSummary.columns.calculatedRetention")}</th>
                    <th style={{ textAlign: "right" }}>{t("clientSummary.columns.appliedRetention")}</th>
                    <th style={{ textAlign: "right" }}>{t("clientSummary.columns.difference")}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(byClient).map((c, i) => {
                    const diff = c.totalCalculado - c.totalRetenido;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td style={{ textAlign: "right", color: "var(--muted)" }}>{c.count}</td>
                        <td style={{ textAlign: "right" }}>${c.totalFacturado.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td style={{ textAlign: "right" }}>${c.totalCalculado.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td style={{ textAlign: "right", color: "var(--amber)" }}>${c.totalRetenido.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: diff > 0.01 ? "var(--warn)" : "var(--ok)" }}>
                          {diff > 0.01 ? "⚠️ " : "✓ "}${diff.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <RetencionesClient retenciones={rets} clients={clients ?? []} year={year} />
        </>
        )}
      </main>
    </div>
  );
}
