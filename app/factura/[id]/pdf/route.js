import { supabaseServer as supabase } from '../../../../lib/supabase';
import { respondWithPdf } from '../../../../lib/serverPdf';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GET /factura/<id>/pdf[?download=1] — see lib/serverPdf.js.
export async function GET(request, { params }) {
  const { id } = await params;
  const { data: inv } = await supabase.from('invoices').select('invoice_number').eq('id', id).maybeSingle();
  if (!inv) return new Response('Invoice not found', { status: 404 });
  return respondWithPdf(request, { path: `/factura/${id}`, selector: '#invoice-doc-public', filename: `${inv.invoice_number}.pdf` });
}
