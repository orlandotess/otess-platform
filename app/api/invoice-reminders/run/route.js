import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { withRetry } from '../../../../lib/withRetry';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
async function checkIvuReminders(today) {
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

      await resend.emails.send({
        from: 'OTESS <info@otesspr.com>',
        to: 'services@otesspr.com',
        subject: title,
        html: `<div style="font-family:Arial,sans-serif;padding:20px"><p style="font-size:15px;color:#16223d">${title}</p><p style="font-size:13px;color:#666">${body}</p><a href="${APP_URL}/accounting/ivu?year=${row.year}&month=${row.month}" style="color:#e0972c;font-size:13px">Ver en Accounting →</a></div>`,
      }).catch(err => console.error('Error enviando recordatorio IVU:', err));

      await supabase.from('inbox_notifications').insert([{
        type: 'ivu_reminder', title, body, link: `/accounting/ivu?year=${row.year}&month=${row.month}`,
      }]);

      await supabase.from('ivu_payments').update({ reminder_sent_at: new Date().toISOString() }).eq('id', row.id);
    } catch (err) {
      console.error('Error procesando recordatorio IVU:', err);
    }
  }
}

function reminderEmail(inv, balance) {
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const publicUrl = `${APP_URL}/factura/${inv.id}`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
  <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <p style="color:#555;font-size:15px;margin-top:0">Estimado/a <strong>${inv.clients?.name ?? ''}</strong>,</p>
    <p style="color:#666;font-size:14px">Este es un recordatorio de que la factura <strong>${inv.invoice_number}</strong> venció el <strong>${inv.due_at}</strong> y tiene un balance pendiente de <strong>${fmt(balance)}</strong>.</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${publicUrl}" style="background:#e0972c;color:#fff;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;display:inline-block">Ver factura</a>
    </div>
    <p style="color:#999;font-size:12.5px">Si ya realizaste el pago, puedes ignorar este mensaje.</p>
  </div>
  <div style="text-align:center;padding:16px 0">
    <p style="color:#aaa;font-size:12px">¿Preguntas? Contáctanos en <a href="mailto:info@otesspr.com" style="color:#e0972c">info@otesspr.com</a> o al (787) 513-8352</p>
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

  await checkIvuReminders(today);

  const { data: overdue, error: qErr } = await supabase
    .from('invoices')
    .select('*, clients(name, email), payments(amount)')
    .eq('status', 'sent')
    .lt('due_at', today);

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

      await withRetry(() => resend.emails.send({
        from: 'OTESS <info@otesspr.com>',
        to: inv.clients.email,
        subject: `Recordatorio: factura ${inv.invoice_number} vencida`,
        html: reminderEmail(inv, balance),
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
    await resend.emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: 'services@otesspr.com',
      subject: `Recordatorios de facturas vencidas — ${reminded.length} enviados, ${failures.length} con error`,
      html: `<div style="font-family:Arial,sans-serif;padding:20px"><p style="font-size:15px;color:#16223d">Resumen de recordatorios de facturas vencidas (${today}):</p><ul style="font-size:13px">${rows}</ul></div>`,
    }).catch(err => console.error('Error notificando resumen de recordatorios:', err));
  }

  return Response.json({ reminded, failures });
}
