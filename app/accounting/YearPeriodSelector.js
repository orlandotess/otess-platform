'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { withParams } from './updatePeriodParams';

export default function YearPeriodSelector({ year }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentYear = new Date().getFullYear();

  function go(y) {
    const qs = withParams(searchParams, { yyear: y });
    router.push(`/accounting?${qs}#ano-seleccionado`);
    setOpen(false);
  }

  const years = [];
  for (let y = currentYear - 4; y <= currentYear + 1; y++) years.push(y);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 16, fontWeight: 800, color: 'var(--navy)' }}
      >
        📆 Año {year}
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>▾</span>
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 8, background: '#fff', border: '1.5px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.15)', padding: 14, zIndex: 21, width: 240 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => go(year - 1)}>‹</button>
              <strong style={{ fontSize: 14, color: 'var(--navy)' }}>Seleccionar año</strong>
              <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => go(year + 1)}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
              {years.map(y => (
                <button
                  key={y}
                  type="button"
                  onClick={() => go(y)}
                  style={{
                    padding: '8px 4px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                    border: y === year ? '2px solid var(--amber)' : '1px solid var(--border)',
                    background: y === year ? '#fff8e6' : '#fff',
                    color: y === year ? 'var(--navy)' : 'var(--text)',
                  }}
                >
                  {y}
                </button>
              ))}
            </div>
            {year !== currentYear && (
              <button type="button" className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 13 }} onClick={() => go(currentYear)}>
                Volver al año actual
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
