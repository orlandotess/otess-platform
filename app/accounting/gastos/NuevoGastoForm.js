'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';

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

function jobLabel(j) { return `${j.job_number ? j.job_number + ' — ' : ''}${j.title}`; }

export default function NuevoGastoForm({ jobs = [], onSaved, onCancel }) {
  const [jobSearch, setJobSearch] = useState('');
  const [jobId, setJobId] = useState('');
  const [form, setForm] = useState({
    category: 'materiales',
    description: '',
    vendor: '',
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleJobSearchChange(value) {
    setJobSearch(value);
    const match = jobs.find(j => jobLabel(j) === value);
    setJobId(match ? match.id : '');
  }

  function handlePhoto(file) {
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function save() {
    if (!form.description.trim() || !form.amount) return;
    setSaving(true);
    let receiptPath = null;
    if (photoFile) {
      const ext = photoFile.name.split('.').pop();
      const path = jobId ? `${jobId}/expenses/${Date.now()}.${ext}` : `general/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, photoFile);
      if (!upErr) receiptPath = path;
    }
    const { data } = await supabase.from('expenses').insert([{
      job_id: jobId || null,
      category: form.category,
      description: form.description.trim(),
      vendor: form.vendor.trim() || null,
      amount: parseFloat(form.amount) || 0,
      expense_date: form.expense_date,
      receipt_url: receiptPath,
    }]).select('*, jobs(title, job_number)').single();
    setSaving(false);
    if (data && onSaved) onSaved(data);
  }

  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--amber)' }}>
      <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Nuevo gasto</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div className="form-group">
          <label>Categoría</label>
          <select value={form.category} onChange={e => set('category', e.target.value)}>
            {expenseCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Fecha</label>
          <input type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)} />
        </div>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label>Descripción</label>
          <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ej: Cable THHN, gasolina de la semana, taladro nuevo..." />
        </div>
        <div className="form-group">
          <label>Suplidor (opcional)</label>
          <input value={form.vendor} onChange={e => set('vendor', e.target.value)} placeholder="Ej: Home Depot" />
        </div>
        <div className="form-group">
          <label>Monto</label>
          <input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" />
        </div>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label>Trabajo (opcional — deja vacío para gasto general)</label>
          <input list="gasto-job-datalist" value={jobSearch} onChange={e => handleJobSearchChange(e.target.value)} placeholder="Buscar trabajo por número o título..." />
          <datalist id="gasto-job-datalist">
            {jobs.map(j => <option key={j.id} value={jobLabel(j)} />)}
          </datalist>
        </div>
      </div>

      {photoPreview && (
        <img src={photoPreview} alt="recibo" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, marginBottom: 12 }} />
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
          📷 Recibo
          <input type="file" accept="image/*" onChange={e => handlePhoto(e.target.files?.[0])} style={{ display: 'none' }} />
        </label>
        <button className="btn btn-primary" onClick={save} disabled={saving || !form.description.trim() || !form.amount}>
          {saving ? 'Guardando...' : '💾 Guardar'}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
