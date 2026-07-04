export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import PropuestaPublicClient from './public-client';

export default async function PropuestaPublicPage({ params }) {
  const { data: proposal } = await supabase
    .from('proposals')
    .select('*, clients(name), proposal_options(*, proposal_line_items(*))')
    .eq('public_token', params.token)
    .single();

  if (!proposal) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <p>Propuesta no encontrada.</p>
      </div>
    );
  }

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

  return <PropuestaPublicClient proposal={proposal} options={options} />;
}
