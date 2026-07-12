'use client';
import { useState } from 'react';
import { isoToLocalInput } from '../../lib/datetimeLocal';

const ENTRY_TYPE_ICONS = { event: '📌', reminder: '🔔', checklist: '☑' };

export default function QuickRescheduleModal({ data, saving, onClose, onSave, onViewDetails }) {
  const { type, item } = data;
  const isTask = type === 'task';
  const [form, setForm] = useState(() => isTask
    ? { due: isoToLocalInput(item.due_at) }
    : { start: isoToLocalInput(item.scheduled_start ?? item.start_at), end: isoToLocalInput(item.scheduled_end ?? item.end_at) });

  const icon = type === 'event' ? ENTRY_TYPE_ICONS.event : type === 'task' ? ENTRY_TYPE_ICONS[item.task_type] : '🔧';
  const subtitle = item.clients?.name ?? null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>{icon} {item.title}</div>
            {subtitle && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Mover fecha</div>
        {isTask ? (
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Vence</label>
            <input type="datetime-local" value={form.due} onChange={e => setForm(f => ({ ...f, due: e.target.value }))} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="form-group">
              <label>Inicio</label>
              <input type="datetime-local" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Fin</label>
              <input type="datetime-local" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <button className="btn btn-primary" onClick={() => onSave(form)} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
            {saving ? 'Guardando...' : '💾 Guardar'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
        {onViewDetails && (
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={onViewDetails}>
            Ver detalles →
          </button>
        )}
      </div>
    </div>
  );
}
