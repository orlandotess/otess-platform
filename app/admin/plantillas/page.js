export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import PlantillasClient from './PlantillasClient';

export default async function PlantillasPage() {
  const { data: templates } = await supabase
    .from('checklist_templates')
    .select('*, checklist_template_items(*)')
    .order('name');

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Plantillas de Checklist</div>
        </div>
        <PlantillasClient templates={templates ?? []} />
      </main>
    </div>
  );
}
