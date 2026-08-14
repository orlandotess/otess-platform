export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';
import PlanosListClient from './PlanosListClient';
import { getTranslations } from 'next-intl/server';

export default async function PlanosPage() {
  const t = await getTranslations('planos.list');
  const { data: plans } = await supabase
    .from('floor_plans')
    .select('id, name, rendered_image_path, updated_at, clients(name), jobs(title)')
    .order('updated_at', { ascending: false });

  const withThumbs = await Promise.all((plans ?? []).map(async p => {
    const { data } = await supabase.storage.from('floor-plans').createSignedUrl(p.rendered_image_path, 3600);
    return { ...p, thumbUrl: data?.signedUrl ?? null };
  }));

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">{t('title')}</div>
          <Link href="/planos/nuevo" className="btn btn-primary">{t('newPlano')}</Link>
        </div>
        {!withThumbs.length ? (
          <div className="card">
            <div className="empty">
              <div className="empty-glyph">🗺️</div>
              <h3>{t('emptyTitle')}</h3>
              <p>{t('emptyBody')}</p>
              <Link href="/planos/nuevo" className="btn btn-primary btn-sm">{t('addPlano')}</Link>
            </div>
          </div>
        ) : (
          <PlanosListClient plans={withThumbs} />
        )}
      </main>
    </div>
  );
}
