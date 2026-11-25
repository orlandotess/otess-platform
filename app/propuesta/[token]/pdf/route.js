import { supabaseServer as supabase } from '../../../../lib/supabase';
import { respondWithPdf } from '../../../../lib/serverPdf';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GET /propuesta/<token>/pdf?opcion=<option id>[&download=1]
// The PDF is the detail of one option — the one the client has selected on
// the page; without ?opcion, the recommended one (or the first).
export async function GET(request, { params }) {
  const { token } = await params;
  const { data: proposal } = await supabase
    .from('proposals')
    .select('proposal_number, status, valid_until, proposal_options(id, is_recommended, sort_order)')
    .eq('public_token', token)
    .maybeSingle();
  if (!proposal) return new Response('Proposal not found', { status: 404 });
  // Same rule as the page: an expired proposal only shows the "expired" notice.
  const expired = proposal.valid_until && proposal.status !== 'aprobada' && new Date(proposal.valid_until + 'T23:59:59') < new Date();
  if (expired) return new Response('This proposal has expired.', { status: 410 });

  const options = [...(proposal.proposal_options ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const wanted = new URL(request.url).searchParams.get('opcion');
  const option = options.find(o => o.id === wanted) ?? options.find(o => o.is_recommended) ?? options[0];
  if (!option) return new Response('Proposal has no options', { status: 404 });

  return respondWithPdf(request, {
    path: `/propuesta/${token}`,
    query: `?opcion=${encodeURIComponent(option.id)}`,
    selector: '#proposal-doc-public',
    margin: 0,
    filename: `${proposal.proposal_number}.pdf`,
  });
}
