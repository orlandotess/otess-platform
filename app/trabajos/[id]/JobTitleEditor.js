'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function JobTitleEditor({ jobId, title: initialTitle }) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [title, setTitle] = useState(initialTitle || '');
  const [saving, setSaving] = useState(false);

  async function saveTitle(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    await supabase.from('jobs').update({ title: title.trim() }).eq('id', jobId);
    setSaving(false);
    setShowEdit(false);
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="page-title">{initialTitle}</div>
      <button
        className="btn btn-ghost"
        style={{ padding: '4px 10px', fontSize: 13 }}
        onClick={() => { setTitle(initialTitle || ''); setShowEdit(true); }}
        title="Editar nombre del trabajo"
      >
        ✏️
      </button>

      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 420 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Editar nombre del trabajo</h2>
            <form onSubmit={saveTitle}>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label>Nombre</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Sistema de cámaras - Oficina Principal" autoFocus required />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEdit(false)} disabled={saving}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
