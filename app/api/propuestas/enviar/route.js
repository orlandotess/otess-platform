import { Resend } from 'resend';
import { supabaseServer as supabase } from '../../../../lib/supabase';
import { getCurrentRole } from '../../../../lib/supabase-server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  const role = await getCurrentRole();
  if (!['admin', 'secretaria', 'vendedor'].includes(role)) {
    return Response.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { proposalId } = await request.json();
  if (!proposalId) return Response.json({ error: 'Falta proposalId' }, { status: 400 });

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, proposal_number, title, public_token, clients(name, email)')
    .eq('id', proposalId)
    .single();

  if (!proposal) return Response.json({ error: 'Propuesta no encontrada' }, { status: 404 });
  if (!proposal.clients?.email) return Response.json({ error: 'El cliente no tiene email registrado' }, { status: 400 });

  const now = new Date().toISOString();
  const { error } = await supabase.from('proposals').update({ status: 'enviada', sent_at: now }).eq('id', proposalId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const publicUrl = `https://app.otesspr.com/propuesta/${proposal.public_token}`;

  try {
    await resend.emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: proposal.clients.email,
      subject: `Propuesta ${proposal.proposal_number} — ${proposal.title}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <img src="https://app.otesspr.com/otess-logo.png" alt="OTESS" style="width:130px;margin-bottom:20px" />
          <p style="font-size:15px;color:#16223d">Hola ${proposal.clients.name ?? ''},</p>
          <p style="font-size:14px;color:#444;line-height:1.6">Tienes una nueva propuesta de OTESS: <strong>${proposal.title}</strong> (${proposal.proposal_number}).</p>
          <p style="margin:24px 0">
            <a href="${publicUrl}" style="background:#16223d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Ver propuesta</a>
          </p>
          <p style="font-size:12px;color:#999">¿Preguntas? Contáctanos en info@otesspr.com o al (787) 513-8352.</p>
        </div>
      `,
    });
  } catch (err) {
    return Response.json({ success: true, warning: `Estado actualizado, pero el email no se pudo enviar: ${err.message}` });
  }

  return Response.json({ success: true });
}
