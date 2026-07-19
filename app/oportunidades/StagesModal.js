'use client';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

const DIACRITICS_RE = new RegExp('[̀-ͯ]', 'g');

function slugify(s) {
  const base = s.toLowerCase().trim()
    .normalize('NFD').replace(DIACRITICS_RE, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (base || 'etapa') + '_' + Date.now().toString(36).slice(-4);
}

export default function StagesModal({ stages, opportunityCounts, onClose, onSaved }) {
  const [rows, setRows] = useState(stages.map(s => ({ ...s })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateLabel(i, label) {
    setRows(r => r.map((row, idx) => idx === i ? { ...row, label } : row));
  }

  function move(i, dir) {
    setRows(r => {
      const next = [...r];
      const j = i + dir;
      if (j < 0 || j >= next.length) return r;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function addStage() {
    setRows(r => [...r, { id: null, key: slugify('Nueva etapa'), label: 'Nueva etapa' }]);
  }

  function removeStage(i) {
    const row = rows[i];
    if (opportunityCounts[row.key] > 0) {
      alert(`"${row.label}" tiene ${opportunityCounts[row.key]} oportunidad(es). Muévelas a otra etapa antes de eliminarla.`);
      return;
    }
    setRows(r => r.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (rows.length === 0) { setError('Debe haber al menos una etapa'); return; }
    if (rows.some(r => !r.label.trim())) { setError('Todas las etapas necesitan un nombre'); return; }
    setSaving(true);
    setError('');

    const upsertRows = rows.map((r, i) => ({ key: r.key, label: r.label.trim(), position: i }));
    const { error: upErr } = await supabase.from('opportunity_stages').upsert(upsertRows, { onConflict: 'key' });
    if (upErr) { setError(upErr.message); setSaving(false); return; }

    const removedKeys = stages.map(s => s.key).filter(k => !rows.some(r => r.key === k));
    if (removedKeys.length) {
      const { error: delErr } = await supabase.from('opportunity_stages').delete().in('key', removedKeys);
      if (delErr) { setError('No se pudieron eliminar algunas etapas: ' + delErr.message); setSaving(false); return; }
    }

    const { data: fresh, error: refErr } = await supabase.from('opportunity_stages').select('id, key, label, position').order('position');
    if (refErr) { setError(refErr.message); setSaving(false); return; }
    onSaved(fresh);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 460, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>Configurar Etapas</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
        </div>

        {error && <p style={{ color: 'var(--warn)', marginBottom: 14, fontSize: 13.5 }}>{error}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {rows.map((row, i) => (
            <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                  style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.3 : 1, fontSize: 12, lineHeight: 1, color: 'var(--muted)' }}>▲</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1}
                  style={{ background: 'none', border: 'none', cursor: i === rows.length - 1 ? 'default' : 'pointer', opacity: i === rows.length - 1 ? 0.3 : 1, fontSize: 12, lineHeight: 1, color: 'var(--muted)' }}>▼</button>
              </div>
              <input value={row.label} onChange={e => updateLabel(i, e.target.value)} style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 20, textAlign: 'right' }}>{opportunityCounts[row.key] ?? 0}</span>
              <button type="button" onClick={() => removeStage(i)} title="Eliminar etapa"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warn)', fontSize: 16, padding: '0 4px' }}>×</button>
            </div>
          ))}
        </div>

        <button type="button" className="btn btn-ghost btn-sm" onClick={addStage} style={{ marginBottom: 18 }}>+ Agregar etapa</button>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
            {saving ? 'Guardando...' : '💾 Guardar'}
          </button>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
