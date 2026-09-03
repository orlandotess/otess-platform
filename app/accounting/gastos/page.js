export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer as supabase } from "../../../lib/supabase";
import Sidebar from "../../Sidebar";
import Link from "next/link";
import GastosClient from "./GastosClient";
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

const IMAGE_PATH = /\.(jpe?g|png|gif|webp|heic|heif)$/i;
// El bucket Job-photos es privado: sin URL firmada el <img> del recibo queda
// roto. Se firma también una versión reducida para la tabla, que solo enseña
// una miniatura de 40px — bajar el recibo entero por fila era traer megas de
// más para nada.
const RECEIPT_THUMB_WIDTH = 200;

async function signReceipt(rawPath, thumbWidth = null) {
  if (!rawPath) return null;
  try {
    let filePath = rawPath;
    if (rawPath.startsWith("http")) {
      filePath = new URL(rawPath).pathname.split("/Job-photos/")[1];
      if (!filePath) return null;
    }
    const opts = thumbWidth && IMAGE_PATH.test(filePath)
      ? { transform: { width: thumbWidth, height: thumbWidth, resize: "contain" } }
      : undefined;
    const { data } = await supabase.storage.from("Job-photos").createSignedUrl(filePath, 3600, opts);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export default async function GastosPage(props) {
  const searchParams = await props.searchParams;
  const t = await getTranslations("accounting.gastos");
  const locale = await getLocale();
  const dateLocale = locale === "en" ? "en-US" : "es-PR";

  const CATEGORY_LABELS = {
    materiales: t("expenseCategories.materiales"),
    gasolina: t("expenseCategories.gasolina"),
    herramientas: t("expenseCategories.herramientas"),
    subcontratista: t("expenseCategories.subcontratista"),
    oficina: t("expenseCategories.oficina"),
    parking: t("expenseCategories.parking"),
    equipos: t("expenseCategories.equipos"),
    meals: t("expenseCategories.meals"),
    otro: t("expenseCategories.otro"),
  };

  const view = searchParams?.view ?? "month";
  const year = parseInt(searchParams?.year ?? nowPR().getUTCFullYear());
  const month = searchParams?.month !== undefined && searchParams.month !== "" ? parseInt(searchParams.month) : nowPR().getUTCMonth();
  const weekOffset = parseInt(searchParams?.week ?? "0");

  let dateStart, dateEnd, periodLabel;
  const months = Array.from({ length: 12 }, (_, i) => t(`months.${i}`));
  const currentYear = nowPR().getUTCFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  if (view === "week") {
    const { weekStart, weekEnd } = getWeekRange(weekOffset);
    dateStart = weekStart.toISOString().slice(0, 10);
    dateEnd = weekEnd.toISOString().slice(0, 10);
    const fmtDate = d => d.toLocaleDateString(dateLocale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    periodLabel = `${fmtDate(weekStart)} — ${fmtDate(weekEnd)}`;
  } else if (view === "month") {
    dateStart = new Date(year, month, 1).toISOString().slice(0, 10);
    dateEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);
    periodLabel = `${months[month]} ${year}`;
  } else {
    dateStart = `${year}-01-01`;
    dateEnd = `${year}-12-31`;
    periodLabel = t("periodYear", { year });
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

  const rowsWithReceipts = await Promise.all(rows.map(async r => {
    if (!r.receipt_url) return r;
    const full = await signReceipt(r.receipt_url);
    if (!full) return r;
    return { ...r, receipt_signed_url: full, receipt_thumb_url: await signReceipt(r.receipt_url, RECEIPT_THUMB_WIDTH) ?? full };
  }));

  const fmt = n => `$${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const { weekStart, weekEnd } = getWeekRange(weekOffset);

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">{t("title")}</div>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>{t("subtitle", { period: periodLabel })}</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/accounting/gastos/recurrentes" className="btn btn-ghost">{t("recurringLink")}</Link>
            <Link href="/accounting" className="btn btn-ghost">{t("dashboardLink")}</Link>
          </div>
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("viewLabel")}</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[["week", t("view.week")], ["month", t("view.month")], ["year", t("view.year")]].map(([v, l]) => (
                  <Link key={v} href={`/accounting/gastos?view=${v}&year=${year}&month=${month ?? ""}`}
                    className={`btn ${v === view ? "btn-primary" : "btn-ghost"}`} style={{ padding: "6px 14px", fontSize: 13 }}>
                    {l}
                  </Link>
                ))}
              </div>
            </div>

            {view === "week" && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("weekLabel")}</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <Link href={`/accounting/gastos?view=week&week=${weekOffset - 1}`} className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}>{t("previousWeek")}</Link>
                  {weekOffset !== 0 && <Link href="/accounting/gastos?view=week" className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}>{t("currentWeek")}</Link>}
                  {weekOffset < 0 && <Link href={`/accounting/gastos?view=week&week=${weekOffset + 1}`} className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}>{t("nextWeek")}</Link>}
                </div>
              </div>
            )}

            {view !== "week" && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("yearLabel")}</label>
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
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("monthLabel")}</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Link href={`/accounting/gastos?view=year&year=${year}`} className="btn btn-ghost" style={{ padding: "6px 14px", fontSize: 13 }}>
                    {t("fullYear")}
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
            <div className="stat-label">{t("stats.total")}</div>
            <div className="stat-value">{fmt(total)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t("stats.general")}</div>
            <div className="stat-value" style={{ color: "var(--navy)" }}>{fmt(totalGeneral)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t("stats.byJob")}</div>
            <div className="stat-value" style={{ color: "var(--amber)" }}>{fmt(totalPorTrabajo)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t("stats.transactions")}</div>
            <div className="stat-value">{rows.length}</div>
          </div>
        </div>

        {/* By category */}
        {rows.length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: "var(--navy)", marginBottom: 14 }}>{t("byCategoryTitle", { period: periodLabel })}</p>
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

        {/* La tabla vive en estado del cliente (se edita y se borra en sitio), y
            useState solo siembra ese estado al montar: al cambiar de periodo con
            los enlaces de arriba, Next reusa la misma instancia y la lista se
            quedaba en el periodo anterior mientras los totales sí cambiaban. La
            key fuerza un montaje nuevo por periodo. */}
        <GastosClient key={`${view}-${dateStart}-${dateEnd}`} expenses={rowsWithReceipts} jobs={jobs ?? []} periodLabel={periodLabel} categoryLabels={CATEGORY_LABELS} />
      </main>
    </div>
  );
}
