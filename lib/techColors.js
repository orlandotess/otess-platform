// Color de cada empleado en todos los calendarios de la app (Calendario,
// calendario del Dashboard y Dispatch) — una sola regla para todos. Ver migrations/2026-11-15-technicians-color.sql.
//
// TECH_PALETTE es lo que la oficina puede escoger. Los trabajos se pintan con
// letra blanca sobre este color, así que todos tienen contraste ≥ 4.5 con
// blanco (lo mínimo recomendado para texto). No añadir colores claros.
export const TECH_PALETTE = [
  '#16223d', // azul marino
  '#2a4cb5', // azul
  '#0e7490', // turquesa
  '#2f7d5c', // verde
  '#4d7c0f', // verde oliva
  '#b45309', // ámbar
  '#c2410c', // naranja
  '#b91c1c', // rojo
  '#be185d', // rosa
  '#7c3aed', // violeta
  '#6b3fa0', // morado
  '#4b5563', // gris
];

// Los colores que el Calendario asignaba solo, antes de que se pudieran
// escoger. Se conservan para quien todavía no tiene uno: así nadie cambia de
// color hasta que alguien lo escoja.
const LEGACY_COLORS = [
  '#16223d', '#e0972c', '#27ae60', '#2a4cb5', '#e05c2a',
  '#8e44ad', '#16a085', '#c0392b', '#d35400', '#1abc9c', '#c1501f',
];

const HEX = /^#[0-9a-fA-F]{6}$/;

// Hash del id, no del orden en la lista: el color no cambia si se añade o se
// quita a otro empleado.
function legacyColor(id) {
  let hash = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return LEGACY_COLORS[hash % LEGACY_COLORS.length];
}

export function techColorOf(tech) {
  if (!tech) return null;
  return tech.color && HEX.test(tech.color) ? tech.color : legacyColor(tech.id);
}

// { [techId]: color } para pintar una lista de empleados.
export function techColorMap(technicians = []) {
  const map = {};
  for (const tech of technicians) map[tech.id] = techColorOf(tech);
  return map;
}
