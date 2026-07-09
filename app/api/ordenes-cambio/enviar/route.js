import { Resend } from 'resend';
import { supabaseServer as supabase } from '../../../../lib/supabase';
import { getCurrentRole } from '../../../../lib/supabase-server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  try {
    const role = await getCurrentRole();
    if (!['admin', 'secretaria', 'vendedor'].includes(role)) {
      return Response.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { orderId, toEmail } = await request.json();
    const [{ data: order }, { data: items }] = await Promise.all([
      supabase.from('change_orders').select('*, clients(name, email, company, client_type)').eq('id', orderId).single(),
      supabase.from('change_order_line_items').select('*').eq('change_order_id', orderId).order('sort_order'),
    ]);
    if (!order) return Response.json({ error: 'No encontrada' }, { status: 404 });

    const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const publicUrl = `https://app.otesspr.com/orden-cambio/${order.public_token}`;
    const rows = items?.map(i => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px">${i.description}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;font-size:13px">${i.type === 'labor' ? 'Labor' : 'Producto'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-size:13px">${i.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-size:13px">${fmt(i.unit_price)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700;font-size:14px">${fmt(Number(i.line_total) + Number(i.tax_amount))}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:32px 16px">

  <div style="background:#16223d;border-radius:16px 16px 0 0;padding:28px 32px;display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="background-color:#16223d !important;display:inline-block;padding:6px 10px;border-radius:6px"><img src="https://app.otesspr.com/otess-logo.png" alt="OTESS" style="width:130px;height:auto;display:block" /></div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:4px">OT Electrical & Security Solutions</div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px">Calle 56, #2D8 Lomas de Carolina, PR 00987</div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px">(787) 513-8352 · info@otesspr.com</div>
    </div>
    <div style="text-align:right">
      <div style="color:#fff;font-size:18px;font-weight:900">ORDEN DE CAMBIO</div>
      <div style="color:#e0972c;font-size:20px;font-weight:700;font-family:monospace">${order.change_order_number}</div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:6px">Fecha: <strong style="color:#fff">${order.issued_at}</strong></div>
      ${order.valid_until ? `<div style="color:rgba(255,255,255,0.65);font-size:12px">Válida hasta: <strong style="color:#fff">${order.valid_until}</strong></div>` : ''}
    </div>
  </div>

  <div style="background:#fff;padding:28px 32px">
    <p style="color:#555;font-size:15px;margin-top:0">Estimado/a <strong>${order.clients?.name}</strong>,</p>
    <p style="color:#666;font-size:14px">Se ha preparado una orden de cambio <strong>${order.change_order_number}</strong>${order.title ? ` — ${order.title}` : ''} que requiere su aprobación. Puede revisarla y aprobarla en el siguiente enlace:</p>

    <div style="text-align:center;margin:24px 0">
      <a href="${publicUrl}" style="background:#e0972c;color:#fff;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;display:inline-block">
        📄 Ver y aprobar orden de cambio
      </a>
    </div>

    ${order.intro_note ? `<div style="background:#f8f9fb;border-radius:10px;padding:16px 20px;margin-bottom:24px;font-size:13px;color:#555">${order.intro_note}</div>` : ''}

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <thead>
        <tr style="background:#16223d">
          <th style="color:#fff;padding:10px 12px;text-align:left;font-size:11px">Descripción</th>
          <th style="color:#fff;padding:10px 12px;text-align:center;font-size:11px">Tipo</th>
          <th style="color:#fff;padding:10px 12px;text-align:right;font-size:11px">Cant.</th>
          <th style="color:#fff;padding:10px 12px;text-align:right;font-size:11px">Precio</th>
          <th style="color:#fff;padding:10px 12px;text-align:right;font-size:11px">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="display:flex;justify-content:flex-end">
      <div style="width:280px">
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee"><span style="color:#888">Subtotal productos</span><span>${fmt(order.subtotal_products)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee"><span style="color:#888">IVU productos (11.5%)</span><span>${fmt(order.tax_products)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee"><span style="color:#888">Subtotal labor</span><span>${fmt(order.subtotal_labor)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee"><span style="color:#888">IVU labor (${order.clients?.client_type === 'b2b' ? '4%' : '11.5%'})</span><span>${fmt(order.tax_labor)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:20px;font-weight:900;color:#16223d"><span>TOTAL</span><span>${fmt(order.total)}</span></div>
      </div>
    </div>
  </div>

  <div style="background:#f0f2f5;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center">
    <p style="color:#888;font-size:12px;margin:0">¿Preguntas? Contáctanos en <a href="mailto:info@otesspr.com" style="color:#e0972c">info@otesspr.com</a> o al (787) 513-8352</p>
    <p style="color:#aaa;font-size:11px;margin:8px 0 0">OT Electrical & Security Solutions · Carolina, Puerto Rico</p>
  </div>

</div>
</body>
</html>`;

    const { error } = await resend.emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: toEmail,
      subject: `Orden de cambio ${order.change_order_number} — requiere tu aprobación`,
      html,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await supabase.from('change_orders').update({ status: 'enviada', sent_at: new Date().toISOString() }).eq('id', orderId);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
