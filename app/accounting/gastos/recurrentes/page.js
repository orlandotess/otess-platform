export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer as supabase } from "../../../../lib/supabase";
import Sidebar from "../../../Sidebar";
import RecurrentesGastoClient from "./RecurrentesGastoClient";
import { getTranslations } from "next-intl/server";

export default async function GastosRecurrentesPage() {
  const t = await getTranslations("accounting.recurringExpenses");

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

  const { data: recurring } = await supabase
    .from("recurring_expenses")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">{t("title")}</div>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>{t("subtitle")}</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/accounting/gastos" className="btn btn-ghost">{t("backLink")}</Link>
          </div>
        </div>

        <RecurrentesGastoClient recurring={recurring ?? []} categoryLabels={CATEGORY_LABELS} />
      </main>
    </div>
  );
}
