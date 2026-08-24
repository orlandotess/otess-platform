import { getResend } from '../../../../lib/resend';
import { supabaseServer as supabase } from '../../../../lib/supabase';
import { getServerLocale, getEmailTranslator } from '../../../../lib/i18n-server';


const APP_URL = 'https://app.otesspr.com';
const LEAD_DAYS = 30;

function todayPR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Puerto_Rico', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function daysBetween(a, b) {
  return Math.floor((new Date(b) - new Date(a)) / 86400000);
}

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayPR();
  const locale = await getServerLocale();
  const t = await getEmailTranslator(locale, 'emails.warrantyReminder');
  const threshold = new Date(today);
  threshold.setDate(threshold.getDate() + LEAD_DAYS);
  const thresholdStr = threshold.toISOString().slice(0, 10);

  const { data: expiring, error: qErr } = await supabase
    .from('job_line_items')
    .select('*, jobs(id, job_number, clients(name))')
    .not('warranty_expires_at', 'is', null)
    .is('warranty_reminder_sent_at', null)
    .lte('warranty_expires_at', thresholdStr);

  if (qErr) return Response.json({ error: qErr.message }, { status: 500 });

  const reminded = [];
  const failures = [];

  for (const item of expiring ?? []) {
    const job = item.jobs;
    const label = item.title || item.description;
    try {
      const daysLeft = daysBetween(today, item.warranty_expires_at);
      const status = daysLeft < 0 ? `venció hace ${Math.abs(daysLeft)} día(s)` : `vence en ${daysLeft} día(s)`;
      const title = `Garantía por vencer: ${label}`;
      const body = `Job ${job?.job_number ?? ''} (${job?.clients?.name ?? 'cliente desconocido'}) — ${status}, el ${item.warranty_expires_at}.`;
      const link = job?.id ? `/trabajos/${job.id}` : undefined;

      const emailStatus = daysLeft < 0
        ? t('statusOverdue', { days: Math.abs(daysLeft) })
        : t('statusUpcoming', { days: daysLeft });
      const emailTitle = t('title', { item: label });
      const emailBody = t('body', {
        jobNumber: job?.job_number ?? '',
        clientName: job?.clients?.name ?? t('unknownClient'),
        status: emailStatus,
        date: item.warranty_expires_at,
      });

      const { error: sendError } = await getResend().emails.send({
        from: 'OTESS <info@otesspr.com>',
        to: 'services@otesspr.com',
        subject: emailTitle,
        html: `<div style="font-family:Arial,sans-serif;padding:20px"><p style="font-size:15px;color:#16223d">${emailTitle}</p><p style="font-size:13px;color:#666">${emailBody}</p>${link ? `<a href="${APP_URL}${link}" style="color:#e0972c;font-size:13px">${t('viewJobLink')}</a>` : ''}</div>`,
      });
      // Si el envío falla hay que dejarlo caer al catch: marcar el recordatorio
      // como enviado más abajo lo daría por entregado y no se reintentaría nunca.
      if (sendError) throw new Error(`No se pudo enviar el correo: ${sendError.message}`);

      await supabase.from('inbox_notifications').insert([{ type: 'warranty_reminder', title, body, link }]);

      await supabase.from('job_line_items').update({ warranty_reminder_sent_at: new Date().toISOString() }).eq('id', item.id);

      reminded.push({ item: label, jobNumber: job?.job_number, expiresAt: item.warranty_expires_at });
    } catch (err) {
      failures.push({ item: label, jobNumber: job?.job_number, reason: err.message });
    }
  }

  return Response.json({ reminded, failures });
}
