import crypto from 'crypto';
import { createSupabaseServerClient } from '../../../lib/supabase-server';
import { supabaseServer } from '../../../lib/supabase';

const TRUSTED_HOURS = 12;
const MAX_ATTEMPTS = 5;

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  const match = header.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return match ? match.slice(name.length + 1) : null;
}

export async function POST(request) {
  const authClient = createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.email) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { code } = await request.json();
  if (!code) {
    return Response.json({ error: 'Código requerido' }, { status: 400 });
  }

  const rowId = getCookie(request, 'otess_mfa_id');
  if (!rowId) {
    return Response.json({ error: 'No hay un código pendiente. Solicita uno nuevo.' }, { status: 400 });
  }

  const { data: row } = await supabaseServer
    .from('login_verification_codes')
    .select('id, user_email, code_hash, attempts, expires_at, verified')
    .eq('id', rowId)
    .single();

  if (!row || row.user_email !== user.email) {
    return Response.json({ error: 'No hay un código pendiente. Solicita uno nuevo.' }, { status: 400 });
  }

  if (new Date(row.expires_at) <= new Date()) {
    return Response.json({ error: 'El código expiró. Solicita uno nuevo.' }, { status: 400 });
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    return Response.json({ error: 'Demasiados intentos. Solicita un código nuevo.' }, { status: 429 });
  }

  if (row.code_hash !== hashCode(code)) {
    await supabaseServer.from('login_verification_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return Response.json({ error: 'Código incorrecto' }, { status: 401 });
  }

  const verifiedUntil = new Date(Date.now() + TRUSTED_HOURS * 3600000).toISOString();
  await supabaseServer.from('login_verification_codes').update({ verified: true, verified_until: verifiedUntil }).eq('id', row.id);

  const response = Response.json({ success: true });
  response.headers.append(
    'Set-Cookie',
    `otess_mfa_id=${row.id}; Path=/; Max-Age=${TRUSTED_HOURS * 3600}; HttpOnly; Secure; SameSite=Lax`
  );
  return response;
}
