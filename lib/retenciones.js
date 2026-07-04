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
