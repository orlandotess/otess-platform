'use client';
import { useState } from 'react';
import MantenimientoForm from './MantenimientoForm';
import MantenimientoActions from './MantenimientoActions';

const FREQ_LABELS = { weekly: 'Semanal', monthly: 'Mensual', quarterly: 'Trimestral', yearly: 'Anual' };
const DOW_LABELS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function cadenceLabel(r) {
  return r.frequency === 'weekly'
    ? `Cada ${DOW_LABELS[r.day_of_week] ?? ''}`
    : `${FREQ_LABELS[r.frequency] ?? r.frequency} · día ${r.day_of_month}`;
}

function technicianNames(r) {
  const names = [r.technicians?.name, ...(r.recurring_maintenance_technicians ?? []).map(t => t.technicians?.name)].filter(Boolean);
  return names.length ? names.join(', ') : '— Sin asignar —';
}

export default function MantenimientosClient({ recurring: initial, technicians, clients, clientProperties }) {
  const [rows, setRows] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' });

  function handleSaved(row) {
    setRows(prev => {
      const exists = prev.some(r => r.id === row.id);
      return exists ? prev.map(r => r.id === row.id ? row : r) : [row, ...prev];
    });
    setShowForm(false);
    setEditing(null);
  }

  function handleToggled(updated) {
    setRows(prev => prev.map(r => r.id === updated.id ? { ...r, active: updated.active } : r));
  }

  function handleDeleted(id) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function startEdit(r) {
    setEditing(r);
    setShowForm(false);
  }

  const formOpen = showForm || editing;

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        {!formOpen && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nuevo mantenimiento recurrente</button>
        )}
      </div>

      {formOpen && (
        <MantenimientoForm
          editing={editing}
          technicians={technicians}
          clients={clients}
          clientProperties={clientProperties}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="card" style={{ padding: rows.length === 0 ? undefined : 0 }}>
        {rows.length === 0 ? (
          <div className="empty"><p>No hay mantenimientos recurrentes todavía.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Título</th>
                  <th>Técnicos</th>
                  <th>Frecuencia</th>
                  <th>Próxima visita</th>
                  <th>Checklist</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.clients?.name ?? '—'}</td>
                    <td>{r.title}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{technicianNames(r)}</td>
                    <td style={{ fontSize: 13 }}>{cadenceLabel(r)}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{fmtDate(r.next_run_date)}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{(r.recurring_maintenance_items ?? []).length} ítem{(r.recurring_maintenance_items ?? []).length === 1 ? '' : 's'}</td>
                    <td><span className="badge" style={{ color: r.active ? 'var(--ok)' : 'var(--ink-faint)' }}>{r.active ? 'Activo' : 'Pausado'}</span></td>
                    <td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button onClick={() => startEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>✏️</button>
                      <MantenimientoActions id={r.id} active={r.active} onToggled={handleToggled} onDeleted={handleDeleted} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
