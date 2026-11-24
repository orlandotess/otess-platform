// Campos de una partida que son solo para la oficina: lo que nos costó, el
// precio de lista y a quién se le compró. Las páginas públicas (propuesta,
// orden de cambio) le pasan las partidas a componentes 'use client', y Next.js
// serializa en el HTML todo lo que va en esos props — aunque no se pinte en
// pantalla. Por eso hay que quitarlos antes, no basta con no mostrarlos.
const CAMPOS_INTERNOS = ['supplier_price', 'msrp', 'vendor'];

export function sinDatosInternos(item) {
  const limpio = { ...item };
  for (const campo of CAMPOS_INTERNOS) delete limpio[campo];
  return limpio;
}
