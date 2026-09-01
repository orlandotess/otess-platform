import { supabase } from './supabase';
import { compressPhoto } from './compressImage';
import { uploadFileWithProgress } from './uploadWithProgress';

// Puerta única del bucket Job-photos. Comprime y normaliza a JPEG antes de subir
// (ver compressPhoto), y devuelve la ruta DEFINITIVA — cuando la foto se
// reencoda, la extensión cambia a .jpg, así que el que llama tiene que guardar
// en base de datos la ruta que devuelve esta función, no la que le pasó.
//
// Devuelve { path, error } con la misma forma que storage.upload(), para que el
// manejo de errores que ya existe en cada formulario siga funcionando igual: una
// foto que el navegador no puede leer llega aquí como error en vez de guardarse
// como un archivo que después nadie podrá abrir.
export async function uploadJobPhoto(path, file, { upsert = false, contentType = null, onProgress = null } = {}) {
  let listo;
  try {
    listo = await compressPhoto(file);
  } catch (error) {
    return { path: null, error };
  }

  // Solo cambia la extensión si de verdad hubo reencodado.
  const finalPath = listo !== file && listo.type === 'image/jpeg'
    ? path.replace(/\.[^./]+$/, '') + '.jpg'
    : path;

  // La barra de progreso necesita XHR en vez de fetch; ese helper solo sube.
  if (onProgress) {
    const { error } = await uploadFileWithProgress('Job-photos', finalPath, listo, onProgress);
    return { path: error ? null : finalPath, error };
  }

  const opciones = { upsert };
  if (contentType ?? listo.type) opciones.contentType = contentType ?? listo.type;
  const { error } = await supabase.storage.from('Job-photos').upload(finalPath, listo, opciones);
  return { path: error ? null : finalPath, error };
}
