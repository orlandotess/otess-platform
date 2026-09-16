// Retención en el origen sobre lo que se le paga a un técnico, con la exención
// de los primeros $500 del año.
//
// Es la misma regla (y la misma tasa) que lib/retenciones.js aplica del otro
// lado del mostrador, cuando el cliente retiene sobre la labor de una factura
// nuestra: 10% sobre servicios, con los primeros $500 del año calendario
// exentos y consumidos en orden cronológico. Antes nómina retenía 10% desde el
// primer dólar, así que los dos módulos de la misma app aplicaban criterios
// distintos sobre la misma ley.
//
// La consecuencia de diseño: la retención de una semana YA NO se puede
// calcular sola. Depende de cuánto de los $500 se consumió en las semanas
// anteriores de ese año, así que toda pantalla que muestre retención tiene que
// traer el año completo del técnico, no solo el período que enseña. Por eso
// esta función recibe TODOS los eventos de pago y devuelve el desglose por
// evento, en vez de una función que multiplique un bruto por una tasa.

export const ANNUAL_RETENTION_EXEMPTION = 500;
export const RETENTION_RATE = 0.10;

// El año que manda es el de la FECHA DE PAGO (el viernes en que sale el
// cheque), no el de los días trabajados: es cuando el dinero se entrega y
// cuando la retención se reporta. Una semana que cruza el fin de año (p. ej.
// 30 dic – 5 ene, que paga el 8 de enero) consume exención del año nuevo.
export function payDateForWeek(weekStartKey) {
  const d = new Date(weekStartKey + 'T00:00:00');
  d.setDate(d.getDate() + 9); // miércoles + 9 = el viernes siguiente al martes de cierre
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// `events`: [{ key, technicianId, payDate, gross }] en cualquier orden. Devuelve
// un mapa key -> { gross, exempt, base, retention, net }.
//
// La exención se consume por técnico y por año calendario, en orden de fecha de
// pago. El orden importa y tiene que ser estable: dos eventos con la misma
// fecha de pago se desempatan por `key`, para que el desglose no cambie entre
// dos renders con los mismos datos.
export function computeRetentions(events = []) {
  const sorted = [...events].sort((a, b) => {
    if (a.payDate !== b.payDate) return a.payDate < b.payDate ? -1 : 1;
    return String(a.key) < String(b.key) ? -1 : 1;
  });
  const used = {}; // technicianId|año -> exención ya consumida
  const out = {};
  sorted.forEach(ev => {
    const gross = Number(ev.gross ?? 0);
    const bucket = `${ev.technicianId}|${ev.payDate.slice(0, 4)}`;
    const consumed = used[bucket] ?? 0;
    const remaining = Math.max(ANNUAL_RETENTION_EXEMPTION - consumed, 0);
    // Un bruto negativo (un ajuste correctivo) no consume exención ni genera
    // retención negativa por su cuenta; se deja pasar tal cual.
    const exempt = gross > 0 ? Math.min(gross, remaining) : 0;
    const base = Math.max(gross - exempt, 0);
    const retention = base * RETENTION_RATE;
    used[bucket] = consumed + exempt;
    out[ev.key] = { gross, exempt, base, retention, net: gross - retention };
  });
  return out;
}
