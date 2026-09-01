export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import { getResend } from '../../../lib/resend';
import { formatDateTimePR } from '../../../lib/datetimeLocal';
import PropuestaPublicClient from './public-client';
import { getTranslations, getLocale } from 'next-intl/server';

export default async function PropuestaPublicPage(props) {
  const params = await props.params;
  const t = await getTranslations('propuestas.publicPage');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';

  const { data: proposal } = await supabase
    .from('proposals')
    .select('*, clients(name, email, phone, company, client_type, report_name_source, client_addresses(*)), proposal_options(*, proposal_line_items(*))')
    .eq('public_token', params.token)
    .single();

  if (!proposal) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <p>{t('notFound')}</p>
      </div>
    );
  }

  const isExpired = proposal.valid_until && proposal.status !== 'aprobada' && new Date(proposal.valid_until + 'T23:59:59') < new Date();
  if (isExpired) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system,sans-serif', background: '#fafafa', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, maxWidth: 420, textAlign: 'center', border: '1px solid #eee' }}>
          <div style={{ fontSize: 32, marginBottom: 12, color: '#999' }}>⏳</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#16223d', marginBottom: 8 }}>{t('expiredTitle')}</div>
          <p style={{ fontSize: 14, color: '#888' }}>{t('expiredBody', { date: new Date(proposal.valid_until + 'T00:00:00').toLocaleDateString(dateLocale, { dateStyle: 'long' }) })}</p>
        </div>
      </div>
    );
  }

  const { data: taxRules } = await supabase.from('tax_rules').select('client_type, line_item_type, rate');
  const { data: payments } = await supabase.from('proposal_payments').select('*').eq('proposal_id', proposal.id).order('sort_order');
  const { data: companyInfo } = await supabase.from('company_settings').select('*').limit(1).single();
  const rawAddr = proposal.clients?.client_addresses?.find(a => a.is_primary) ?? proposal.clients?.client_addresses?.[0] ?? null;
  const primaryAddress = rawAddr ? { street: rawAddr.line1, city: rawAddr.city, zip: rawAddr.zip } : null;

  // Marcar como vista (solo la primera vez)
  if (!proposal.viewed_at) {
    await supabase.from('proposals').update({ viewed_at: new Date().toISOString(), status: proposal.status === 'enviada' ? 'vista' : proposal.status }).eq('id', proposal.id);
  }

  // Trackear vista + notificar por email — nunca debe impedir que el cliente
  // vea su propuesta, así que cualquier fallo (incluyendo Resend sin
  // configurar, o proposal_views antes de correr su migración) se ignora.
  // A diferencia de `viewed_at` arriba, esto corre en cada apertura: igual que
  // estimados y facturas, la bandeja lleva el historial completo de vistas.
  await supabase.from('proposal_views').insert([{ proposal_id: proposal.id }]);
  await supabase.from('inbox_notifications').insert([{
    type: 'proposal_viewed',
    title: `👁️ Propuesta ${proposal.proposal_number} fue abierta`,
    body: `${proposal.clients?.name ?? 'Un cliente'} abrió la propuesta.`,
    link: `/propuestas/${proposal.id}`,
  }]);

  try {
    const { error: sendError } = await getResend().emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: 'services@otesspr.com',
      subject: `👁️ Propuesta ${proposal.proposal_number} fue abierta`,
      html: `
        <div style="font-family:Arial,sans-serif;padding:20px">
          <p style="font-size:15px;color:#16223d"><strong>${proposal.clients?.name ?? 'Un cliente'}</strong> abrió la propuesta <strong>${proposal.proposal_number}</strong>.</p>
          <p style="font-size:13px;color:#888">Fecha: ${formatDateTimePR(new Date(), { dateStyle: 'medium', timeStyle: 'short' })}</p>
          <a href="https://app.otesspr.com/propuestas/${proposal.id}" style="color:#e0972c;font-size:13px">Ver propuesta en el dashboard →</a>
        </div>
      `,
    });
    if (sendError) console.error('Error notificando vista:', sendError.message);
  } catch (err) {
    console.error('Error notificando vista:', err);
  }

  const options = await Promise.all(
    (proposal.proposal_options ?? []).sort((a, b) => a.sort_order - b.sort_order).map(async opt => {
      const items = await Promise.all(
        (opt.proposal_line_items ?? []).sort((a, b) => a.sort_order - b.sort_order).map(async it => {
          if (!it.photo_url) return it;
          const { data } = await supabase.storage.from('Job-photos').createSignedUrl(it.photo_url, 3600);
          return { ...it, photo_signed_url: data?.signedUrl ?? null };
        })
      );
      return { ...opt, items };
    })
  );

  let coverPhotoUrl = null;
  if (proposal.cover_photo_url) {
    const { data } = await supabase.storage.from('Job-photos').createSignedUrl(proposal.cover_photo_url, 3600);
    coverPhotoUrl = data?.signedUrl ?? null;
  }

  return <PropuestaPublicClient proposal={proposal} options={options} coverPhotoUrl={coverPhotoUrl} taxRules={taxRules ?? []} payments={payments ?? []} companyInfo={companyInfo ?? null} primaryAddress={primaryAddress} />;
}
