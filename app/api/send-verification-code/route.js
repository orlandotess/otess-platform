import crypto from 'crypto';
import { Resend } from 'resend';
import { createSupabaseServerClient, getCurrentRole } from '../../../lib/supabase-server';
import { supabaseServer } from '../../../lib/supabase';

const resend = new Resend(process.env.RESEND_API_KEY);
const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export async function POST() {
  const authClient = createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.email) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  const role = await getCurrentRole();
  if (role !== 'admin') {
    return Response.json({ error: 'No aplica para este usuario' }, { status: 400 });
  }

  const { data: lastCode } = await supabaseServer
    .from('login_verification_codes')
    .select('created_at')
    .eq('user_email', user.email)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (lastCode && (Date.now() - new Date(lastCode.created_at).getTime()) < RESEND_COOLDOWN_SECONDS * 1000) {
    return Response.json({ error: 'Espera unos segundos antes de pedir otro código' }, { status: 429 });
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60000).toISOString();

  const { data: row, error } = await supabaseServer
    .from('login_verification_codes')
    .insert({ user_email: user.email, code_hash: hashCode(code), expires_at: expiresAt })
    .select('id')
    .single();

  if (error || !row) {
    return Response.json({ error: 'No se pudo generar el código' }, { status: 500 });
  }

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:32px 16px">

  <div style="background:#16223d;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center">
    <div style="background-color:#16223d !important;display:inline-block;padding:6px 10px;border-radius:6px"><img src="https://app.otesspr.com/otess-logo-blanco.png" alt="OTESS" style="width:130px;height:auto;display:block;margin:0 auto" /></div>
  </div>

  <div style="background:#fff;padding:32px">
    <p style="color:#555;font-size:15px;margin-top:0">Tu código de verificación para entrar a la plataforma OTESS es:</p>
    <div style="text-align:center;margin:28px 0">
      <span style="display:inline-block;background:#f0f2f5;color:#16223d;padding:16px 28px;border-radius:10px;font-weight:700;font-size:32px;letter-spacing:8px">${code}</span>
    </div>
    <p style="color:#666;font-size:14px">Este código expira en ${CODE_TTL_MINUTES} minutos.</p>
    <p style="color:#999;font-size:12px">Si no intentaste iniciar sesión, ignora este correo.</p>
  </div>

  <div style="background:#f0f2f5;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center">
    <p style="color:#888;font-size:12px;margin:0">¿Preguntas? Contáctanos en <a href="mailto:info@otesspr.com" style="color:#e0972c">info@otesspr.com</a> o al (787) 513-8352</p>
    <p style="color:#aaa;font-size:11px;margin:8px 0 0">OT Electrical & Security Solutions · Carolina, Puerto Rico</p>
  </div>

</div>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: user.email,
      subject: `${code} es tu código de verificación — OTESS`,
      html,
    });
  } catch (err) {
    console.error('send-verification-code resend error:', err.message);
    return Response.json({ error: 'No se pudo enviar el correo' }, { status: 500 });
  }

  const response = Response.json({ success: true });
  response.headers.append(
    'Set-Cookie',
    `otess_mfa_id=${row.id}; Path=/; Max-Age=${CODE_TTL_MINUTES * 60}; HttpOnly; Secure; SameSite=Lax`
  );
  return response;
}
