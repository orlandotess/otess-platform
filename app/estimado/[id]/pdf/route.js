import { supabaseServer as supabase } from '../../../../lib/supabase';
import { respondWithPdf } from '../../../../lib/serverPdf';

// Chromium needs time and memory; the first PDF after a while also has to
// unpack it. See lib/serverPdf.js.
export const runtime = 'nodejs';
export const maxDuration = 60;

// GET /estimado/<id>/pdf            → opens the PDF
// GET /estimado/<id>/pdf?download=1 → downloads it
export async function GET(request, { params }) {
  const { id } = await params;
  const { data: est } = await supabase.from('estimates').select('estimate_number').eq('id', id).maybeSingle();
  if (!est) return new Response('Estimate not found', { status: 404 });
  return respondWithPdf(request, { path: `/estimado/${id}`, selector: '#estimate-doc-public', filename: `${est.estimate_number}.pdf` });
}
