import { supabase } from './supabase';

export const ANNUAL_EXEMPTION = 500;

// Computes the suggested retention for a client's invoice, using the client's
// remaining $500/year exemption balance (the exemption resets every calendar
// year and is consumed in the order retenciones were created).
export async function computeRetentionForInvoice({ clientId, subtotalLabor, fecha, excludeRetencionId }) {
  const year = (fecha || new Date().toISOString().slice(0, 10)).slice(0, 4);
  const labor = Number(subtotalLabor || 0);

  let usedExemption = 0;
  if (clientId) {
    const { data } = await supabase.from('retenciones')
      .select('id, monto_exento')
      .eq('client_id', clientId)
      .gte('fecha', `${year}-01-01`)
      .lte('fecha', `${year}-12-31`)
      .order('fecha', { ascending: true })
      .order('created_at', { ascending: true });
    usedExemption = (data ?? [])
      .filter(r => r.id !== excludeRetencionId)
      .reduce((a, r) => a + Number(r.monto_exento ?? 0), 0);
  }

  const remainingExemption = Math.max(ANNUAL_EXEMPTION - usedExemption, 0);
  const montoExento = Math.min(labor, remainingExemption);
  const baseRetencion = Math.max(labor - montoExento, 0);
  const retencionCalculada = baseRetencion * 0.10;

  return { montoExento, baseRetencion, retencionCalculada, remainingExemptionBefore: remainingExemption, usedExemption };
}

// Given a client's retenciones for a single year (each needs at least
// fecha + monto_exento, ideally also invoice_number), returns the exemption
// status: how much of the $500 has been used, and — if exhausted — which
// retención tipped it over, so the UI can say "since when" retention started.
export function computeExemptionStatus(records) {
  const sorted = [...(records ?? [])].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    return (a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1;
  });

  let usedExemption = 0;
  let exhaustedAt = null;
  for (const r of sorted) {
    const before = usedExemption;
    usedExemption += Number(r.monto_exento ?? 0);
    if (!exhaustedAt && before < ANNUAL_EXEMPTION && usedExemption >= ANNUAL_EXEMPTION) {
      exhaustedAt = r;
    }
  }

  const remainingExemption = Math.max(ANNUAL_EXEMPTION - usedExemption, 0);
  return { usedExemption, remainingExemption, exhausted: remainingExemption <= 0, exhaustedAt };
}
