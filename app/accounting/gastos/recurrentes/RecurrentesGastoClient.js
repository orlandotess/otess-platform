'use client';
import { useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import NuevoGastoRecurrenteForm from './NuevoGastoRecurrenteForm';
import RecurringExpenseActions from './RecurringExpenseActions';

const expenseCategories = [
  { value: 'materiales', label: 'Materiales' },
  { value: 'gasolina', label: 'Gasolina' },
  { value: 'herramientas', label: 'Herramientas' },
  { value: 'subcontratista', label: 'Subcontratista' },
  { value: 'oficina', label: 'Oficina' },
  { value: 'parking', label: 'Parking' },
  { value: 'equipos', label: 'Equipos' },
  { value: 'meals', label: 'Meals' },
  { value: 'otro', label: 'Otro' },
];

const FREQ_LABELS = { weekly: 'Semanal', monthly: 'Mensual', quarterly: 'Trimestral', yearly: 'Anual' };
const DOW_LABELS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function cadenceLabel(r) {
  return r.frequency === 'weekly'
    ? `Cada ${DOW_LABELS[r.day_of_week] ?? ''}`
    : `${FREQ_LABELS[r.frequency] ?? r.frequency} · día ${r.day_of_month}`;
}

export default function RecurrentesGastoClient({ recurring: initial, categoryLabels }) {
  const [rows, setRows] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);

  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' });

  function handleSaved(newRow) {
    setRows(prev => [newRow, ...prev]);
    setShowForm(false);
  }

  function handleToggled(updated) {
    setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
  }

  function handleDeleted(id) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function startEdit(r) {
    setEditingId(r.id);
    setEditData({
      category: r.category,
      description: r.description,
      vendor: r.vendor ?? '',
      amount: r.amount,
      frequency: r.frequency,
      next_run_date: r.next_run_date,
    });
  }

  async function saveEdit(id) {
    setSaving(true);
    const runDate = new Date(editData.next_run_date + 'T00:00:00');
    const payload = {
      category: editData.category,
      description: editData.description.trim(),
      vendor: editData.vendor.trim() || null,
      amount: parseFloat(editData.amount || 0),
      frequency: editData.frequency,
      day_of_month: editData.frequency === 'weekly' ? null : runDate.getDate(),
      day_of_week: editData.frequency === 'weekly' ? runDate.getDay() : null,
      next_run_date: editData.next_run_date,
    };
    const { data } = await supabase.from('recurring_expenses').update(payload).eq('id', id).select().single();
    setSaving(false);
    if (data) setRows(prev => prev.map(r => r.id === id ? data : r));
    setEditingId(null);
    setEditData(null);
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Nuevo gasto recurrente'}</button>
      </div>

      {showForm && (
        <NuevoGastoRecurrenteForm onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      )}

      <div className="card" style={{ padding: rows.length === 0 ? undefined : 0 }}>
        {rows.length === 0 ? (
          <div className="empty"><p>No hay gastos recurrentes todavía.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th>Descripción</th>
                  <th>Suplidor</th>
                  <th>Frecuencia</th>
                  <th>Próximo</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  if (editingId === r.id) {
                    return (
                      <tr key={r.id}>
                        <td>
                          <select value={editData.category} onChange={e => setEditData(d => ({ ...d, category: e.target.value }))} style={{ fontSize: 12 }}>
                            {expenseCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </td>
                        <td><input value={editData.description} onChange={e => setEditData(d => ({ ...d, description: e.target.value }))} style={{ fontSize: 12, width: '100%' }} /></td>
                        <td><input value={editData.vendor} onChange={e => setEditData(d => ({ ...d, vendor: e.target.value }))} style={{ fontSize: 12, width: 100 }} /></td>
                        <td>
                          <select value={editData.frequency} onChange={e => setEditData(d => ({ ...d, frequency: e.target.value }))} style={{ fontSize: 12 }}>
                            <option value="weekly">Semanal</option>
                            <option value="monthly">Mensual</option>
                            <option value="quarterly">Trimestral</option>
                            <option value="yearly">Anual</option>
                          </select>
                        </td>
                        <td><input type="date" value={editData.next_run_date} onChange={e => setEditData(d => ({ ...d, next_run_date: e.target.value }))} style={{ width: 130, fontSize: 12 }} /></td>
                        <td><input type="number" step="0.01" value={editData.amount} onChange={e => setEditData(d => ({ ...d, amount: e.target.value }))} style={{ width: 90, fontSize: 12, textAlign: 'right' }} /></td>
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>{r.active ? 'Activa' : 'Pausada'}</td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => saveEdit(r.id)} disabled={saving} className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>💾</button>
                          <button onClick={() => { setEditingId(null); setEditData(null); }} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>✕</button>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={r.id}>
                      <td><span className="badge badge-gray">{categoryLabels?.[r.category] ?? r.category}</span></td>
                      <td style={{ fontWeight: 600 }}>{r.description}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{r.vendor ?? '—'}</td>
                      <td style={{ fontSize: 13 }}>{cadenceLabel(r)}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{fmtDate(r.next_run_date)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(r.amount)}</td>
                      <td><span className="badge" style={{ color: r.active ? '#1a7a4a' : '#888' }}>{r.active ? 'Activa' : 'Pausada'}</span></td>
                      <td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button onClick={() => startEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>✏️</button>
                        <RecurringExpenseActions id={r.id} active={r.active} onToggled={handleToggled} onDeleted={handleDeleted} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
