import crypto from 'crypto';
import { Resend } from 'resend';
import { createSupabaseServerClient, getCurrentRole } from '../../../lib/supabase-server';
import { supabaseServer } from '../../../lib/supabase';
import { getServerLocale, getEmailTranslator } from '../../../lib/i18n-server';

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

  // El cliente se construye aquí y no al importar el módulo: sin RESEND_API_KEY
  // el constructor lanza, la ruta entera falla al cargarse y el navegador recibe
  // una página de error HTML en vez de JSON — que el frontend mostraba como
  // "Error de conexión", escondiendo la causa real.
  if (!process.env.RESEND_API_KEY) {
    console.error('send-verification-code: falta RESEND_API_KEY en este entorno');
    return Response.json({ error: 'El envío de correo no está configurado en este entorno' }, { status: 500 });
  }
  const resend = new Resend(process.env.RESEND_API_KEY);

  const locale = getServerLocale();
  const t = await getEmailTranslator(locale, 'emails.verificationCode');

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
    <p style="color:#555;font-size:15px;margin-top:0">${t('intro')}</p>
    <div style="text-align:center;margin:28px 0">
      <span style="display:inline-block;background:#f0f2f5;color:#16223d;padding:16px 28px;border-radius:10px;font-weight:700;font-size:32px;letter-spacing:8px">${code}</span>
    </div>
    <p style="color:#666;font-size:14px">${t('expiresIn', { minutes: CODE_TTL_MINUTES })}</p>
    <p style="color:#999;font-size:12px">${t('ignoreNotice')}</p>
  </div>

  <div style="background:#f0f2f5;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center">
    <p style="color:#888;font-size:12px;margin:0">${t('footerQuestions', { email: '<a href="mailto:info@otesspr.com" style="color:#e0972c">info@otesspr.com</a>', phone: '(787) 513-8352' })}</p>
    <p style="color:#aaa;font-size:11px;margin:8px 0 0">${t('footerAddress')}</p>
  </div>

</div>
</body>
</html>`;

  try {
    // Resend devuelve { error } en vez de lanzar cuando la API rechaza el envío
    // (clave inválida, dominio sin verificar, límite de tasa). Sin esta
    // comprobación la ruta respondía success y el código nunca llegaba.
    const { error: sendError } = await resend.emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: user.email,
      subject: t('subject', { code }),
      html,
    });
    if (sendError) {
      console.error('send-verification-code resend error:', sendError.message);
      return Response.json({ error: 'No se pudo enviar el correo' }, { status: 500 });
    }
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
