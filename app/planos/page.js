export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';
import PlanosListClient from './PlanosListClient';

export default async function PlanosPage() {
  const { data: plans } = await supabase
    .from('floor_plans')
    .select('id, name, rendered_image_path, updated_at, clients(name), jobs(title)')
    .order('updated_at', { ascending: false });

  const withThumbs = await Promise.all((plans ?? []).map(async p => {
    const { data } = await supabase.storage.from('floor-plans').createSignedUrl(p.rendered_image_path, 3600);
    return { ...p, thumbUrl: data?.signedUrl ?? null };
  }));

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Planos</div>
          <Link href="/planos/nuevo" className="btn btn-primary">+ Nuevo plano</Link>
        </div>
        {!withThumbs.length ? (
          <div className="card">
            <div className="empty">
              <div className="empty-glyph">🗺️</div>
              <h3>No hay planos aún</h3>
              <p>Sube un plano para empezar a marcar cámaras, control de acceso, access points y rutas de cableado.</p>
              <Link href="/planos/nuevo" className="btn btn-primary btn-sm">+ Agregar plano</Link>
            </div>
          </div>
        ) : (
          <PlanosListClient plans={withThumbs} />
        )}
      </main>
    </div>
  );
}
