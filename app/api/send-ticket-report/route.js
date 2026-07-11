import { Resend } from 'resend';
import { supabaseServer as supabase } from '../../../lib/supabase';
import { getCurrentRole } from '../../../lib/supabase-server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  try {
    const role = await getCurrentRole();
    if (!['admin', 'secretaria', 'vendedor', 'tecnico'].includes(role)) {
      return Response.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { reportId, toEmail, cc } = await request.json();
    const ccList = Array.isArray(cc) ? cc.filter(Boolean) : [];
    const { data: report } = await supabase
      .from('ticket_reports')
      .select('*, service_tickets(subject, clients(name))')
      .eq('id', reportId)
      .single();
    if (!report) return Response.json({ error: 'No encontrado' }, { status: 404 });

    const publicUrl = `https://app.otesspr.com/reporte-boleto/${reportId}`;
    const clientName = report.service_tickets?.clients?.name ?? 'Cliente';
    const ticketSubject = report.service_tickets?.subject ?? '';

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:32px 16px">

  <div style="background:#16223d;border-radius:16px 16px 0 0;padding:28px 32px">
    <div style="background-color:#16223d !important;display:inline-block;padding:6px 10px;border-radius:6px"><img src="https://app.otesspr.com/otess-logo.png" alt="OTESS" style="width:130px;height:auto;display:block" /></div>
    <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:4px">OT Electrical & Security Solutions</div>
    <div style="color:rgba(255,255,255,0.65);font-size:12px">Calle 56, #2D8 Lomas de Carolina, PR 00987</div>
    <div style="color:rgba(255,255,255,0.65);font-size:12px">(787) 513-8352 · info@otesspr.com</div>
    <div style="color:#fff;font-size:18px;font-weight:900;margin-top:16px">REPORTE DE BOLETO</div>
    <div style="color:#e0972c;font-size:16px;font-weight:700">${report.title}</div>
  </div>

  <div style="background:#fff;padding:28px 32px">
    <p style="color:#555;font-size:15px;margin-top:0">Estimado/a <strong>${clientName}</strong>,</p>
    <p style="color:#666;font-size:14px">Le compartimos el reporte de resolución${ticketSubject ? ` del boleto <strong>${ticketSubject}</strong>` : ''}. Puede verlo y descargarlo en el siguiente enlace:</p>

    <div style="text-align:center;margin:24px 0">
      <a href="${publicUrl}" style="background:#e0972c;color:#fff;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;display:inline-block">
        📄 Ver reporte
      </a>
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
      ...(ccList.length ? { cc: ccList } : {}),
      subject: `Reporte de boleto — ${report.title}`,
      html,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await supabase.from('ticket_reports').update({ sent_at: new Date().toISOString(), sent_to: toEmail, sent_cc: ccList.length ? ccList : null }).eq('id', reportId);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
