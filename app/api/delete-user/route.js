import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  const { userId } = await req.json();
  if (!userId) return Response.json({ error: "userId requerido" }, { status: 400 });

  // Delete from profiles first
  await supabaseAdmin.from("profiles").delete().eq("id", userId);

  // Delete from auth
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
