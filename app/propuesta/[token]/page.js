export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import PropuestaPublicClient from './public-client';

export default async function PropuestaPublicPage({ params }) {
  const { data: proposal } = await supabase
    .from('proposals')
    .select('*, clients(name, email, phone, company, client_type, report_name_source, client_addresses(*)), proposal_options(*, proposal_line_items(*))')
    .eq('public_token', params.token)
    .single();

  if (!proposal) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <p>Propuesta no encontrada.</p>
      </div>
    );
  }

  const isExpired = proposal.valid_until && proposal.status !== 'aprobada' && new Date(proposal.valid_until + 'T23:59:59') < new Date();
  if (isExpired) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system,sans-serif', background: '#fafafa', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, maxWidth: 420, textAlign: 'center', border: '1px solid #eee' }}>
          <div style={{ fontSize: 32, marginBottom: 12, color: '#999' }}>⏳</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#16223d', marginBottom: 8 }}>Esta propuesta expiró</div>
          <p style={{ fontSize: 14, color: '#888' }}>Era válida hasta el {new Date(proposal.valid_until + 'T00:00:00').toLocaleDateString('es-PR', { dateStyle: 'long' })}. Contáctanos si deseas una propuesta actualizada.</p>
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
