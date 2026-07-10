'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabase';
import LineItemRow from '../../../LineItemRow';
import ClientCombobox from '../../nueva/ClientCombobox';

const TAX = { final_product: 0.115, final_labor: 0.115, b2b_product: 0.115, b2b_labor: 0.04 };
const STATUS_BADGE = { draft: { cls: 'badge-gray', label: 'Borrador' }, sent: { cls: 'badge-blue', label: 'Enviada' }, paid: { cls: 'badge-green', label: 'Pagada' }, cancelled: { cls: 'badge-red', label: 'Cancelada' } };

function toInputItem(it) {
  return { key: it.id, type: it.type, description: it.description, quantity: it.quantity, unit_price: it.unit_price, exempt: it.exempt };
}

export default function RecurringInvoiceDetailClient({ recurring, clients, history }) {
  const router = useRouter();
  const [form, setForm] = useState({
    client_id: recurring.client_id, bill_to: recurring.bill_to, notes: recurring.notes ?? '', terms: recurring.terms ?? '',
    frequency: recurring.frequency, due_days: recurring.due_days, next_run_date: recurring.next_run_date,
  });
  const [items, setItems] = useState((recurring.recurring_invoice_items ?? []).map(toInputItem));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setSaved(false); };
  const selectedClient = clients.find(c => c.id === form.client_id);
  const clientType = selectedClient?.client_type ?? 'final';
  const hasCompany = !!selectedClient?.company;

  const addItem = () => setItems(i => [...i, { key: Math.random().toString(36).slice(2), type: 'labor', description: '', quantity: 1, unit_price: '', exempt: false }]);
  const removeItem = key => setItems(i => i.filter(it => it.key !== key));
  const setItem = (key, k, v) => { setItems(i => i.map(it => it.key === key ? { ...it, [k]: v } : it)); setSaved(false); };

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

  async function handleSave() {
    if (!form.client_id) { setError('Selecciona un cliente'); return; }
    if (!form.next_run_date) { setError('Selecciona la fecha del próximo envío'); return; }
    if (!items.some(i => i.description.trim())) { setError('Agrega al menos una línea'); return; }
    setSaving(true); setError('');

    const runDate = new Date(form.next_run_date + 'T00:00:00');

    const { error: err } = await supabase.from('recurring_invoices').update({
      client_id: form.client_id,
      bill_to: form.bill_to,
      frequency: form.frequency,
      day_of_month: form.frequency === 'weekly' ? null : runDate.getDate(),
      day_of_week: form.frequency === 'weekly' ? runDate.getDay() : null,
      due_days: parseInt(form.due_days) || 15,
      next_run_date: form.next_run_date,
      notes: form.notes || null,
      terms: form.terms || null,
    }).eq('id', recurring.id);

    if (err) { setError(err.message); setSaving(false); return; }

    await supabase.from('recurring_invoice_items').delete().eq('recurring_invoice_id', recurring.id);
    const lineItems = items.filter(i => i.description.trim()).map((i, idx) => ({
      recurring_invoice_id: recurring.id, type: i.type, description: i.description,
      quantity: parseFloat(i.quantity) || 1, unit_price: parseFloat(i.unit_price) || 0,
      exempt: i.exempt, sort_order: idx,
    }));
    await supabase.from('recurring_invoice_items').insert(lineItems);

    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">{selectedClient?.name ?? 'Factura recurrente'}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {recurring.active ? 'Activa' : 'Pausada'} · Próximo envío: {new Date(form.next_run_date + 'T00:00:00').toLocaleDateString('es-PR', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        <Link href="/facturas/recurrentes" className="btn btn-ghost">← Volver</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {error && <p style={{ color: 'var(--warn)', fontSize: 14 }}>{error}</p>}

          <div className="card">
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Información general</p>
            <div className="form-group">
              <label>Cliente *</label>
              <ClientCombobox clients={clients} value={form.client_id} onChange={v => { set('client_id', v); set('bill_to', 'person'); }} />
            </div>
            {hasCompany && (
              <div className="form-group" style={{ marginTop: 4 }}>
                <label>Facturar a</label>
                <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                    <input type="radio" name="bill_to" checked={form.bill_to === 'person'} onChange={() => set('bill_to', 'person')} />
                    {selectedClient?.name}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                    <input type="radio" name="bill_to" checked={form.bill_to === 'company'} onChange={() => set('bill_to', 'company')} />
                    {selectedClient?.company}
                  </label>
                </div>
              </div>
            )}
            {selectedClient && !selectedClient.email && (
              <p style={{ fontSize: 12.5, color: 'var(--warn)', marginTop: 4 }}>
                Este cliente no tiene email registrado — la próxima ejecución se saltará hasta que le agregues uno.
              </p>
            )}
            <div className="form-group">
              <label>Notas / Términos de pago</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>

          <div className="card">
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Recurrencia</p>
            <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div className="form-group">
                <label>Frecuencia</label>
                <select value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                  <option value="quarterly">Trimestral</option>
                  <option value="yearly">Anual</option>
                </select>
              </div>
              <div className="form-group">
                <label>Próximo envío</label>
                <input type="date" value={form.next_run_date} onChange={e => set('next_run_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Días para vencer</label>
                <input type="number" min="0" value={form.due_days} onChange={e => set('due_days', e.target.value)} />
              </div>
            </div>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--muted)' }}>
              Se repetirá cada {form.frequency === 'weekly' ? 'semana, el mismo día de la semana' : form.frequency === 'monthly' ? 'mes, el mismo día del mes' : form.frequency === 'quarterly' ? '3 meses, el mismo día del mes' : 'año, en la misma fecha'} elegida arriba.
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Líneas de factura</p>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addItem}>+ Agregar línea</button>
            </div>
            {items.map(item => (
              <LineItemRow
                key={item.key}
                type={item.type}
                onTypeChange={v => setItem(item.key, 'type', v)}
                description={item.description}
                onDescriptionChange={v => setItem(item.key, 'description', v)}
                quantity={item.quantity}
                onQuantityChange={v => setItem(item.key, 'quantity', v)}
                unitPrice={item.unit_price}
                onUnitPriceChange={v => setItem(item.key, 'unit_price', v)}
                exempt={item.exempt}
                onExemptChange={v => setItem(item.key, 'exempt', v)}
                fmt={fmt}
                actions={
                  <button type="button" onClick={() => removeItem(item.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
                }
              />
            ))}
          </div>

          <div className="card">
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Historial de facturas generadas</p>
            {history.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>Todavía no se ha generado ninguna factura desde esta recurrencia.</p>
            ) : (
              <div style={{ display: 'grid', gap: 2 }}>
                {history.map(inv => {
                  const badge = STATUS_BADGE[inv.status] ?? STATUS_BADGE.draft;
                  return (
                    <Link key={inv.id} href={`/facturas/${inv.id}`}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{inv.invoice_number}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{inv.issued_at} · vence {inv.due_at}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span className={`badge ${badge.cls}`}>{badge.label}</span>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', width: 90, textAlign: 'right' }}>{fmt(inv.total)}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card">
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Términos del proyecto</p>
            <div className="form-group">
              <textarea value={form.terms} onChange={e => set('terms', e.target.value)} rows={4} style={{ fontSize: 13, lineHeight: 1.6 }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Resumen IVU</p>
            {clientType === 'b2b' && (
              <div style={{ background: 'var(--info-tint)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--info)', fontWeight: 600 }}>
                Cliente B2B — Labor al 4%
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Subtotal productos</span><span>{fmt(t.subProd)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>IVU productos (11.5%)</span><span>{fmt(t.taxProd)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Subtotal labor</span><span>{fmt(t.subLabor)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>IVU labor ({clientType === 'b2b' ? '4%' : '11.5%'})</span><span>{fmt(t.taxLabor)}</span></div>
              <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}>
                <span>Total por envío</span><span style={{ color: 'var(--navy)' }}>{fmt(t.total)}</span>
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
            {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </>
  );
}
