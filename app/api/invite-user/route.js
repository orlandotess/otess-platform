import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  const { email, name, role } = await request.json();

  if (!email || !name || !role) {
    return Response.json({ error: 'Email, nombre y rol son requeridos' }, { status: 400 });
  }

  // Invite user via Supabase Admin
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { name, role },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Create profile
  await supabaseAdmin.from('profiles').insert([{
    id: data.user.id,
    email,
    name,
    role,
  }]);

  return Response.json({ success: true });
}
