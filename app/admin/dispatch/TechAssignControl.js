'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

// Deja el primer técnico marcado como "dueño" (jobs.technician_id) y el resto
// como apoyo (job_technicians) — mismo criterio posicional que
// app/solicitudes/[id]/SolicitudTabs.js usa para solicitud_technicians.
function currentTechIds(job) {
  return [job.technician_id, ...(job.job_technicians ?? []).map(jt => jt.technician_id)].filter(Boolean);
}

export default function TechAssignControl({ job, technicians }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState(() => currentTechIds(job));
  const [saving, setSaving] = useState(false);

  function toggle(techId) {
    setIds(prev => prev.includes(techId) ? prev.filter(id => id !== techId) : [...prev, techId]);
  }

  async function save() {
    setSaving(true);
    const original = currentTechIds(job);
    await supabase.from('jobs').update({ technician_id: ids[0] ?? null }).eq('id', job.id);
    await supabase.from('job_technicians').delete().eq('job_id', job.id);
    if (ids.length > 1) {
      await supabase.from('job_technicians').insert(
        ids.slice(1).map(techId => ({ job_id: job.id, technician_id: techId }))
      );
    }
    for (const techId of ids.filter(id => !original.includes(id))) {
      fetch('/api/trabajos/notify-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, technicianId: techId }),
      }).catch(() => {});
    }
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  // Evita que dnd-kit capture el pointerdown y arranque un drag del job card
  // cuando el usuario solo quiere abrir/usar este control.
  const stop = e => e.stopPropagation();

  if (!open) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        onPointerDown={stop}
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        style={{ marginTop: 6, fontSize: 11, padding: '4px 8px' }}
      >
        👤 Asignar técnicos
      </button>
    );
  }

  return (
    <div onPointerDown={stop} onClick={stop} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {technicians.map(t => {
          const checked = ids.includes(t.id);
          return (
            <label
              key={t.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6,
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: checked ? 'var(--navy)' : 'var(--surface-2)',
                color: checked ? '#fff' : 'var(--text)',
              }}
            >
              <input type="checkbox" checked={checked} onChange={() => toggle(t.id)} style={{ margin: 0 }} />
              {t.name}
            </label>
          );
        })}
        {technicians.length === 0 && <p style={{ fontSize: 11, color: 'var(--muted)' }}>No hay técnicos registrados.</p>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={save} style={{ fontSize: 11, padding: '4px 10px' }}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          disabled={saving}
          onClick={() => { setIds(currentTechIds(job)); setOpen(false); }}
          style={{ fontSize: 11, padding: '4px 10px' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
