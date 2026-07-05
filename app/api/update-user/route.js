import { supabaseServer as supabaseAdmin } from '../../../lib/supabase';
import { getCurrentRole } from '../../../lib/supabase-server';

// Names get compared ignoring case/accents so "Ricardo Diaz" still matches a
// technicians row stored as "Ricardo Díaz" instead of looking unlinked.
const normalizeName = s => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export async function POST(request) {
  const currentRole = await getCurrentRole();
  if (!['admin', 'secretaria'].includes(currentRole)) {
    return Response.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { userId, name: rawName, email } = await request.json();
  const name = rawName?.trim();

  if (!userId || !name || !email) {
    return Response.json({ error: 'userId, nombre y email son requeridos' }, { status: 400 });
  }

  const { data: profile, error: profileLookupError } = await supabaseAdmin
    .from('profiles').select('name, role').eq('id', userId).single();
  if (profileLookupError || !profile) {
    return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }
  const oldName = profile.name;

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
    user_metadata: { name, role: profile.role },
  });
  if (authError) return Response.json({ error: authError.message }, { status: 500 });

  const { error: profileError } = await supabaseAdmin.from('profiles').update({ name, email }).eq('id', userId);
  if (profileError) {
    return Response.json({ error: `Cuenta actualizada, pero falló el perfil: ${profileError.message}` }, { status: 500 });
  }

  // Job assignments/payroll/timesheet all read the technician's name live from
  // the technicians table (matched by name at creation time, no FK to profiles),
  // so a rename here needs to carry over or it'll look like a different person.
  let warning = null;
  if (oldName && normalizeName(oldName) !== normalizeName(name)) {
    const { data: allTechs, error: techLookupError } = await supabaseAdmin.from('technicians').select('id, name');
    if (techLookupError) {
      warning = `Usuario actualizado, pero no se pudo verificar su registro de técnico: ${techLookupError.message}`;
    } else {
      const existingTech = (allTechs ?? []).find(t => normalizeName(t.name) === normalizeName(oldName));
      if (existingTech) {
        const { error: techUpdateError } = await supabaseAdmin
          .from('technicians').update({ name }).eq('id', existingTech.id);
        if (techUpdateError) {
          warning = `Usuario actualizado, pero no se pudo renombrar su registro de técnico (${oldName} → ${name}): ${techUpdateError.message}`;
        }
      }
    }
  }

  return Response.json({ success: true, warning });
}
