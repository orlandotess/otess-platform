export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
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
          <div>
            <Link href="/propuestas" style={{ fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none' }}>← Propuestas</Link>
            <div className="page-title">Empresa</div>
          </div>
        </div>
        <EmpresaClient settings={settings ?? null} />
      </main>
    </div>
  );
}
