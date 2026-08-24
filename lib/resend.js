import { Resend } from 'resend';

let client = null;

// Perezoso a propósito. Construir el cliente al importar el módulo — que es
// como estaban las 22 rutas — hace que `new Resend(undefined)` lance durante
// la carga cuando falta RESEND_API_KEY, y entonces:
//   - la ruta entera falla al cargarse y el navegador recibe HTML en vez de
//     JSON, que el frontend reportaba como "Error de conexión";
//   - `next build` aborta en "Collecting page data", así que el proyecto no
//     compilaba en local sin la clave.
// Difiriéndolo al primer uso, la ruta carga siempre y el fallo ocurre donde
// se puede manejar y explicar.
export function getResend() {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}
