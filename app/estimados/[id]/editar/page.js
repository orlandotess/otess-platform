export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { Suspense } from 'react';
import { supabaseServer as supabase } from '../../../../lib/supabase';
import Sidebar from '../../../Sidebar';
import EstimateForm from '../../EstimateForm';
import { getTranslations } from 'next-intl/server';

export default async function EditarEstimadoPage({ params }) {
  const t = await getTranslations('estimados.editEstimate');
  const { data: estimate } = await supabase.from('estimates').select('*').eq('id', params.id).single();

  if (!estimate) {
    return (
      <div className="admin-shell ds-estimados">
        <Sidebar />
        <main className="main-content"><p>{t('notFound')}</p></main>
      </div>
    );
  }

  if (!['draft', 'sent'].includes(estimate.status)) {
    const statusLabel = { accepted: t('status.accepted'), cancelled: t('status.cancelled'), converted: t('status.converted') };
    return (
      <div className="admin-shell ds-estimados">
        <Sidebar />
        <main className="main-content">
          <p>{t('alreadyProcessed', { status: statusLabel[estimate.status] ?? estimate.status })}</p>
        </main>
      </div>
    );
  }

  const { data: items } = await supabase.from('estimate_line_items').select('*').eq('estimate_id', params.id).order('sort_order');
  const itemsWithSignedUrls = await Promise.all(
    (items ?? []).map(async it => {
      if (!it.photo_url) return it;
      const { data } = await supabase.storage.from('Job-photos').createSignedUrl(it.photo_url, 3600);
      return { ...it, photo_signed_url: data?.signedUrl ?? null };
    })
  );

  return (
    <Suspense fallback={<div style={{ padding: 40 }}>{t('loading')}</div>}>
      <EstimateForm initialData={{ estimate, items: itemsWithSignedUrls }} />
    </Suspense>
  );
}
