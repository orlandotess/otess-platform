export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import ProveedoresClient from './ProveedoresClient';

export default async function ProveedoresPage() {
  const { data: vendors } = await supabase.from('vendors').select('*').order('name');

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <ProveedoresClient initialVendors={vendors ?? []} />
      </main>
    </div>
  );
}
