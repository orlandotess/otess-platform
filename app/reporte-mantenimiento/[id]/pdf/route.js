import { supabaseServer as supabase } from '../../../../lib/supabase';
import { respondWithPdf } from '../../../../lib/serverPdf';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GET /reporte-mantenimiento/<id>/pdf[?download=1] — see lib/serverPdf.js.
export async function GET(request, { params }) {
  const { id } = await params;
  const { data: report } = await supabase.from('maintenance_reports').select('title').eq('id', id).maybeSingle();
  if (!report) return new Response('Report not found', { status: 404 });
  return respondWithPdf(request, { path: `/reporte-mantenimiento/${id}`, selector: '#report-doc', filename: `${report.title || 'Report'}.pdf` });
}
