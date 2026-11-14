import { supabaseServer as supabase } from '../../../lib/supabase';
import { getCurrentRole, getCurrentUserName } from '../../../lib/supabase-server';

// Envío programado de facturas y estimados — ver
// migrations/2026-11-14-scheduled-invoice-emails.sql y 2026-11-14b-*.
// POST programa un envío (invoiceId o estimateId, uno solo); DELETE ?id= lo
// cancela mientras siga pendiente. El envío lo hace /api/scheduled-emails/run.

const ALLOWED_ROLES = ['admin', 'secretaria', 'vendedor'];
const MAX_DAYS_AHEAD = 365;
// Estados en los que ya no tiene sentido mandar el documento.
const CLOSED_INVOICE = ['paid', 'cancelled'];
const CLOSED_ESTIMATE = ['accepted', 'converted', 'cancelled'];

export async function POST(request) {
  try {
    const role = await getCurrentRole();
    if (!ALLOWED_ROLES.includes(role)) return Response.json({ error: 'No autorizado' }, { status: 403 });

    const { invoiceId, estimateId, toEmail, cc, sendAt } = await request.json();
    if (!!invoiceId === !!estimateId) return Response.json({ error: 'Indica una factura o un estimado' }, { status: 400 });
    if (!toEmail?.trim()) return Response.json({ error: 'Falta el destinatario' }, { status: 400 });

    const when = new Date(sendAt);
    if (Number.isNaN(when.getTime())) return Response.json({ error: 'Fecha inválida' }, { status: 400 });
    const now = Date.now();
    if (when.getTime() <= now + 60_000) return Response.json({ error: 'La fecha tiene que ser en el futuro' }, { status: 400 });
    if (when.getTime() > now + MAX_DAYS_AHEAD * 86400000) return Response.json({ error: 'La fecha está demasiado lejos' }, { status: 400 });

    if (invoiceId) {
      const { data: inv } = await supabase.from('invoices').select('id, status').eq('id', invoiceId).single();
      if (!inv) return Response.json({ error: 'No encontrada' }, { status: 404 });
      if (CLOSED_INVOICE.includes(inv.status)) return Response.json({ error: 'La factura ya está pagada o cancelada' }, { status: 400 });
    } else {
      const { data: est } = await supabase.from('estimates').select('id, status, archived_at').eq('id', estimateId).single();
      if (!est) return Response.json({ error: 'No encontrado' }, { status: 404 });
      if (CLOSED_ESTIMATE.includes(est.status) || est.archived_at) return Response.json({ error: 'El estimado ya está aceptado, convertido, cancelado o archivado' }, { status: 400 });
    }

    const ccList = Array.isArray(cc) ? [...new Set(cc.map(s => String(s).trim()).filter(Boolean))] : [];
    const { data, error } = await supabase.from('scheduled_invoice_emails').insert([{
      invoice_id: invoiceId ?? null,
      estimate_id: estimateId ?? null,
      to_email: toEmail.trim(),
      cc: ccList,
      send_at: when.toISOString(),
      created_by: await getCurrentUserName(),
    }]).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true, scheduled: data });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const role = await getCurrentRole();
    if (!ALLOWED_ROLES.includes(role)) return Response.json({ error: 'No autorizado' }, { status: 403 });

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'Falta el id' }, { status: 400 });

    // Solo si sigue pendiente: si el cron ya lo tomó, no se puede deshacer.
    const { data, error } = await supabase.from('scheduled_invoice_emails')
      .update({ status: 'cancelled' })
      .eq('id', id).eq('status', 'pending')
      .select('id');
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data?.length) return Response.json({ error: 'Ese envío ya salió o ya estaba cancelado' }, { status: 409 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
