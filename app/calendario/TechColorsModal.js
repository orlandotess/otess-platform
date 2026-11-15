'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '../../lib/supabase';
import { TECH_PALETTE } from '../../lib/techColors';

// "🎨 Colores" del Calendario: la oficina escoge el color de cada empleado de
// una paleta fija (lib/techColors.js). Se guarda en technicians.color y se usa
// en todos los calendarios (Calendario, Dashboard y Dispatch). Un color que ya tiene otro empleado se marca, pero no se
// bloquea. "Automático" vuelve al color que se asignaba solo.
export default function TechColorsModal({ technicians, colors, chosen, onChange, onClose }) {
  const t = useTranslations('calendario.techColors');
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

  async function pick(techId, color) {
    setSavingId(techId);
    setError('');
    const { error: err } = await supabase.from('technicians').update({ color }).eq('id', techId);
    setSavingId(null);
    if (err) { setError(t('saveError', { error: err.message })); return; }
    onChange(techId, color);
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>🎨 {t('title')}</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>{t('subtitle')}</p>
        {error && <p style={{ fontSize: 13, color: 'var(--warn)', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {technicians.map(tech => {
            const current = colors[tech.id];
            const isAuto = !chosen[tech.id];
            return (
              <div key={tech.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: current, padding: '3px 10px', borderRadius: 6 }}>{tech.name}</span>
                  {isAuto && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t('automatic')}</span>}
                  {savingId === tech.id && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t('saving')}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {TECH_PALETTE.map(c => {
                    const selected = !isAuto && current.toLowerCase() === c.toLowerCase();
                    const usedBy = technicians.filter(o => o.id !== tech.id && (colors[o.id] ?? '').toLowerCase() === c.toLowerCase()).map(o => o.name);
                    return (
                      <button key={c} type="button" disabled={savingId === tech.id} onClick={() => pick(tech.id, c)}
                        aria-label={usedBy.length ? t('swatchUsed', { color: c, names: usedBy.join(', ') }) : t('swatch', { color: c })}
                        title={usedBy.length ? t('usedBy', { names: usedBy.join(', ') }) : c}
                        style={{ position: 'relative', width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0,
                          border: selected ? '3px solid var(--text)' : '2px solid var(--surface)', boxShadow: selected ? '0 0 0 2px var(--surface)' : '0 0 0 1px var(--border)' }}>
                        {usedBy.length > 0 && !selected && (
                          <span aria-hidden style={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: '50%', background: 'var(--surface)', border: '2px solid var(--muted)' }} />
                        )}
                      </button>
                    );
                  })}
                  {!isAuto && (
                    <button type="button" className="btn btn-ghost" disabled={savingId === tech.id} onClick={() => pick(tech.id, null)} style={{ fontSize: 11.5, padding: '4px 10px' }}>
                      {t('reset')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 18 }}>
          <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', border: '2px solid var(--muted)', verticalAlign: 'middle', marginRight: 6 }} />
          {t('usedLegend')}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>{t('done')}</button>
        </div>
      </div>
    </div>
  );
}
