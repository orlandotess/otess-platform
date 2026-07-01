export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer as supabase } from "../../lib/supabase";
import Sidebar from "../Sidebar";
import CatalogoClient from "./CatalogoClient";

export default async function CatalogoPage() {
  const { data: items } = await supabase.from("catalog_items").select("*").order("item_code");

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Labor & Productos</div>
        </div>
        <CatalogoClient items={items ?? []} />
      </main>
    </div>
  );
}
