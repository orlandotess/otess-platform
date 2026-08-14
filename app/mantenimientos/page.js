export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import MantenimientosClient from './MantenimientosClient';
import { getTranslations } from 'next-intl/server';

export default async function MantenimientosPage() {
  const t = await getTranslations('mantenimientos.list');
  const { data: recurring } = await supabase
    .from('recurring_maintenances')
    .select('*, clients(id, name), technicians(id, name), recurring_maintenance_technicians(technician_id, technicians(id, name)), recurring_maintenance_items(id, text, sort_order)')
    .order('created_at', { ascending: false });

  const { data: technicians } = await supabase
    .from('technicians')
    .select('id, name')
    .order('name');

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, company, client_type')
    .order('name');

  const { data: clientProperties } = await supabase
    .from('client_properties')
    .select('id, client_id, name, street, city, state, zip, is_primary')
    .order('is_primary', { ascending: false });

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">{t('title')}</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{t('subtitle')}</p>
          </div>
        </div>

        <MantenimientosClient
          recurring={recurring ?? []}
          technicians={technicians ?? []}
          clients={clients ?? []}
          clientProperties={clientProperties ?? []}
        />
      </main>
    </div>
  );
}
