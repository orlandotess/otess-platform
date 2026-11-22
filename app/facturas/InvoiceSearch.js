'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import SearchBox from '../SearchBox';

// Buscador de la lista de facturas: escribe el término en ?q= (con un pequeño
// retraso) para que la página del servidor filtre, conservando ?estado=.
export default function InvoiceSearch({ placeholder }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') ?? '');
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  function onChange(next) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const q = next.trim();
      if (q) params.set('q', q); else params.delete('q');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 300);
  }

  return <SearchBox value={value} onChange={onChange} placeholder={placeholder} style={{ maxWidth: 320 }} />;
}
