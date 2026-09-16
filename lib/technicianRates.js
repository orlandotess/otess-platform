// Resuelve la tarifa por hora de un técnico EN UNA FECHA, contra el historial
// de vigencias de technician_rates (ver migrations/2026-09-15-technician-rates.sql).
//
// Todo lo que calcula paga o costo de mano de obra tiene que pasar por aquí,
// igual que pasa por payrollOverrides.js para las horas. Leer
// technicians.hourly_rate directo vuelve a romper lo mismo que esta tabla
// arregla: como esa columna se sobrescribe, un aumento de hoy recalculaba
// hacia atrás semanas ya pagadas y trabajos ya cerrados.
//
// Las fechas se comparan como texto 'YYYY-MM-DD' a propósito: en formato ISO
// el orden lexicográfico ES el cronológico, así que no hay que construir un
// Date por comparación (esto corre dentro de loops por técnico × semana) y se
// evita de paso el desfase de zona horaria que tendría `new Date('2026-09-16')`,
// que es medianoche UTC y no medianoche en Puerto Rico.

// Agrupa las filas por técnico, cada grupo ordenado de vigencia más nueva a
// más vieja, que es el orden en que rateOn las recorre.
export function indexRates(rates = []) {
  const byTech = {};
  rates.forEach(r => {
    if (!byTech[r.technician_id]) byTech[r.technician_id] = [];
    byTech[r.technician_id].push({ effective_from: r.effective_from, hourly_rate: Number(r.hourly_rate ?? 0) });
  });
  Object.values(byTech).forEach(list => list.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1)));
  return byTech;
}

// La tarifa vigente en `dayKey` es la de la fila más reciente cuya vigencia ya
// había empezado en esa fecha. Como la lista viene ordenada descendente, la
// primera que cumple es la respuesta.
//
// `fallback` es technicians.hourly_rate y solo se usa para un técnico sin
// ninguna fila de tarifa. La migración siembra una fila por cada técnico
// existente, así que en la práctica solo aplica a uno creado después sin
// pasar por el formulario de nómina.
//
// Ojo con el caso de una fecha ANTERIOR a la primera vigencia: ahí no hay
// tarifa que aplicar y se devuelve el fallback, no la tarifa más vieja. Son
// horas de antes de que existiera tarifa registrada; inventarles la primera
// que se fijó sería adivinar.
export function rateOn(ratesByTech, technicianId, dayKey, fallback = 0) {
  const list = ratesByTech?.[technicianId];
  if (!list || list.length === 0) return Number(fallback ?? 0);
  const hit = list.find(r => r.effective_from <= dayKey);
  return hit ? hit.hourly_rate : Number(fallback ?? 0);
}

// Azúcar para el caso normal en nómina: una semana de pago entera cobra a la
// tarifa vigente el miércoles en que arranca. Esto es exacto (y no una
// aproximación) porque la tabla obliga a que toda vigencia caiga miércoles,
// así que ninguna puede empezar a mitad de semana y partirla en dos tarifas.
export function rateForWeek(ratesByTech, technicianId, weekStartKey, fallback = 0) {
  return rateOn(ratesByTech, technicianId, weekStartKey, fallback);
}

// La tarifa de hoy, para las pantallas que muestran "tarifa actual" en vez de
// calcular dinero de un período. Se resuelve por fecha y no leyendo
// technicians.hourly_rate porque una vigencia futura ya registrada (un
// aumento que entra el miércoles) no debe mostrarse como la de hoy.
export function currentRate(ratesByTech, technicianId, fallback = 0) {
  return rateOn(ratesByTech, technicianId, todayPRKey(), fallback);
}

// Mismo criterio de día que lib/hours.js prDayKey: el día natural en Puerto
// Rico, no el del servidor ni el de UTC.
export function todayPRKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Puerto_Rico' });
}

// La vigencia que el formulario ofrece por defecto: el miércoles que arranca
// la semana SIGUIENTE a la de `dayKey` (hoy si no se pasa nada). Ajustar la
// tarifa no le toca a nadie la semana que ya está por cobrarse.
export function nextWeekEffectiveFrom(dayKey = todayPRKey()) {
  const d = new Date(dayKey + 'T00:00:00');
  const daysSinceWed = (d.getDay() + 4) % 7;
  d.setDate(d.getDate() - daysSinceWed + 7);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
