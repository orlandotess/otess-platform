'use client';
import { useState } from 'react';

// Miniatura con respaldo. Las miniaturas salen del redimensionado de Supabase
// (createSignedUrl con `transform`). Con el Spend Cap activado y la cuota de
// transformaciones excedida, Supabase puede dejar de redimensionar; la URL
// firmada se sigue generando, pero la imagen falla al cargar y quedaría en
// blanco. Si eso pasa, se cambia una sola vez a `fallback` (el original): pesa
// más y tarda más, pero la foto se ve.
//
// Acepta todo lo que acepta <img>. Si no hay `src`, usa `fallback` directo.
export default function ThumbImg({ src, fallback, alt = '', onError, ...rest }) {
  // Se guarda QUÉ src falló, no un sí/no: si la miniatura cambia (otra foto,
  // URL re-firmada), se vuelve a intentar con la nueva.
  const [failedSrc, setFailedSrc] = useState(null);
  const useFallback = fallback && (!src || failedSrc === src);
  return (
    <img
      {...rest}
      alt={alt}
      src={useFallback ? fallback : src}
      onError={e => {
        if (!useFallback && fallback && fallback !== src) setFailedSrc(src);
        onError?.(e);
      }}
    />
  );
}
