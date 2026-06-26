'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Sidebar from '../../Sidebar';

const TAX = { final_product: 0.115, final_labor: 0.115, b2b_product: 0.115, b2b_labor: 0.04 };

export default function NuevoTrabajo() {
  const router = useRouter();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ client_id: '', title: '', description: '', status: 'estimate', scheduled_start: '', scheduled_end: '', notes: '' });
  const [items, setItems] = useState([{ type: 'labor', description: '', quantity: 1, unit_price: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('clients').select('id, name, client_type').order('name').then(({ data }) => setClients(data ?? []));
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const selectedClient = clients.find(c => c.id === form.client_id);
  const clientType = selectedClient?.client_type ?? 'final';

  const addItem = () => setItems(i => [...i, { type: 'labor', description: '', quantity: 1, unit_price: '' }]);
  const removeItem = idx => setItems(i => i.filter((_, n) => n !== idx));
  const setItem = (idx, k, v) => setItems(i => i.map((it, n) => n === idx ? { ...it, [k]: v } : it));

  const calcTotals = () => {
    let subProd = 0, taxProd = 0, subLabor = 0, taxLabor = 0;
    items.forEach(it => {
      const base = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
      const rate = TAX[`${clientType}_${it.type}`] ?? 0.115;
      if (it.type === 'product') { subProd += base; taxProd += base * rate; }
      else { subLabor += base; taxLabor += base * rate; }
    });
    return { subProd, taxProd, subLabor, taxLabor, total: subProd + taxProd + subLabor + taxLabor };
  };

  const t = calcTotals();
  const fmt = n => `$${n.toFixed(2)}`;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_id || !form.title.trim()) { setError('Cliente y título son requeridos'); return; }
    setSaving(true); setError('');
    const { data: job, error: err } = await supabase.from('jobs').insert([{
      client_id: form.client_id, title: form.title, description: form.description || null,
      status: form.status, notes: form.notes || null,
      scheduled_start: form.scheduled_start || null, scheduled_end: form.scheduled_end || null,
    }]).select().single();
    if (err) { setError(err.message); setSaving(false); return; }
    const lineItems = items.filter(i => i.description.trim()).map((i, idx) => ({
      job_id: job.id, type: i.type, description: i.description,
      quantity: parseFloat(i.quantity) || 1, unit_price: parseFloat(i.unit_price) || 0,
      sort_order: idx,
    }));
    if (lineItems.length) await supabase.from('job_line_items').insert(lineItems);
    router.push(`/trabajos/${job.id}`);
  }

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header"><div className="page-title">Nuevo trabajo</div></div>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && <p style={{ color: 'var(--warn)', fontSize: 14 }}>{error}</p>}
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Información general</p>
              <div className="form-group">
                <label>Cliente *</label>
                <select value={form.client_id} onChange={e => set('client_id', e.target.value)}>
                  <option value="">— Seleccionar cliente —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.client_type === 'b2b' ? ' (B2B)' : ''}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Título del trabajo *</label>
                <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ej: Instalación cámaras CCTV" />
              </div>
              <div className="form-group">
                <label>Estado</label>
                <select value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="estimate">Estimado</option>
                  <option value="scheduled">Programado</option>
                  <option value="in_progress">En progreso</option>
                  <option value="completed">Completado</option>
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Fecha inicio</label>
                  <input type="datetime-local" value={form.scheduled_start} onChange={e => set('scheduled_start', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Fecha fin</label>
                  <input type="datetime-local" value={form.scheduled_end} onChange={e => set('scheduled_end', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Notas</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notas internas del trabajo..." />
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Líneas de trabajo</p>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addItem}>+ Agregar línea</button>
              </div>
              {items.map((item, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 70px 100px 32px', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                  <select value={item.type} onChange={e => setItem(idx, 'type', e.target.value)} style={{ fontSize: 13 }}>
                    <option value="labor">Labor</option>
                    <option value="product">Producto</option>
                  </select>
                  <input value={item.description} onChange={e => setItem(idx, 'description', e.target.value)} placeholder="Descripción..." style={{ fontSize: 13 }} />
                  <input type="number" value={item.quantity} onChange={e => setItem(idx, 'quantity', e.target.value)} placeholder="Cant." style={{ fontSize: 13 }} min="0" step="0.01" />
                  <input type="number" value={item.unit_price} onChange={e => setItem(idx, 'unit_price', e.target.value)} placeholder="Precio" style={{ fontSize: 13 }} min="0" step="0.01" />
                  <button type="button" onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
                </div>
              ))}
            </div>
          </div>

          {/* IVU Summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Resumen IVU</p>
              {clientType === 'b2b' && (
                <div style={{ background: '#e8eeff', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#2a4cb5', fontWeight: 600 }}>
                  Cliente B2B — Labor al 4%
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Subtotal productos</span>
                  <span>{fmt(t.subProd)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>IVU productos (11.5%)</span>
                  <span>{fmt(t.taxProd)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Subtotal labor</span>
                  <span>{fmt(t.subLabor)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>IVU labor ({clientType === 'b2b' ? '4%' : '11.5%'})</span>
                  <span>{fmt(t.taxLabor)}</span>
                </div>
                <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
                  <span>Total</span>
                  <span style={{ color: 'var(--navy)' }}>{fmt(t.total)}</span>
                </div>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? 'Guardando...' : 'Guardar trabajo'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => router.back()} style={{ width: '100%', justifyContent: 'center' }}>Cancelar</button>
          </div>
        </form>
      </main>
    </div>
  );
}
