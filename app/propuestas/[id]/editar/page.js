export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { Suspense } from 'react';
import { supabaseServer as supabase } from '../../../../lib/supabase';
import Sidebar from '../../../Sidebar';
import PropuestaForm from '../../PropuestaForm';
import { getTranslations } from 'next-intl/server';

export default async function EditarPropuestaPage(props) {
  const params = await props.params;
  const t = await getTranslations('propuestas.editProposal');
  const { data: proposal } = await supabase
    .from('proposals')
    .select('*, clients(name, email, phone, company, client_type)')
    .eq('id', params.id)
    .single();

  if (!proposal) {
    return (
      <div className="admin-shell">
        <Sidebar />
        <main className="main-content">
          <p>{t('notFound')}</p>
        </main>
      </div>
    );
  }

  if (!['borrador', 'enviada', 'vista', 'cambios_requeridos'].includes(proposal.status)) {
    return (
      <div className="admin-shell">
        <Sidebar />
        <main className="main-content">
          <p>{t('alreadyDecided', { decision: proposal.status === 'aprobada' ? 'approved' : 'rejected' })}</p>
        </main>
      </div>
    );
  }

  const { data: options } = await supabase
    .from('proposal_options')
    .select('*, proposal_line_items(*)')
    .eq('proposal_id', params.id)
    .order('sort_order');
  const { data: payments } = await supabase.from('proposal_payments').select('*').eq('proposal_id', params.id).order('sort_order');

  const optionsWithSignedPhotos = await Promise.all(
    (options ?? []).map(async opt => {
      const items = await Promise.all(
        (opt.proposal_line_items ?? []).map(async it => {
          if (!it.photo_url) return it;
          const { data } = await supabase.storage.from('Job-photos').createSignedUrl(it.photo_url, 3600);
          return { ...it, photo_signed_url: data?.signedUrl ?? null };
        })
      );
      return { ...opt, items };
    })
  );

  let coverSignedUrl = null;
  if (proposal.cover_photo_url) {
    const { data } = await supabase.storage.from('Job-photos').createSignedUrl(proposal.cover_photo_url, 3600);
    coverSignedUrl = data?.signedUrl ?? null;
  }

  return (
    <Suspense fallback={<div style={{ padding: 40 }}>{t('loading')}</div>}>
      <PropuestaForm
        initialData={{
          proposal: { ...proposal, cover_photo_signed_url: coverSignedUrl },
          options: optionsWithSignedPhotos,
          payments: payments ?? [],
        }}
      />
    </Suspense>
  );
}
