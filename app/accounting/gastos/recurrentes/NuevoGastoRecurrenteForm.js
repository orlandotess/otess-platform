'use client';
import { useState } from 'react';
import { supabase } from '../../../../lib/supabase';

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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function NuevoGastoRecurrenteForm({ onSaved, onCancel }) {
  const [form, setForm] = useState({
    category: 'oficina',
    description: '',
    vendor: '',
    amount: '',
    frequency: 'monthly',
    next_run_date: todayISO(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.description.trim() || !form.amount || !form.next_run_date) {
      setError('Completa descripción, monto y próximo envío');
      return;
    }
    setSaving(true);
    setError('');
    const runDate = new Date(form.next_run_date + 'T00:00:00');
    const { data, error: err } = await supabase.from('recurring_expenses').insert([{
      category: form.category,
      description: form.description.trim(),
      vendor: form.vendor.trim() || null,
      amount: parseFloat(form.amount) || 0,
      frequency: form.frequency,
      day_of_month: form.frequency === 'weekly' ? null : runDate.getDate(),
      day_of_week: form.frequency === 'weekly' ? runDate.getDay() : null,
      next_run_date: form.next_run_date,
      active: true,
    }]).select().single();
    setSaving(false);
    if (err) { setError(err.message); return; }
    if (data && onSaved) onSaved(data);
  }

  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--amber)' }}>
      <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Nuevo gasto recurrente</p>
      {error && <p style={{ color: 'var(--warn)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div className="form-group">
          <label>Categoría</label>
          <select value={form.category} onChange={e => set('category', e.target.value)}>
            {expenseCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Frecuencia</label>
          <select value={form.frequency} onChange={e => set('frequency', e.target.value)}>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensual</option>
            <option value="quarterly">Trimestral</option>
            <option value="yearly">Anual</option>
          </select>
        </div>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label>Descripción</label>
          <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ej: Póliza de seguros, celular..." />
        </div>
        <div className="form-group">
          <label>Suplidor (opcional)</label>
          <input value={form.vendor} onChange={e => set('vendor', e.target.value)} placeholder="Ej: AT&T" />
        </div>
        <div className="form-group">
          <label>Monto</label>
          <input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" />
        </div>
        <div className="form-group">
          <label>Próximo envío</label>
          <input type="date" value={form.next_run_date} onChange={e => set('next_run_date', e.target.value)} />
        </div>
      </div>

      <div style={{ background: '#f8f9fb', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
        Se registrará automáticamente como gasto general cada vez que llegue esta fecha, y luego se repetirá según la frecuencia elegida.
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || !form.description.trim() || !form.amount}>
          {saving ? 'Guardando...' : '💾 Guardar'}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
