export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import { getCurrentRole } from '../../../lib/supabase-server';
import Sidebar from '../../Sidebar';
import UsersClient from './UsersClient';

export default async function UsuariosPage() {
  const currentRole = (await getCurrentRole()) ?? 'tecnico';

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at');

  const { data: technicians } = await supabase
    .from('technicians')
    .select('id, name');

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Usuarios & Roles</div>
        </div>
        <UsersClient profiles={profiles ?? []} technicians={technicians ?? []} currentRole={currentRole} />
      </main>
    </div>
  );
}
