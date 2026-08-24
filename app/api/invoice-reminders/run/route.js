import { getResend } from '../../../../lib/resend';
import { withRetry } from '../../../../lib/withRetry';
import { supabaseServer as supabase } from '../../../../lib/supabase';
import { getServerLocale, getEmailTranslator, getClientEmailTranslator } from '../../../../lib/i18n-server';


const APP_URL = 'https://app.otesspr.com';
const REMINDER_INTERVAL_DAYS = 7;
const MAX_REMINDERS = 3;
const GRACE_DAYS = 3;

function todayPR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Puerto_Rico', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function daysBetween(a, b) {
  return Math.floor((new Date(b) - new Date(a)) / 86400000);
}

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Bundled into this same cron (rather than a separate vercel.json entry) to stay
// within Vercel's cron-job limit — unrelated to invoice reminders otherwise.
async function checkIvuReminders(today, t) {
  const { data: pending } = await supabase
    .from('ivu_payments')
    .select('*')
    .eq('paid', false)
    .not('due_date', 'is', null)
    .not('reminder_day', 'is', null)
    .is('reminder_sent_at', null);

  for (const row of pending ?? []) {
    try {
      const due = new Date(row.due_date + 'T00:00:00');
      const lastDay = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
      const reminderDate = new Date(due.getFullYear(), due.getMonth(), Math.min(row.reminder_day, lastDay))
        .toISOString().slice(0, 10);
      if (today < reminderDate) continue;

      const monthLabel = `${MONTHS[row.month]} ${row.year}`;
      const title = `IVU de ${monthLabel} pendiente`;
      const body = `Vence el ${row.due_date} y aún no está marcado como pagado.`;
      const emailSubject = t('ivuSubject', { month: monthLabel });
      const emailBody = t('ivuBody', { dueDate: row.due_date });

      const { error: sendError } = await getResend().emails.send({
        from: 'OTESS <info@otesspr.com>',
        to: 'services@otesspr.com',
        subject: emailSubject,
        html: `<div style="font-family:Arial,sans-serif;padding:20px"><p style="font-size:15px;color:#16223d">${emailSubject}</p><p style="font-size:13px;color:#666">${emailBody}</p><a href="${APP_URL}/accounting/ivu?year=${row.year}&month=${row.month}" style="color:#e0972c;font-size:13px">${t('ivuLinkText')}</a></div>`,
      }).catch(err => ({ error: err }));
      // Si el envío falla hay que dejarlo caer al catch: marcar el recordatorio
      // como enviado más abajo lo daría por entregado y no se reintentaría nunca.
      if (sendError) throw new Error(`No se pudo enviar el correo: ${sendError.message}`);

      await supabase.from('inbox_notifications').insert([{
        type: 'ivu_reminder', title, body, link: `/accounting/ivu?year=${row.year}&month=${row.month}`,
      }]);

      await supabase.from('ivu_payments').update({ reminder_sent_at: new Date().toISOString() }).eq('id', row.id);
    } catch (err) {
      console.error('Error procesando recordatorio IVU:', err);
    }
  }
}

function reminderEmail(inv, balance, t) {
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const publicUrl = `${APP_URL}/factura/${inv.id}`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
  <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <p style="color:#555;font-size:15px;margin-top:0">${t('greeting', { name: inv.clients?.name ?? '' })}</p>
    <p style="color:#666;font-size:14px">${t('body', { number: inv.invoice_number, dueDate: inv.due_at, balance: fmt(balance) })}</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${publicUrl}" style="background:#e0972c;color:#fff;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;display:inline-block">${t('viewButton')}</a>
    </div>
    <p style="color:#999;font-size:12.5px">${t('ignoreNote')}</p>
  </div>
  <div style="text-align:center;padding:16px 0">
    <p style="color:#aaa;font-size:12px">${t('footerQuestions', { email: '<a href="mailto:info@otesspr.com" style="color:#e0972c">info@otesspr.com</a>', phone: '(787) 513-8352' })}</p>
  </div>
</div>
</body></html>`;
}

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayPR();
  const locale = getServerLocale();
  const t = await getEmailTranslator(locale, 'emails.invoiceReminder');
  const tClient = await getClientEmailTranslator('emails.invoiceReminder');

  await checkIvuReminders(today, t);

  const { data: overdue, error: qErr } = await supabase
    .from('invoices')
    .select('*, clients(name, email), payments(amount)')
    .eq('status', 'sent')
    .lt('due_at', today)
    .is('reminders_paused_at', null);

  if (qErr) return Response.json({ error: qErr.message }, { status: 500 });

  const reminded = [];
  const failures = [];

  for (const inv of overdue ?? []) {
    try {
      const totalPaid = (inv.payments ?? []).reduce((a, p) => a + Number(p.amount), 0);
      const balance = Number(inv.total) - totalPaid;
      if (balance <= 0) continue;

      const daysOverdue = daysBetween(inv.due_at, today);
      if (daysOverdue < GRACE_DAYS) continue;

      const reminderCount = inv.reminder_count ?? 0;
      if (reminderCount >= MAX_REMINDERS) continue;
      if (inv.last_reminder_at && daysBetween(inv.last_reminder_at.slice(0, 10), today) < REMINDER_INTERVAL_DAYS) continue;

      if (!inv.clients?.email) {
        failures.push({ invoiceNumber: inv.invoice_number, clientName: inv.clients?.name ?? 'desconocido', reason: 'El cliente no tiene email registrado' });
        continue;
      }

      await withRetry(() => getResend().emails.send({
        from: 'OTESS <info@otesspr.com>',
        to: inv.clients.email,
        subject: tClient('reminderSubject', { number: inv.invoice_number }),
        html: reminderEmail(inv, balance, tClient),
      }).then(({ error }) => { if (error) throw new Error(error.message); }));

      await supabase.from('invoices').update({
        last_reminder_at: new Date().toISOString(),
        reminder_count: reminderCount + 1,
      }).eq('id', inv.id);

      reminded.push({ invoiceNumber: inv.invoice_number, clientName: inv.clients.name, balance });
    } catch (err) {
      failures.push({ invoiceNumber: inv.invoice_number, clientName: inv.clients?.name ?? 'desconocido', reason: err.message });
    }
  }

  if (reminded.length > 0 || failures.length > 0) {
    const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const rows = [
      ...reminded.map(r => `<li style="color:#1a7a4a">✓ ${r.invoiceNumber} — ${r.clientName} — ${fmt(r.balance)}</li>`),
      ...failures.map(f => `<li style="color:#b52a2a">✗ ${f.invoiceNumber} — ${f.clientName} — ${f.reason}</li>`),
    ].join('');
    const { error: sendError } = await getResend().emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: 'services@otesspr.com',
      subject: t('summarySubject', { reminded: reminded.length, failures: failures.length }),
      html: `<div style="font-family:Arial,sans-serif;padding:20px"><p style="font-size:15px;color:#16223d">${t('summaryIntro', { date: today })}</p><ul style="font-size:13px">${rows}</ul></div>`,
    }).catch(err => ({ error: err }));
    if (sendError) console.error('Error notificando resumen de recordatorios:', sendError.message);
  }

  return Response.json({ reminded, failures });
}
