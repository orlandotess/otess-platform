import { supabaseServer as supabase } from '../../../../lib/supabase';

// Cron cada 15 minutos (vercel.json). Manda las facturas programadas cuya hora
// ya llegó — ver migrations/2026-11-14-scheduled-invoice-emails.sql.
//
// Cada fila se "reclama" pasándola de pending a sent con un update condicional
// antes de enviar: si dos corridas se pisan, solo una gana la fila y el
// cliente no recibe el correo dos veces. Si el envío falla, se marca failed.

const BATCH = 25;

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Misma app que recibió el cron: en producción app.otesspr.com, en local el dev server.
  const origin = new URL(request.url).origin;

  const { data: due, error } = await supabase
    .from('scheduled_invoice_emails')
    .select('id, invoice_id, to_email, cc, invoices(status, total, payments(amount), retenciones(retencion_aplicada))')
    .eq('status', 'pending')
    .lte('send_at', new Date().toISOString())
    .order('send_at')
    .limit(BATCH);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const row of due ?? []) {
    const inv = row.invoices;
    const paid = (inv?.payments ?? []).reduce((a, p) => a + Number(p.amount), 0);
    const retained = (inv?.retenciones ?? []).reduce((a, r) => a + Number(r.retencion_aplicada ?? 0), 0);
    const balance = Number(inv?.total ?? 0) - paid - retained;

    // Entre que se programó y ahora la factura se pudo saldar o cancelar.
    if (!inv || ['paid', 'cancelled'].includes(inv.status) || balance <= 0.01) {
      await supabase.from('scheduled_invoice_emails')
        .update({ status: 'skipped', error: !inv ? 'Factura no encontrada' : `Factura ${inv.status === 'cancelled' ? 'cancelada' : 'pagada'} antes del envío` })
        .eq('id', row.id).eq('status', 'pending');
      results.push({ id: row.id, result: 'skipped' });
      continue;
    }

    const { data: claimed } = await supabase.from('scheduled_invoice_emails')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', row.id).eq('status', 'pending')
      .select('id');
    if (!claimed?.length) continue; // otra corrida o una cancelación llegó primero

    try {
      const res = await fetch(`${origin}/api/send-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
        body: JSON.stringify({ invoiceId: row.invoice_id, toEmail: row.to_email, cc: row.cc ?? [] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? `HTTP ${res.status}`);
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
