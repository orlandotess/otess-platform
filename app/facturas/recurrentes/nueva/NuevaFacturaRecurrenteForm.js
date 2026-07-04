'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Sidebar from '../../../Sidebar';

const TAX = { final_product: 0.115, final_labor: 0.115, b2b_product: 0.115, b2b_labor: 0.04 };
const DOW_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function firstRunDate(frequency, dayOfMonth, dayOfWeek) {
  const now = new Date();
  if (frequency === 'weekly') {
    const d = new Date(now);
    const delta = (dayOfWeek - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + (delta === 0 ? 7 : delta));
    return d.toISOString().split('T')[0];
  }
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dayOfMonth, lastDay));
  if (d <= now) d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

export default function NuevaFacturaRecurrenteForm() {
  const router = useRouter();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({
    client_id: '', bill_to: 'person', notes: '', terms: '',
    frequency: 'monthly', day_of_month: 1, day_of_week: 1, due_days: 15,
  });
  const [items, setItems] = useState([{ type: 'labor', description: '', quantity: 1, unit_price: '', exempt: false }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('clients').select('id, name, company, client_type, email').order('name').then(({ data }) => setClients(data ?? []));
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const selectedClient = clients.find(c => c.id === form.client_id);
  const clientType = selectedClient?.client_type ?? 'final';
  const hasCompany = !!selectedClient?.company;

  const addItem = () => setItems(i => [...i, { type: 'labor', description: '', quantity: 1, unit_price: '', exempt: false }]);
  const removeItem = idx => setItems(i => i.filter((_, n) => n !== idx));
  const setItem = (idx, k, v) => setItems(i => i.map((it, n) => n === idx ? { ...it, [k]: v } : it));

  const calcTotals = () => {
    let subProd = 0, taxProd = 0, subLabor = 0, taxLabor = 0;
    items.forEach(it => {
      const base = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
      const rate = it.exempt ? 0 : (TAX[`${clientType}_${it.type}`] ?? 0.115);
      if (it.type === 'product') { subProd += base; taxProd += base * rate; }
      else { subLabor += base; taxLabor += base * rate; }
    });
    return { subProd, taxProd, subLabor, taxLabor, total: subProd + taxProd + subLabor + taxLabor };
  };

  const t = calcTotals();
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const nextRun = firstRunDate(form.frequency, parseInt(form.day_of_month) || 1, parseInt(form.day_of_week));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_id) { setError('Selecciona un cliente'); return; }
    if (!items.some(i => i.description.trim())) { setError('Agrega al menos una línea'); return; }
    setSaving(true); setError('');

    const { data: recurring, error: err } = await supabase.from('recurring_invoices').insert([{
      client_id: form.client_id,
      bill_to: form.bill_to,
      frequency: form.frequency,
      day_of_month: form.frequency === 'weekly' ? null : (parseInt(form.day_of_month) || 1),
      day_of_week: form.frequency === 'weekly' ? parseInt(form.day_of_week) : null,
      due_days: parseInt(form.due_days) || 15,
      notes: form.notes || null,
      terms: form.terms || null,
      next_run_date: nextRun,
      active: true,
    }]).select().single();

    if (err) { setError(err.message); setSaving(false); return; }

    const lineItems = items.filter(i => i.description.trim()).map((i, idx) => ({
      recurring_invoice_id: recurring.id, type: i.type, description: i.description,
      quantity: parseFloat(i.quantity) || 1, unit_price: parseFloat(i.unit_price) || 0,
      exempt: i.exempt, sort_order: idx,
    }));

    await supabase.from('recurring_invoice_items').insert(lineItems);
    router.push('/facturas/recurrentes');
  }

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header"><div className="page-title">Nueva factura recurrente</div></div>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && <p style={{ color: 'var(--warn)', fontSize: 14 }}>{error}</p>}

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Información general</p>
              <div className="form-group">
                <label>Cliente *</label>
                <select value={form.client_id} onChange={e => { set('client_id', e.target.value); set('bill_to', 'person'); }}>
                  <option value="">— Seleccionar —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.client_type === 'b2b' ? ' (B2B)' : ''}</option>)}
                </select>
              </div>

              {hasCompany && (
                <div className="form-group" style={{ marginTop: 4 }}>
                  <label>Facturar a</label>
                  <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                      <input type="radio" name="bill_to" value="person" checked={form.bill_to === 'person'} onChange={() => set('bill_to', 'person')} />
                      {selectedClient?.name}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                      <input type="radio" name="bill_to" value="company" checked={form.bill_to === 'company'} onChange={() => set('bill_to', 'company')} />
                      {selectedClient?.company}
                    </label>
                  </div>
                </div>
              )}

              {selectedClient && !selectedClient.email && (
                <p style={{ fontSize: 12.5, color: 'var(--warn)', marginTop: 4 }}>
                  Este cliente no tiene email registrado — la factura no podrá enviarse automáticamente hasta que le agregues uno.
                </p>
              )}

              <div className="form-group">
                <label>Notas / Términos de pago</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Términos de pago, notas para el cliente..." />
              </div>
              <div className="form-group">
                <label>Términos del proyecto</label>
                <textarea value={form.terms} onChange={e => set('terms', e.target.value)} rows={4} style={{ fontSize: 13, lineHeight: 1.6 }} />
              </div>
            </div>

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Recurrencia</p>
              <div className="form-row">
                <div className="form-group">
                  <label>Frecuencia</label>
                  <select value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensual</option>
                    <option value="quarterly">Trimestral</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>
                {form.frequency === 'weekly' ? (
                  <div className="form-group">
                    <label>Día de la semana</label>
                    <select value={form.day_of_week} onChange={e => set('day_of_week', e.target.value)}>
                      {DOW_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="form-group">
                    <label>Día del mes</label>
                    <input type="number" min="1" max="28" value={form.day_of_month} onChange={e => set('day_of_month', e.target.value)} />
                  </div>
                )}
              </div>
              <div className="form-group" style={{ maxWidth: 200 }}>
                <label>Días para vencer</label>
                <input type="number" min="0" value={form.due_days} onChange={e => set('due_days', e.target.value)} />
              </div>
              <div style={{ background: '#f8f9fb', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--muted)' }}>
                Se generará y enviará automáticamente al cliente cada vez que llegue la fecha. Próximo envío: <strong style={{ color: 'var(--navy)' }}>{new Date(nextRun + 'T00:00:00').toLocaleDateString('es-PR', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Líneas de factura</p>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addItem}>+ Agregar línea</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 70px 100px 80px 32px', gap: 6, marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Tipo</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Descripción</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Cant.</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Precio</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Exento</div>
                <div></div>
              </div>

              {items.map((item, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 70px 100px 80px 32px', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                  <select value={item.type} onChange={e => setItem(idx, 'type', e.target.value)} style={{ fontSize: 13 }}>
                    <option value="labor">Labor</option>
                    <option value="product">Producto</option>
                  </select>
                  <input value={item.description} onChange={e => setItem(idx, 'description', e.target.value)} placeholder="Descripción..." style={{ fontSize: 13 }} />
                  <input type="number" value={item.quantity} onChange={e => setItem(idx, 'quantity', e.target.value)} min="0" step="0.01" style={{ fontSize: 13 }} />
                  <input type="number" value={item.unit_price} onChange={e => setItem(idx, 'unit_price', e.target.value)} placeholder="0.00" min="0" step="0.01" style={{ fontSize: 13 }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input type="checkbox" checked={item.exempt} onChange={e => setItem(idx, 'exempt', e.target.checked)} style={{ width: 16, height: 16 }} />
                  </div>
                  <button type="button" onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18 }}>×</button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Resumen IVU</p>
              {clientType === 'b2b' && (
                <div style={{ background: '#e8eeff', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#2a4cb5', fontWeight: 600 }}>
                  Cliente B2B — Labor al 4%
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Subtotal productos</span><span>{fmt(t.subProd)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>IVU productos (11.5%)</span><span>{fmt(t.taxProd)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Subtotal labor</span><span>{fmt(t.subLabor)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>IVU labor ({clientType === 'b2b' ? '4%' : '11.5%'})</span><span>{fmt(t.taxLabor)}</span>
                </div>
                <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}>
                  <span>Total por envío</span><span style={{ color: 'var(--navy)' }}>{fmt(t.total)}</span>
                </div>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
              {saving ? 'Guardando...' : 'Guardar recurrencia'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => router.back()} style={{ width: '100%', justifyContent: 'center' }}>Cancelar</button>
          </div>
        </form>
      </main>
    </div>
  );
}
