'use client';
import { Suspense } from 'react';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '../../Sidebar';

const TAX = { final_product: 0.115, final_labor: 0.115, b2b_product: 0.115, b2b_labor: 0.04 };

export default function NuevaFactura() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobIdParam = searchParams.get('job');

  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState({
    client_id: '', job_id: '', notes: '', bill_to: 'person',
    issued_at: new Date().toISOString().split('T')[0],
    due_at: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  });
  const [items, setItems] = useState([{ type: 'labor', description: '', quantity: 1, unit_price: '', exempt: false }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('clients').select('id, name, company, client_type').order('name').then(({ data }) => setClients(data ?? []));
    supabase.from('jobs').select('id, title, client_id, job_line_items(*)').order('created_at', { ascending: false }).then(({ data }) => setJobs(data ?? []));
  }, []);

  useEffect(() => {
    if (jobIdParam && jobs.length) {
      const job = jobs.find(j => j.id === jobIdParam);
      if (job) {
        setForm(f => ({ ...f, job_id: job.id, client_id: job.client_id }));
        if (job.job_line_items?.length) {
          setItems(job.job_line_items.map(li => ({
            type: li.type, description: li.description,
            quantity: li.quantity, unit_price: li.unit_price, exempt: false,
          })));
        }
      }
    }
  }, [jobIdParam, jobs]);

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
  const fmt = n => `$${Number(n).toFixed(2)}`;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_id) { setError('Selecciona un cliente'); return; }
    if (!items.some(i => i.description.trim())) { setError('Agrega al menos una línea'); return; }
    setSaving(true); setError('');

    const { data: lastInv } = await supabase.from('invoices').select('invoice_number').order('created_at', { ascending: false }).limit(1).single();
    let nextNum = 1000;
    if (lastInv?.invoice_number) {
      const n = parseInt(lastInv.invoice_number.replace('INV-', ''));
      if (!isNaN(n)) nextNum = n + 1;
    }
    const invoiceNumber = `INV-${nextNum}`;

    const { data: invoice, error: err } = await supabase.from('invoices').insert([{
      invoice_number: invoiceNumber,
      client_id: form.client_id,
      job_id: form.job_id || null,
      notes: form.notes || null,
      issued_at: form.issued_at,
      due_at: form.due_at,
      status: 'draft',
      bill_to: form.bill_to,
      subtotal_products: t.subProd,
      tax_products: t.taxProd,
      subtotal_labor: t.subLabor,
      tax_labor: t.taxLabor,
      total: t.total,
    }]).select().single();

    if (err) { setError(err.message); setSaving(false); return; }

    const lineItems = items.filter(i => i.description.trim()).map((i, idx) => {
      const base = (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0);
      const rate = i.exempt ? 0 : (TAX[`${clientType}_${i.type}`] ?? 0.115);
      return {
        invoice_id: invoice.id, type: i.type, description: i.description,
        quantity: parseFloat(i.quantity) || 1, unit_price: parseFloat(i.unit_price) || 0,
        tax_rate: rate, line_total: base, tax_amount: base * rate,
        sort_order: idx,
      };
    });

    await supabase.from('invoice_line_items').insert(lineItems);
    router.push(`/facturas/${invoice.id}`);
  }

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header"><div className="page-title">Nueva factura</div></div>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && <p style={{ color: 'var(--warn)', fontSize: 14 }}>{error}</p>}

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Información general</p>
              <div className="form-row">
                <div className="form-group">
                  <label>Cliente *</label>
                  <select value={form.client_id} onChange={e => { set('client_id', e.target.value); set('bill_to', 'person'); }}>
                    <option value="">— Seleccionar —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.client_type === 'b2b' ? ' (B2B)' : ''}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Trabajo (opcional)</label>
                  <select value={form.job_id} onChange={e => set('job_id', e.target.value)}>
                    <option value="">— Sin trabajo asociado —</option>
                    {jobs.filter(j => !form.client_id || j.client_id === form.client_id).map(j => (
                      <option key={j.id} value={j.id}>{j.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Facturar a */}
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

              <div className="form-row" style={{ marginTop: 12 }}>
                <div className="form-group">
                  <label>Fecha emisión</label>
                  <input type="date" value={form.issued_at} onChange={e => set('issued_at', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Fecha vencimiento</label>
                  <input type="date" value={form.due_at} onChange={e => set('due_at', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Notas / Términos</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Términos de pago, notas para el cliente..." />
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

          {/* Summary */}
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
                  <span>Total</span><span style={{ color: 'var(--navy)' }}>{fmt(t.total)}</span>
                </div>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
              {saving ? 'Guardando...' : '💾 Guardar factura'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => router.back()} style={{ width: '100%', justifyContent: 'center' }}>Cancelar</button>
          </div>
        </form>
      </main>
    </div>
  );
}
