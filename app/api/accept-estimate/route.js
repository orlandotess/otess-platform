import { getResend } from '../../../lib/resend';
import { supabaseServer as supabase } from '../../../lib/supabase';
import { getServerLocale, getEmailTranslator } from '../../../lib/i18n-server';


export async function POST(request) {
  try {
    const { estimateId } = await request.json();
    const locale = getServerLocale();
    const t = await getEmailTranslator(locale, 'emails.estimateAccepted');
    const { data: est } = await supabase.from('estimates').select('*, clients(name)').eq('id', estimateId).single();
    if (!est) return Response.json({ error: 'Estimado no encontrado' }, { status: 404 });
    if (est.status !== 'sent') return Response.json({ error: 'Este estimado ya no se puede aceptar' }, { status: 400 });

    const accepted_at = new Date().toISOString();
    const { error } = await supabase.from('estimates').update({ status: 'accepted', accepted_at }).eq('id', estimateId);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await supabase.from('inbox_notifications').insert([{
      type: 'estimate_accepted',
      title: `✅ Estimado ${est.estimate_number} fue aceptado`,
      body: `${est.clients?.name ?? 'Un cliente'} aceptó el estimado.`,
      link: `/estimados/${estimateId}`,
    }]);

    try {
      const { error: sendError } = await getResend().emails.send({
        from: 'OTESS <info@otesspr.com>',
        to: 'services@otesspr.com',
        subject: t('subject', { number: est.estimate_number }),
        html: `
          <div style="font-family:Arial,sans-serif;padding:20px">
            <p style="font-size:15px;color:#16223d">${t('body', { name: est.clients?.name ?? t('defaultClientName'), number: est.estimate_number })}</p>
            <a href="https://app.otesspr.com/estimados/${estimateId}" style="color:#e0972c;font-size:13px">${t('viewLink')}</a>
          </div>
        `,
      });
      if (sendError) console.error('Error notificando aceptación:', sendError.message);
    } catch (err) {
      console.error('Error notificando aceptación:', err);
    }

    return Response.json({ success: true, accepted_at });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
