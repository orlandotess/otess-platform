import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

const supabaseUrl = 'https://zisidorwdhrttmdppnbj.supabase.co';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(request) {
  const { email, password } = await request.json();
  if (!email || !password) {
    return Response.json({ error: 'Email y contraseña son requeridos' }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: profile } = await admin
    .from('profiles')
    .select('id, failed_attempts, locked_until')
    .eq('email', email)
    .single();

  if (profile?.locked_until && new Date(profile.locked_until) > new Date()) {
    const minutesLeft = Math.max(1, Math.ceil((new Date(profile.locked_until) - new Date()) / 60000));
    return Response.json(
      { error: `Cuenta bloqueada temporalmente por demasiados intentos. Intenta de nuevo en ${minutesLeft} minuto(s).` },
      { status: 429 }
    );
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (profile) {
      const attempts = (profile.failed_attempts ?? 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await admin.from('profiles').update({
          failed_attempts: 0,
          locked_until: new Date(Date.now() + LOCK_MINUTES * 60000).toISOString(),
        }).eq('id', profile.id);
        return Response.json(
          { error: `Demasiados intentos fallidos. Cuenta bloqueada por ${LOCK_MINUTES} minutos.` },
          { status: 429 }
        );
      }
      await admin.from('profiles').update({ failed_attempts: attempts }).eq('id', profile.id);
    }
    return Response.json({ error: 'Email o contraseña incorrectos' }, { status: 401 });
  }

  if (profile && (profile.failed_attempts || profile.locked_until)) {
    await admin.from('profiles').update({ failed_attempts: 0, locked_until: null }).eq('id', profile.id);
  }

  return Response.json({ success: true });
}
