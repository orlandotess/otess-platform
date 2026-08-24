export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getTranslations } from "next-intl/server";
import { supabaseServer as supabase } from "../../lib/supabase";
import Sidebar from "../Sidebar";
import CatalogoClient from "./CatalogoClient";

export default async function CatalogoPage() {
  const t = await getTranslations("catalogo.page");
  const [{ data: items }, { data: locations }, { data: locationStock }, { data: locationReels }] = await Promise.all([
    // Lo más reciente primero. Ordenar por item_code mandaba los ítems nuevos
    // al final de la lista: los códigos de producto empiezan por dígito ("0E-…")
    // y los nuevos por letra, así que lo recién añadido caía fuera de la vista
    // y parecía no haberse guardado.
    supabase.from("catalog_items").select("*").order("created_at", { ascending: false }),
    supabase.from("locations").select("id, parent_id, name, type, is_active").eq("is_active", true).order("name"),
    supabase.from("location_stock").select("location_id, catalog_item_id, quantity"),
    supabase.from("location_stock_reels").select("*").order("created_at", { ascending: false }),
  ]);

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">{t("title")}</div>
        </div>
        <CatalogoClient items={items ?? []} locations={locations ?? []} locationStock={locationStock ?? []} locationReels={locationReels ?? []} />
      </main>
    </div>
  );
}
