import { supabaseServer as supabase } from '../../../../lib/supabase';
import { respondWithPdf } from '../../../../lib/serverPdf';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GET /reporte-boleto/<id>/pdf[?download=1] — see lib/serverPdf.js.
export async function GET(request, { params }) {
  const { id } = await params;
  const { data: report } = await supabase.from('ticket_reports').select('title').eq('id', id).maybeSingle();
  if (!report) return new Response('Report not found', { status: 404 });
  return respondWithPdf(request, { path: `/reporte-boleto/${id}`, selector: '#report-doc', filename: `${report.title || 'Report'}.pdf` });
}
