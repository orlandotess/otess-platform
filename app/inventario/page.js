export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer as supabase } from "../../lib/supabase";
import Sidebar from "../Sidebar";
import InventarioClient from "./InventarioClient";
import { getTranslations } from "next-intl/server";

export default async function InventarioPage() {
  const t = await getTranslations("inventario.page");
  const [{ data: locations }, { data: locationStock }, { data: products }, { data: locationStockUnits }] = await Promise.all([
    supabase.from("locations").select("*").order("name"),
    supabase.from("location_stock").select("*, catalog_items(item_code, name, description)"),
    supabase.from("catalog_items").select("id, item_code, name, description, stock_quantity, default_location_id").eq("type", "product").order("item_code"),
    supabase.from("location_stock_units").select("*, catalog_items(item_code, name, description)").order("created_at", { ascending: false }),
  ]);

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">{t("title")}</div>
        </div>
        <InventarioClient
          locations={locations ?? []}
          locationStock={locationStock ?? []}
          products={products ?? []}
          locationStockUnits={locationStockUnits ?? []}
        />
      </main>
    </div>
  );
}
