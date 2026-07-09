export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer as supabase } from "../../../../lib/supabase";
import Sidebar from "../../../Sidebar";
import RecurrentesGastoClient from "./RecurrentesGastoClient";

const CATEGORY_LABELS = {
  materiales: "Materiales",
  gasolina: "Gasolina",
  herramientas: "Herramientas",
  subcontratista: "Subcontratista",
  oficina: "Oficina",
  parking: "Parking",
  equipos: "Equipos",
  meals: "Meals",
  otro: "Otro",
};

export default async function GastosRecurrentesPage() {
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
            <div className="page-title">Gastos recurrentes</div>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>Póliza de seguros, celular y otros gastos operacionales fijos</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/accounting/gastos" className="btn btn-ghost">← Gastos</Link>
          </div>
        </div>

        <RecurrentesGastoClient recurring={recurring ?? []} categoryLabels={CATEGORY_LABELS} />
      </main>
    </div>
  );
}
