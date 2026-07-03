import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { invoiceId, toEmail } = await request.json();
    const [{ data: inv }, { data: items }] = await Promise.all([
      supabase.from('invoices').select('*, clients(name, email, company, client_type)').eq('id', invoiceId).single(),
      supabase.from('invoice_line_items').select('*').eq('invoice_id', invoiceId).order('sort_order'),
    ]);
    if (!inv) return Response.json({ error: 'No encontrada' }, { status: 404 });
    const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const publicUrl = `https://app.otesspr.com/factura/${invoiceId}`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:32px 16px">

  <div style="background:#16223d;border-radius:16px 16px 0 0;padding:28px 32px;display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="color:#fff;font-size:26px;font-weight:900;letter-spacing:-1px">OTESS</div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:4px">OT Electrical & Security Solutions</div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px">Calle 56, #2D8 Lomas de Carolina, PR 00987</div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px">(787) 513-8352 · info@otesspr.com</div>
    </div>
    <div style="text-align:right">
      <div style="color:#fff;font-size:18px;font-weight:900">FACTURA</div>
      <div style="color:#e0972c;font-size:20px;font-weight:700;font-family:monospace">${inv.invoice_number}</div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:6px">Fecha: <strong style="color:#fff">${inv.issued_at}</strong></div>
      ${inv.due_at ? `<div style="color:rgba(255,255,255,0.65);font-size:12px">Vence: <strong style="color:#fff">${inv.due_at}</strong></div>` : ''}
    </div>
  </div>

  <div style="background:#fff;padding:28px 32px">
    <p style="color:#555;font-size:15px;margin-top:0">Estimado/a <strong>${inv.clients?.name}</strong>,</p>
    <p style="color:#666;font-size:14px">Adjunto encontrará su factura <strong>${inv.invoice_number}</strong>. Puede verla y descargarla en el siguiente enlace:</p>

    <div style="text-align:center;margin:24px 0">
      <a href="${publicUrl}" style="background:#e0972c;color:#fff;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;display:inline-block">
        📄 Ver y descargar factura
      </a>
    </div>

    <div style="background:#f8f9fb;border-radius:10px;padding:16px 20px;margin-bottom:24px">
      <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:8px;letter-spacing:0.1em">Facturar a</div>
      <div style="font-weight:700;font-size:15px">${inv.clients?.name}</div>
      ${inv.clients?.company ? `<div style="color:#888;font-size:13px">${inv.clients.company}</div>` : ''}
    </div>



    ${inv.notes ? `<div style="background:#f8f9fb;border-radius:10px;padding:14px 18px;font-size:13px;color:#888;margin-top:16px"><strong style="color:#16223d">Notas:</strong> ${inv.notes}</div>` : ''}

    ${inv.terms ? `<div style="background:#f8f9fb;border-radius:10px;padding:14px 18px;font-size:12px;color:#888;margin-top:12px;line-height:1.7"><strong style="color:#16223d;display:block;margin-bottom:8px;font-size:13px">Términos del Proyecto</strong>${inv.terms.split("\n").filter(l=>l.trim()).map(l=>"<p style=\"margin:0 0 8px\">"+l+"</p>").join("")}</div>` : ""}
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
      subject: `Factura ${inv.invoice_number} — OT Electrical & Security Solutions`,
      html,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await supabase.from('invoices').update({ status: 'sent' }).eq('id', invoiceId);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
