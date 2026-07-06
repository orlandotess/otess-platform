export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import EmpresaClient from './EmpresaClient';

export default async function EmpresaPage() {
  const { data: settings } = await supabase.from('company_settings').select('*').limit(1).single();

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Empresa</div>
        </div>
        <EmpresaClient settings={settings ?? null} />
      </main>
    </div>
  );
}
