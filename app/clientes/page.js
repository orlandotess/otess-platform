export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';
import ClientesTableClient from './ClientesTableClient';
import { getTranslations } from 'next-intl/server';

export default async function ClientesPage() {
  const t = await getTranslations('clientes.list');
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, client_type, email, phone, company')
    .order('name');

  return (
    <div className="admin-shell ds-clientes">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">{t('title')}</div>
          <Link href="/clientes/nuevo" className="btn btn-primary">+ {t('newClient')}</Link>
        </div>
        {!clients?.length ? (
          <div className="card">
            <div className="empty">
              <div className="empty-glyph">👥</div>
              <h3>{t('empty.title')}</h3>
              <p>{t('empty.text')}</p>
              <Link href="/clientes/nuevo" className="btn btn-primary btn-sm">+ {t('empty.cta')}</Link>
            </div>
          </div>
        ) : (
          <ClientesTableClient clients={clients} />
        )}
      </main>
    </div>
  );
}
