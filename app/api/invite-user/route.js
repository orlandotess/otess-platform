import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  const { email, name, role, password } = await request.json();

  if (!email || !name || !role || !password) {
    return Response.json({ error: 'Email, nombre, rol y contraseña son requeridos' }, { status: 400 });
  }

  if (password.length < 6) {
    return Response.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
  }

  // Create user directly with the password set by the admin (no invite email sent)
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Create profile
  await supabaseAdmin.from('profiles').insert([{
    id: data.user.id,
    email,
    name,
    role,
  }]);

  // If role is tecnico, also create a technicians record so they can be assigned to jobs
  if (role === 'tecnico') {
    const username = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
    const { data: existing } = await supabaseAdmin.from('technicians').select('id').ilike('name', name).maybeSingle();
    if (!existing) {
      await supabaseAdmin.from('technicians').insert([{ name, username }]);
    }
  }

  return Response.json({ success: true });
}
