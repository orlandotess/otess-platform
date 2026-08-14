export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';
import TrabajosTableClient from './TrabajosTableClient';
import { getTranslations } from 'next-intl/server';

export default async function TrabajosPage() {
  const t = await getTranslations('trabajos.list');
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, job_number, title, status, scheduled_start, property_name, street, city, state, zip, clients(name)')
    .order('created_at', { ascending: false });

  return (
    <div className="admin-shell ds-trabajos">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">{t('title')}</div>
          <Link href="/trabajos/nuevo" className="btn btn-primary">{t('newJob')}</Link>
        </div>
        {!jobs?.length ? (
          <div className="card">
            <div className="empty">
              <div className="empty-glyph">🔧</div>
              <h3>{t('emptyTitle')}</h3>
              <p>{t('emptyText')}</p>
              <Link href="/trabajos/nuevo" className="btn btn-primary btn-sm">{t('createJob')}</Link>
            </div>
          </div>
        ) : (
          <TrabajosTableClient jobs={jobs} />
        )}
      </main>
    </div>
  );
}
