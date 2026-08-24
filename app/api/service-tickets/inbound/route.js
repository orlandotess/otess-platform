import { getResend } from '../../../../lib/resend';
import { supabaseServer as supabase } from '../../../../lib/supabase';
import { getServerLocale, getEmailTranslator } from '../../../../lib/i18n-server';


function stripHtml(html) {
  if (!html) return null;
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

// El "from" del webhook puede venir como "Nombre <correo@dominio.com>" o solo "correo@dominio.com"
function parseSender(from) {
  const match = from?.match(/^(.*?)\s*<(.+)>$/);
  if (match) return { name: match[1].trim() || null, email: match[2].trim().toLowerCase() };
  return { name: null, email: from?.trim().toLowerCase() ?? null };
}

export async function POST(request) {
  const locale = await getServerLocale();
  const t = await getEmailTranslator(locale, 'emails.serviceTicketInbound');
  const payload = await request.text();

  let event;
  try {
    event = getResend().webhooks.verify({
      payload,
      headers: {
        id: request.headers.get('svix-id'),
        timestamp: request.headers.get('svix-timestamp'),
        signature: request.headers.get('svix-signature'),
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    });
  } catch (err) {
    console.error('Firma de webhook inválida:', err.message);
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type !== 'email.received') {
    return Response.json({ ignored: event.type });
  }

  const { email_id, subject } = event.data;

  // Idempotencia: Resend puede reintentar el webhook si no respondemos a tiempo
  const { data: existing } = await supabase.from('service_tickets').select('id').eq('resend_email_id', email_id).maybeSingle();
  if (existing) return Response.json({ success: true, id: existing.id, duplicate: true });

  const { name: contactName, email: senderEmail } = parseSender(event.data.from);

  // Nunca debe impedir que el boleto quede registrado — si esto falla (ej. la API key
  // no tiene permiso de lectura), seguimos solo con el asunto en vez del cuerpo completo.
  let full = null;
  try {
    const { data, error: receivingError } = await getResend().emails.receiving.get(email_id);
    if (receivingError) throw new Error(receivingError.message ?? JSON.stringify(receivingError));
    full = data;
  } catch (err) {
    console.error('Error obteniendo el cuerpo del correo:', err.message ?? err);
  }
  const description = full?.text?.trim() || stripHtml(full?.html) || null;

  let clientId = null;
  if (senderEmail) {
    const { data: clientMatch } = await supabase.from('clients').select('id').ilike('email', senderEmail).maybeSingle();
    clientId = clientMatch?.id ?? null;
    if (!clientId) {
      const { data: contactMatch } = await supabase.from('client_contacts').select('client_id').ilike('email', senderEmail).maybeSingle();
      clientId = contactMatch?.client_id ?? null;
    }
  }

  const { data: lastTicket } = await supabase.from('service_tickets').select('ticket_number').order('created_at', { ascending: false }).limit(1).single();
  let nextNum = 1001;
  if (lastTicket?.ticket_number) {
    const n = parseInt(lastTicket.ticket_number.replace('TCK-', ''));
    if (!isNaN(n)) nextNum = n + 1;
  }

  const { data: ticket, error } = await supabase
    .from('service_tickets')
    .insert([{
      ticket_number: `TCK-${nextNum}`,
      client_id: clientId,
      subject: subject?.trim() || t('noSubject'),
      description,
      contact_name: contactName,
      contact_email: senderEmail,
      source: 'email',
      status: 'abierto',
      resend_email_id: email_id,
    }])
    .select()
    .single();

  if (error) {
    console.error('Error creando boleto desde email:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  let clientLabel = senderEmail ?? t('unknownSender');
  if (clientId) {
    const { data: client } = await supabase.from('clients').select('name, company').eq('id', clientId).single();
    if (client) clientLabel = client.company ? `${client.name} (${client.company})` : client.name;
  }

  // Avisar al equipo — nunca debe impedir que el boleto quede registrado,
  // así que cualquier fallo de notificación se ignora.
  try {
    await supabase.from('inbox_notifications').insert([{
      type: 'service_ticket_created',
      title: `🎫 Nuevo boleto por email de ${clientLabel}`,
      body: ticket.subject,
      link: `/boletos/${ticket.id}`,
    }]);

    const { error: sendError } = await getResend().emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: 'services@otesspr.com',
      subject: t('subject', { clientLabel }),
      html: `
        <div style="font-family:Arial,sans-serif;padding:20px">
          <p style="font-size:15px;color:#16223d">${t('reportedIssue', { clientLabel: `<strong>${clientLabel}</strong>` })}</p>
          <p style="font-size:15px;color:#16223d;font-weight:700">${ticket.subject}</p>
          ${description ? `<p style="font-size:14px;color:#444;white-space:pre-wrap">${description}</p>` : ''}
          ${!clientId ? `<p style="font-size:13px;color:#b52a2a">${t('noClientMatch', { email: senderEmail ?? t('unknownEmail') })}</p>` : ''}
          <a href="https://app.otesspr.com/boletos/${ticket.id}" style="color:#e0972c;font-size:13px">${t('viewInDashboard')}</a>
        </div>
      `,
    });
    if (sendError) console.error('Error notificando boleto:', sendError.message);
  } catch (err) {
    console.error('Error notificando boleto:', err);
  }

  return Response.json({ success: true, id: ticket.id });
}
