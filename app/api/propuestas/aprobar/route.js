import { Resend } from 'resend';
import { supabaseServer as supabase } from '../../../../lib/supabase';
import { formatDateTimePR } from '../../../../lib/datetimeLocal';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  const { token, option_id, signed_name } = await request.json();

  if (!token || !option_id) {
    return Response.json({ error: 'Faltan datos' }, { status: 400 });
  }

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, proposal_number, title, status, requires_signature, valid_until, clients(name)')
    .eq('public_token', token)
    .single();

  if (!proposal) return Response.json({ error: 'Propuesta no encontrada' }, { status: 404 });
  if (proposal.status === 'aprobada') return Response.json({ error: 'Esta propuesta ya fue aprobada' }, { status: 400 });
  if (proposal.valid_until && new Date(proposal.valid_until + 'T23:59:59') < new Date()) {
    return Response.json({ error: 'Esta propuesta ya expiró' }, { status: 400 });
  }

  if (proposal.requires_signature && !signed_name?.trim()) {
    return Response.json({ error: 'Falta la firma' }, { status: 400 });
  }

  // option_id debe pertenecer a esta propuesta — evita que alguien mande el id de una opción de otra propuesta
  const { data: option } = await supabase
    .from('proposal_options')
    .select('id, name')
    .eq('id', option_id)
    .eq('proposal_id', proposal.id)
    .single();

  if (!option) return Response.json({ error: 'Opción inválida' }, { status: 400 });

  const now = new Date().toISOString();
  const { error } = await supabase.from('proposals').update({
    status: 'aprobada',
    approved_at: now,
    approved_option_id: option_id,
    signed_name: proposal.requires_signature ? signed_name.trim() : null,
    signed_at: proposal.requires_signature ? now : null,
  }).eq('id', proposal.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Avisar al equipo — nunca debe impedir que la aprobación del cliente se registre,
  // así que cualquier fallo de envío se ignora.
  try {
    await resend.emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: 'services@otesspr.com',
      subject: `✅ Propuesta ${proposal.proposal_number} fue aprobada`,
      html: `
        <div style="font-family:Arial,sans-serif;padding:20px">
          <p style="font-size:15px;color:#16223d"><strong>${proposal.clients?.name ?? 'Un cliente'}</strong> aprobó la propuesta <strong>${proposal.proposal_number} — ${proposal.title}</strong>.</p>
          <p style="font-size:14px;color:#444">Opción elegida: <strong>${option.name}</strong></p>
          ${proposal.requires_signature ? `<p style="font-size:14px;color:#444">Firmado por: <strong>${signed_name.trim()}</strong></p>` : ''}
          <p style="font-size:13px;color:#888">Fecha: ${formatDateTimePR(new Date(), { dateStyle: 'medium', timeStyle: 'short' })}</p>
          <a href="https://app.otesspr.com/propuestas/${proposal.id}" style="color:#e0972c;font-size:13px">Ver propuesta en el dashboard →</a>
        </div>
      `,
    });
  } catch (err) {
    console.error('Error notificando aprobación:', err);
  }

  return Response.json({ success: true });
}
