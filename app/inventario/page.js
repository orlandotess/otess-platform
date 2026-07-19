export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer as supabase } from "../../lib/supabase";
import Sidebar from "../Sidebar";
import InventarioClient from "./InventarioClient";

export default async function InventarioPage() {
  const [{ data: locations }, { data: locationStock }, { data: products }, { data: locationStockUnits }] = await Promise.all([
    supabase.from("locations").select("*").order("name"),
    supabase.from("location_stock").select("*, catalog_items(item_code, description)"),
    supabase.from("catalog_items").select("id, item_code, description, stock_quantity, default_location_id").eq("type", "product").order("item_code"),
    supabase.from("location_stock_units").select("*, catalog_items(item_code, description)").order("created_at", { ascending: false }),
  ]);

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Inventario</div>
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
