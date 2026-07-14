'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

export default function FaseDetalle({ phaseGroups, canEdit }) {
  const labels = Object.keys(phaseGroups);
  const [activeLabel, setActiveLabel] = useState(labels[0]);
  const [groups, setGroups] = useState(phaseGroups);
  const [printMode, setPrintMode] = useState(false);

  // The "Descargar PDF" button snapshots whatever is on screen, but the
  // selector only shows one phase at a time — expand every phase for the
  // duration of the capture so the PDF still has the full report.
  useEffect(() => {
    function expand() { setPrintMode(true); }
    function restore() { setPrintMode(false); }
    window.addEventListener('otess:print-start', expand);
    window.addEventListener('otess:print-end', restore);
    return () => {
      window.removeEventListener('otess:print-start', expand);
      window.removeEventListener('otess:print-end', restore);
    };
  }, []);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editPhase, setEditPhase] = useState('');
  const [saving, setSaving] = useState(false);

  function startEdit(n) {
    setEditingId(n.id);
    setEditTitle(n.title ?? '');
    setEditNote(n.note ?? '');
    setEditPhase(n.phase_number != null ? String(n.phase_number) : '');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle('');
    setEditNote('');
    setEditPhase('');
  }

  async function saveEdit(noteId) {
    setSaving(true);
    const note = editNote.trim() || null;
    const title = editTitle.trim() || null;
    const phase_number = editPhase !== '' ? parseInt(editPhase, 10) : null;
    const { error } = await supabase.from('job_notes').update({ note, title, phase_number }).eq('id', noteId);
    setSaving(false);
    if (error) { alert('No se pudo guardar: ' + error.message); return; }

    setGroups(prev => {
      const next = {};
      Object.values(prev).flat().forEach(n => {
        const updated = n.id === noteId ? { ...n, note, title, phase_number } : n;
        const key = updated.phase_number != null ? `Fase ${updated.phase_number}` : 'General';
        if (!next[key]) next[key] = [];
        next[key].push(updated);
      });
      return next;
    });
    setActiveLabel(prev => {
      const key = phase_number != null ? `Fase ${phase_number}` : 'General';
      return key;
    });
    cancelEdit();
  }

  function renderNotes(notesInGroup) {
    return (
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {notesInGroup.map(n => (
          <li key={n.id} style={{ fontSize: 14, color: '#444', lineHeight: 1.7, marginBottom: 4, listStyle: editingId === n.id ? 'none' : 'disc', marginLeft: editingId === n.id ? -20 : 0 }}>
            {editingId === n.id ? (
              <div style={{ marginBottom: 10, padding: 12, background: '#fafafa', borderRadius: 8, border: '1px solid #eee' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Título (opcional)"
                    style={{ flex: 1, padding: '6px 10px', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 13, fontWeight: 600, outline: 'none' }} />
                  <input type="number" value={editPhase} onChange={e => setEditPhase(e.target.value)} placeholder="Fase #"
                    style={{ width: 80, padding: '6px 10px', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 13, outline: 'none' }} />
                </div>
                <textarea autoFocus value={editNote} onChange={e => setEditNote(e.target.value)} rows={3}
                  style={{ width: '100%', padding: '6px 10px', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" disabled={saving} onClick={() => saveEdit(n.id)}
                    style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#16223d', color: '#fff' }}>
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button type="button" onClick={cancelEdit}
                    style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', cursor: 'pointer', background: '#fff', color: '#666' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <span>
                {n.title && <strong style={{ color: '#16223d' }}>{n.title}{n.note ? ': ' : ''}</strong>}
                {n.note}
                {canEdit && (
                  <button type="button" data-html2canvas-ignore="true" onClick={() => startEdit(n)} title="Editar"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 12, marginLeft: 8 }}>
                    ✏️
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (printMode) {
    return (
      <div>
        {Object.entries(groups).map(([label, notesInGroup]) => (
          <div key={label} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#16223d', display: 'inline-block', padding: '4px 12px', borderRadius: 20, marginBottom: 10 }}>{label}</div>
            {renderNotes(notesInGroup)}
          </div>
        ))}
      </div>
    );
  }

  const activeNotes = groups[activeLabel] ?? [];

  return (
    <div>
      {labels.length > 1 && (
        <div data-html2canvas-ignore="true" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {Object.keys(groups).map(label => (
            <button key={label} type="button" onClick={() => setActiveLabel(label)}
              style={{
                fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                background: activeLabel === label ? '#16223d' : '#f0f0f0',
                color: activeLabel === label ? '#fff' : '#666',
              }}>
              {label}
            </button>
          ))}
        </div>
      )}
      {labels.length <= 1 && activeLabel && (
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#16223d', display: 'inline-block', padding: '4px 12px', borderRadius: 20, marginBottom: 10 }}>{activeLabel}</div>
      )}
      {renderNotes(activeNotes)}
    </div>
  );
}
