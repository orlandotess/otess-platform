export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import PropuestaDetailClient from './detail-client';

export default async function PropuestaDetailPage({ params }) {
  const { data: proposal } = await supabase
    .from('proposals')
    .select('*, clients(id, name, phone, email, company, client_type, client_addresses(*)), proposal_options(*, proposal_line_items(*))')
    .eq('id', params.id)
    .single();

  if (proposal?.valid_until && proposal.valid_until < new Date().toISOString().split('T')[0] && ['enviada', 'vista', 'cambios_requeridos'].includes(proposal.status)) {
    await supabase.from('proposals').update({ status: 'expirada' }).eq('id', proposal.id);
    proposal.status = 'expirada';
  }

  const { data: taxRules } = await supabase.from('tax_rules').select('client_type, line_item_type, rate');
  const { data: payments } = await supabase.from('proposal_payments').select('*').eq('proposal_id', params.id).order('sort_order');
  const { data: companyInfo } = await supabase.from('company_settings').select('*').limit(1).single();
  const rawAddr = proposal?.clients?.client_addresses?.find(a => a.is_primary) ?? proposal?.clients?.client_addresses?.[0] ?? null;
  const primaryAddress = rawAddr ? { street: rawAddr.line1, city: rawAddr.city, zip: rawAddr.zip } : null;

  if (!proposal) {
    return (
      <div className="admin-shell ds-propuestas">
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
    <div className="admin-shell ds-propuestas">
      <Sidebar />
      <main className="main-content">
        <PropuestaDetailClient proposal={proposal} options={options} taxRules={taxRules ?? []} payments={payments ?? []} companyInfo={companyInfo ?? null} primaryAddress={primaryAddress} />
      </main>
    </div>
  );
}
