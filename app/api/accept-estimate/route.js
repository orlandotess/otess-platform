import { Resend } from 'resend';
import { supabaseServer as supabase } from '../../../lib/supabase';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  try {
    const { estimateId } = await request.json();
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
      await resend.emails.send({
        from: 'OTESS <info@otesspr.com>',
        to: 'services@otesspr.com',
        subject: `✅ Estimado ${est.estimate_number} fue aceptado`,
        html: `
          <div style="font-family:Arial,sans-serif;padding:20px">
            <p style="font-size:15px;color:#16223d"><strong>${est.clients?.name ?? 'Un cliente'}</strong> aceptó el estimado <strong>${est.estimate_number}</strong>.</p>
            <a href="https://app.otesspr.com/estimados/${estimateId}" style="color:#e0972c;font-size:13px">Ver estimado y convertir a trabajo →</a>
          </div>
        `,
      });
    } catch (err) {
      console.error('Error notificando aceptación:', err);
    }

    return Response.json({ success: true, accepted_at });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
