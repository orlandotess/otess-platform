export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import OportunidadesBoard from './OportunidadesBoard';

export default async function OportunidadesPage() {
  const [{ data: stages }, { data: opportunities }, { data: technicians }, { data: clients }] = await Promise.all([
    supabase.from('opportunity_stages').select('id, key, label, position').order('position'),
    supabase
      .from('opportunities')
      .select('id, name, client_id, contact_name, company_name, phone, email, value, stage_key, status, assigned_technician_id, next_follow_up, notes, created_at, clients(name), technicians(name)')
      .order('created_at', { ascending: false }),
    supabase.from('technicians').select('id, name').order('name'),
    supabase.from('clients').select('id, name, phone, email, company').order('name'),
  ]);

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <OportunidadesBoard
          initialStages={stages ?? []}
          initialOpportunities={opportunities ?? []}
          technicians={technicians ?? []}
          clients={clients ?? []}
        />
      </main>
    </div>
  );
}
