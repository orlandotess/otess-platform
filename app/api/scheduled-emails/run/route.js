import { supabaseServer as supabase } from '../../../../lib/supabase';

// Cron cada 15 minutos (vercel.json). Manda las facturas y estimados
// programados cuya hora ya llegó — ver migrations/2026-11-14-scheduled-invoice-emails.sql
// y 2026-11-14b-scheduled-emails-estimados.sql.
//
// Cada fila se "reclama" pasándola de pending a sent con un update condicional
// antes de enviar: si dos corridas se pisan, solo una gana la fila y el
// cliente no recibe el correo dos veces. Si el envío falla, se marca failed.

const BATCH = 25;

function todayPR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Puerto_Rico', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Devuelve el motivo para no enviar, o null si se puede enviar.
function invoiceSkipReason(inv) {
  if (!inv) return 'Factura no encontrada';
  if (inv.status === 'cancelled') return 'Factura cancelada antes del envío';
  const paid = (inv.payments ?? []).reduce((a, p) => a + Number(p.amount), 0);
  const retained = (inv.retenciones ?? []).reduce((a, r) => a + Number(r.retencion_aplicada ?? 0), 0);
  if (inv.status === 'paid' || Number(inv.total ?? 0) - paid - retained <= 0.01) return 'Factura pagada antes del envío';
  return null;
}

function estimateSkipReason(est) {
  if (!est) return 'Estimado no encontrado';
  if (est.status === 'accepted') return 'Estimado aceptado antes del envío';
  if (est.status === 'converted') return 'Estimado convertido en trabajo antes del envío';
  if (est.status === 'cancelled') return 'Estimado cancelado antes del envío';
  if (est.archived_at) return 'Estimado archivado antes del envío';
  if (est.valid_until && est.valid_until < todayPR()) return 'Estimado vencido antes del envío';
  return null;
}

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Misma app que recibió el cron: en producción app.otesspr.com, en local el dev server.
  const origin = new URL(request.url).origin;

  const { data: due, error } = await supabase
    .from('scheduled_invoice_emails')
    .select('id, invoice_id, estimate_id, to_email, cc, invoices(status, total, payments(amount), retenciones(retencion_aplicada)), estimates(status, archived_at, valid_until)')
    .eq('status', 'pending')
    .lte('send_at', new Date().toISOString())
    .order('send_at')
    .limit(BATCH);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const row of due ?? []) {
    const isInvoice = !!row.invoice_id;
    const skip = isInvoice ? invoiceSkipReason(row.invoices) : estimateSkipReason(row.estimates);

    if (skip) {
      await supabase.from('scheduled_invoice_emails')
        .update({ status: 'skipped', error: skip })
        .eq('id', row.id).eq('status', 'pending');
      results.push({ id: row.id, result: 'skipped', reason: skip });
      continue;
    }

    const { data: claimed } = await supabase.from('scheduled_invoice_emails')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', row.id).eq('status', 'pending')
      .select('id');
    if (!claimed?.length) continue; // otra corrida o una cancelación llegó primero

    const [path, body] = isInvoice
      ? ['/api/send-invoice', { invoiceId: row.invoice_id }]
      : ['/api/send-estimate', { estimateId: row.estimate_id }];
    try {
      const res = await fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
        body: JSON.stringify({ ...body, toEmail: row.to_email, cc: row.cc ?? [] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error ?? `HTTP ${res.status}`);
      results.push({ id: row.id, result: 'sent' });
    } catch (err) {
      await supabase.from('scheduled_invoice_emails')
        .update({ status: 'failed', sent_at: null, error: err.message })
        .eq('id', row.id);
      results.push({ id: row.id, result: 'failed', error: err.message });
    }
  }

  return Response.json({ processed: results.length, results });
}
