import { supabaseServer as supabaseAdmin } from "../../../lib/supabase";
import { getCurrentRole } from "../../../lib/supabase-server";

export async function POST(req) {
  const currentRole = await getCurrentRole();
  if (!["admin", "secretaria"].includes(currentRole)) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  const { userId } = await req.json();
  if (!userId) return Response.json({ error: "userId requerido" }, { status: 400 });

  // Delete from profiles first
  await supabaseAdmin.from("profiles").delete().eq("id", userId);

  // Delete from auth
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
