export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { createClient } from '@supabase/supabase-js';
import Sidebar from '../../Sidebar';
import PlantillasClient from './PlantillasClient';

const supabase = createClient(
  'https://zisidorwdhrttmdppnbj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inppc2lkb3J3ZGhydHRtZHBwbmJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MzA3NDEsImV4cCI6MjA5ODAwNjc0MX0.dKCf0omLnIy3AILNaU8vWj_yrMlJM-Fh9sOui71a7Po'
);

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
