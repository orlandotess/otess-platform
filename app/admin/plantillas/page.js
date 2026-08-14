export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import PlantillasClient from './PlantillasClient';
import { getTranslations } from 'next-intl/server';

export default async function PlantillasPage() {
  const tr = await getTranslations('admin.plantillas');
  const { data: templates } = await supabase
    .from('checklist_templates')
    .select('*, checklist_template_items(*)')
    .order('name');

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">{tr('title')}</div>
        </div>
        <PlantillasClient templates={templates ?? []} />
      </main>
    </div>
  );
}
