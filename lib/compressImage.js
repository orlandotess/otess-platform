// Toda foto que entra a la plataforma sale de aquí como JPEG, venga del iPhone
// que dispara HEIC o del Android que dispara JPEG. Antes esto confiaba en el
// nombre del archivo y en el `type` que declara el navegador, y así se colaron
// archivos HEIC llamados ".jpeg": Safari los mostraba, Chrome y Android los
// dejaban en blanco, y el redimensionador de Supabase devolvía 500. El formato
// se decide por los bytes justamente para que eso no vuelva a pasar.
//
// Las fotos de un teléfono llegan a 4032x3024 y 3-10 MB. Se reducen a MAX_EDGE
// por el lado largo, que es de sobra para lo que la app muestra e imprime.
//
// Pasan intactos los que no son imágenes (videos, PDFs) y las imágenes que ya
// son web y son lo bastante pequeñas. Lo que es imagen pero no se puede
// decodificar lanza UnsupportedImageError: es preferible que el técnico se
// entere en el momento a guardar un archivo que nadie podrá abrir después.
const MAX_EDGE = 2560;
const QUALITY = 0.82;
const SKIP_BELOW_BYTES = 500 * 1024;

export class UnsupportedImageError extends Error {
  constructor(kind) {
    super(`No se pudo leer esta imagen (formato ${kind}). Intenta tomar la foto de nuevo o convertirla a JPG.`);
    this.name = 'UnsupportedImageError';
    this.code = 'unsupported_image';
    this.kind = kind;
  }
}

// Los formatos que el <canvas> puede reencodar directamente.
const WEB_IMAGE = new Set(['jpeg', 'png', 'gif', 'webp', 'avif']);

// El formato real se decide por los bytes, nunca por la extensión ni por
// file.type: un HEIC renombrado a .jpeg miente en los dos.
async function sniffKind(file) {
  let head;
  try {
    head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  } catch {
    return 'unknown';
  }
  if (head.length < 12) return 'unknown';
  const ascii = (from, to) => String.fromCharCode(...head.slice(from, to));

  if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) return 'jpeg';
  if (head[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (ascii(0, 3) === 'GIF') return 'gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(0, 4) === '%PDF') return 'pdf';

  // Contenedores ISO-BMFF: HEIC, AVIF y los videos comparten la caja "ftyp",
  // y solo la marca que viene justo después los distingue.
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'heic';
    if (brand === 'avif' || brand === 'avis') return 'avif';
    return 'video';
  }
  return 'unknown';
}

// Se decodifica con el motor del navegador, que cubre JPEG y PNG en todas partes
// y además HEIC en Safari — que es por donde entra el HEIC en la práctica, ya que
// lo genera el iPhone. Lo que el navegador no pueda leer se rechaza arriba en vez
// de guardarse: en 208 archivos reales el único caso fue un iPhone, donde este
// camino nativo funciona.
//
// imageOrientation 'from-image' aplica la rotación que el teléfono guarda en el
// EXIF. Sin eso, cada foto vertical se guardaría acostada para siempre.
async function decode(file) {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
}

export async function compressPhoto(file) {
  if (!file || typeof file.size !== 'number') return file;
  if (typeof document === 'undefined') return file;

  const kind = await sniffKind(file);

  // Lo que no es imagen viaja tal cual: videos, PDFs y cualquier adjunto que la
  // app permita en el futuro.
  if (kind === 'pdf' || kind === 'video') return file;
  if (kind === 'unknown') {
    // Sin firma reconocible: si el navegador tampoco lo declara como imagen,
    // no es asunto de este módulo.
    if (!file.type?.startsWith('image/')) return file;
  }

  // Un HEIC siempre se convierte, por pequeño que sea — el problema ahí es que
  // media plataforma no lo puede mostrar, no su peso.
  const yaEsWebYPequeña = WEB_IMAGE.has(kind) && file.size <= SKIP_BELOW_BYTES;
  if (yaEsWebYPequeña) return file;

  const bitmap = await decode(file);
  if (!bitmap) throw new UnsupportedImageError(kind);

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    // El JPEG no tiene canal alfa: sin un fondo blanco, lo transparente de un
    // PNG saldría negro.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) throw new UnsupportedImageError(kind);

    // Reencodar un JPEG ya optimizado puede engordarlo; en ese caso se queda el
    // original. Un HEIC se convierte igual aunque pese más: es la única forma de
    // que se vea fuera de Safari.
    if (blob.size >= file.size && kind !== 'heic') return file;

    // Las fotos anotadas llegan como Blob sin nombre; solo un File se renombra.
    if (typeof file.name !== 'string') return blob;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: file.lastModified ?? Date.now(),
    });
  } finally {
    bitmap.close?.();
  }
}
