import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  const { userId, password } = await request.json();

  if (!userId || !password) {
    return Response.json({ error: 'userId y contraseña son requeridos' }, { status: 400 });
  }

  if (password.length < 6) {
    return Response.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
