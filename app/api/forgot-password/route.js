import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { getServerLocale, getEmailTranslator } from '../../../lib/i18n-server';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabaseUrl = 'https://zisidorwdhrttmdppnbj.supabase.co';

export async function POST(request) {
  const { email } = await request.json();
  if (!email) return Response.json({ error: 'Email requerido' }, { status: 400 });

  const locale = getServerLocale();
  const t = await getEmailTranslator(locale, 'emails.forgotPassword');

  const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: 'https://app.otesspr.com/auth/callback?type=recovery' },
  });

  // Siempre respondemos success, exista o no la cuenta, para no filtrar
  // qué correos están registrados.
  if (error || !data?.properties?.action_link) {
    return Response.json({ success: true });
  }

  const link = data.properties.action_link;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:32px 16px">

  <div style="background:#16223d;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center">
    <div style="background-color:#16223d !important;display:inline-block;padding:6px 10px;border-radius:6px"><img src="https://app.otesspr.com/otess-logo-blanco.png" alt="OTESS" style="width:130px;height:auto;display:block;margin:0 auto" /></div>
  </div>

  <div style="background:#fff;padding:32px">
    <p style="color:#555;font-size:15px;margin-top:0">${t('intro1')}</p>
    <p style="color:#666;font-size:14px">${t('intro2')}</p>

    <div style="text-align:center;margin:28px 0">
      <a href="${link}" style="background:#e0972c;color:#fff;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;display:inline-block">
        ${t('resetButton')}
      </a>
    </div>

    <p style="color:#999;font-size:12px">${t('ignoreNote')}</p>
  </div>

  <div style="background:#f0f2f5;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center">
    <p style="color:#888;font-size:12px;margin:0">${t('footerQuestions', { email: '<a href="mailto:info@otesspr.com" style="color:#e0972c">info@otesspr.com</a>', phone: '(787) 513-8352' })}</p>
    <p style="color:#aaa;font-size:11px;margin:8px 0 0">${t('footerAddress')}</p>
  </div>

</div>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: email,
      subject: t('subject'),
      html,
    });
  } catch (err) {
    console.error('forgot-password resend error:', err.message);
  }

  return Response.json({ success: true });
}
