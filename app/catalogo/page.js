export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer as supabase } from "../../lib/supabase";
import Sidebar from "../Sidebar";
import CatalogoClient from "./CatalogoClient";

export default async function CatalogoPage() {
  const [{ data: items }, { data: locations }, { data: locationStock }] = await Promise.all([
    supabase.from("catalog_items").select("*").order("item_code"),
    supabase.from("locations").select("id, parent_id, name, type, is_active").eq("is_active", true).order("name"),
    supabase.from("location_stock").select("location_id, catalog_item_id, quantity"),
  ]);

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Labor & Productos</div>
        </div>
        <CatalogoClient items={items ?? []} locations={locations ?? []} locationStock={locationStock ?? []} />
      </main>
    </div>
  );
}
