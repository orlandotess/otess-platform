import { supabaseServer as supabaseAdmin } from '../../../lib/supabase';
import { getCurrentRole } from '../../../lib/supabase-server';
import { normalizeName } from '../../../lib/normalizeName';

export async function POST(request) {
  const currentRole = await getCurrentRole();
  if (!['admin', 'secretaria'].includes(currentRole)) {
    return Response.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { email, name: rawName, role, password } = await request.json();
  const name = rawName?.trim();

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
  const { error: profileError } = await supabaseAdmin.from('profiles').insert([{
    id: data.user.id,
    email,
    name,
    role,
  }]);
  if (profileError) {
    return Response.json({ error: `Usuario de acceso creado, pero fall\u00f3 el perfil: ${profileError.message}. No aparecer\u00e1 en la lista de usuarios hasta corregirlo.` }, { status: 500 });
  }

  // If role is tecnico, also create a technicians record so they can be assigned to jobs
  let warning = null;
  if (role === 'tecnico') {
    const { data: allTechs, error: lookupError } = await supabaseAdmin.from('technicians').select('id, name');
    const existing = (allTechs ?? []).find(t => normalizeName(t.name) === normalizeName(name));
    if (lookupError) {
      warning = `Usuario creado, pero no se pudo verificar si ya exist\u00eda como t\u00e9cnico: ${lookupError.message}`;
    } else if (!existing) {
      const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
      const username = slug || data.user.id.slice(0, 8);
      const { error: techError } = await supabaseAdmin.from('technicians').insert([{ name, username, profile_id: data.user.id }]);
      if (techError) {
        warning = `Usuario creado, pero no se pudo crear el registro de t\u00e9cnico (no podr\u00e1 asignarse a trabajos ni aparecer en payroll hasta corregirlo): ${techError.message}`;
      }
    }
  }

  return Response.json({ success: true, warning });
}
