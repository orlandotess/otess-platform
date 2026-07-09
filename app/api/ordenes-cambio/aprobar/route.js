import { Resend } from 'resend';
import { supabaseServer as supabase } from '../../../../lib/supabase';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  const { token, signed_name } = await request.json();
  if (!token) return Response.json({ error: 'Falta el token' }, { status: 400 });

  const { data: order } = await supabase
    .from('change_orders')
    .select('id, change_order_number, title, status, requires_signature, valid_until, clients(name)')
    .eq('public_token', token)
    .single();

  if (!order) return Response.json({ error: 'Orden de cambio no encontrada' }, { status: 404 });
  if (order.status === 'aprobada') return Response.json({ error: 'Esta orden de cambio ya fue aprobada' }, { status: 400 });
  if (order.valid_until && new Date(order.valid_until + 'T23:59:59') < new Date()) {
    return Response.json({ error: 'Esta orden de cambio ya expiró' }, { status: 400 });
  }
  if (order.requires_signature && !signed_name?.trim()) {
    return Response.json({ error: 'Falta la firma' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from('change_orders').update({
    status: 'aprobada',
    approved_at: now,
    signed_name: order.requires_signature ? signed_name.trim() : null,
    signed_at: order.requires_signature ? now : null,
  }).eq('id', order.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  try {
    await resend.emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: 'services@otesspr.com',
      subject: `✅ Orden de cambio ${order.change_order_number} fue aprobada`,
      html: `
        <div style="font-family:Arial,sans-serif;padding:20px">
          <p style="font-size:15px;color:#16223d"><strong>${order.clients?.name ?? 'Un cliente'}</strong> aprobó la orden de cambio <strong>${order.change_order_number}${order.title ? ` — ${order.title}` : ''}</strong>.</p>
          ${order.requires_signature ? `<p style="font-size:14px;color:#444">Firmado por: <strong>${signed_name.trim()}</strong></p>` : ''}
          <p style="font-size:13px;color:#888">Fecha: ${new Date().toLocaleString('es-PR', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          <a href="https://app.otesspr.com/ordenes-cambio/${order.id}" style="color:#e0972c;font-size:13px">Ver en el dashboard →</a>
        </div>
      `,
    });
  } catch (err) {
    console.error('Error notificando aprobación:', err);
  }

  return Response.json({ success: true });
}
