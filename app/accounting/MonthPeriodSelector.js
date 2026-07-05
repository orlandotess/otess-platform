'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { withParams } from './updatePeriodParams';

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function MonthPeriodSelector({ year, month }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(y, m) {
    const qs = withParams(searchParams, { myear: y, mmonth: m });
    router.push(`/accounting?${qs}#mes-seleccionado`);
    setOpen(false);
  }

  const now = new Date();
  const isCurrent = year === now.getFullYear() && month === now.getMonth();

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 16, fontWeight: 800, color: 'var(--navy)' }}
      >
        🗓 {MONTHS_ES[month]} {year}
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>▾</span>
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 8, background: '#fff', border: '1.5px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.15)', padding: 14, zIndex: 21, width: 260 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => go(year - 1, month)}>‹</button>
              <strong style={{ fontSize: 14, color: 'var(--navy)' }}>{year}</strong>
              <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => go(year + 1, month)}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
              {MONTHS_ES.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => go(year, i)}
                  style={{
                    padding: '8px 4px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                    border: i === month ? '2px solid var(--amber)' : '1px solid var(--border)',
                    background: i === month ? '#fff8e6' : '#fff',
                    color: i === month ? 'var(--navy)' : 'var(--text)',
                  }}
                >
                  {m.slice(0, 3)}
                </button>
              ))}
            </div>
            {!isCurrent && (
              <button type="button" className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 13 }} onClick={() => go(now.getFullYear(), now.getMonth())}>
                Volver al mes actual
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
