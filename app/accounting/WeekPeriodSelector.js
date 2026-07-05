'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { withParams } from './updatePeriodParams';

function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtRange(start) {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const opts = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString('es-PR', opts)} – ${end.toLocaleDateString('es-PR', opts)}`;
}

export default function WeekPeriodSelector({ weekStart }) {
  // weekStart: 'YYYY-MM-DD' string for the Monday of the selected week
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const startDate = new Date(`${weekStart}T00:00:00`);
  const currentMonday = mondayOf(toDateStr(new Date()));
  const isCurrent = toDateStr(startDate) === toDateStr(currentMonday);

  function go(d) {
    const qs = withParams(searchParams, { wstart: toDateStr(d) });
    router.push(`/accounting?${qs}#esta-semana`);
    setOpen(false);
  }

  function shift(days) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + days);
    go(d);
  }

  function onPickDate(e) {
    if (!e.target.value) return;
    go(mondayOf(e.target.value));
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 16, fontWeight: 800, color: 'var(--navy)' }}
      >
        📅 Semana del {fmtRange(startDate)}
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>▾</span>
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 8, background: '#fff', border: '1.5px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.15)', padding: 14, zIndex: 21, width: 260 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: 13 }} onClick={() => shift(-7)}>‹ Anterior</button>
              <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: 13 }} onClick={() => shift(7)}>Siguiente ›</button>
            </div>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>O elige cualquier día de esa semana:</label>
            <input type="date" defaultValue={weekStart} onChange={onPickDate} style={{ width: '100%', marginBottom: 12, boxSizing: 'border-box' }} />
            {!isCurrent && (
              <button type="button" className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 13 }} onClick={() => go(currentMonday)}>
                Volver a esta semana
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
