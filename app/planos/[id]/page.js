export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { supabaseServer as supabase } from '../../../lib/supabase';
import { getCurrentRole } from '../../../lib/supabase-server';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import PlanoEditor from './PlanoEditor';

export default async function PlanoDetail({ params }) {
  const { id } = params;

  const [{ data: plan }, { data: markers }, { data: cables }, { data: layers }, { data: cableTypes }, { data: elementTypes }, { data: customIcons }, { data: allClients }, currentRole] = await Promise.all([
    supabase.from('floor_plans').select('*, clients(name), jobs(title)').eq('id', id).single(),
    supabase.from('floor_plan_markers').select('*').eq('floor_plan_id', id).order('sort_order'),
    supabase.from('floor_plan_cables').select('*').eq('floor_plan_id', id),
    supabase.from('floor_plan_layers').select('*').eq('floor_plan_id', id).order('sort_order'),
    supabase.from('cable_types').select('*').order('name'),
    supabase.from('element_types').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('custom_equipment_icons').select('*').order('name'),
    supabase.from('clients').select('id, name').order('name'),
    getCurrentRole(),
  ]);

  const isTech = currentRole === 'tecnico';

  if (!plan) return (
    <div className="admin-shell">
      {!isTech && <Sidebar />}
      <main className="main-content" style={isTech ? { marginLeft: 0 } : undefined}>
        <div className="page-header">
          <div className="page-title">Plano no encontrado</div>
          <Link href={isTech ? '/crew' : '/planos'} className="btn btn-ghost">← Volver</Link>
        </div>
      </main>
    </div>
  );

  const { data: imageSigned } = await supabase.storage.from('floor-plans').createSignedUrl(plan.rendered_image_path, 3600);
  const { data: sourceSigned } = await supabase.storage.from('floor-plans').createSignedUrl(plan.source_path, 3600);

  const customIconsWithUrls = await Promise.all((customIcons ?? []).map(async ic => {
    const { data } = await supabase.storage.from('floor-plan-icons').createSignedUrl(ic.image_path, 3600);
    return { ...ic, url: data?.signedUrl ?? null };
  }));

  return (
    <div className="admin-shell">
      {!isTech && <Sidebar />}
      <main className="main-content" style={{ maxWidth: 'none', ...(isTech ? { marginLeft: 0 } : {}) }}>
        <PlanoEditor
          plan={plan}
          imageUrl={imageSigned?.signedUrl ?? null}
          sourceUrl={sourceSigned?.signedUrl ?? null}
          initialMarkers={markers ?? []}
          initialCables={cables ?? []}
          initialLayers={layers ?? []}
          initialCableTypes={cableTypes ?? []}
          initialElementTypes={elementTypes ?? []}
          customIcons={customIconsWithUrls}
          currentRole={currentRole}
          allClients={allClients ?? []}
        />
      </main>
    </div>
  );
}
