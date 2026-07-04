export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import PropuestaDetailClient from './detail-client';

export default async function PropuestaDetailPage({ params }) {
  const { data: proposal } = await supabase
    .from('proposals')
    .select('*, clients(id, name, phone, email, client_type), proposal_options(*, proposal_line_items(*))')
    .eq('id', params.id)
    .single();

  const { data: taxRules } = await supabase.from('tax_rules').select('client_type, line_item_type, rate');

  if (!proposal) {
    return (
      <div className="admin-shell">
        <Sidebar />
        <main className="main-content">
          <p>Propuesta no encontrada.</p>
        </main>
      </div>
    );
  }

  // Firmar URLs de fotos
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

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <PropuestaDetailClient proposal={proposal} options={options} taxRules={taxRules ?? []} />
      </main>
    </div>
  );
}
