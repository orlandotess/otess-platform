export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import UsersClient from './UsersClient';

const supabaseUrl = 'https://zisidorwdhrttmdppnbj.supabase.co';
const supabaseAnonKey = 'sb_publishable_wL7A9THCYwVcyu3t6uk-3Q_Vt09bJzn';

export default async function UsuariosPage() {
  const cookieStore = await cookies();
  const authClient = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name) { return cookieStore.get(name)?.value; },
      set() {},
      remove() {},
    },
  });

  const { data: { user } } = await authClient.auth.getUser();

  let currentRole = 'tecnico';
  if (user) {
    const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    currentRole = myProfile?.role ?? 'tecnico';
  }

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
