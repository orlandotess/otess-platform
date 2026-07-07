'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '../../Sidebar';
import ClientCombobox from './ClientCombobox';
import LineItemRow from '../../LineItemRow';

const TAX = { final_product: 0.115, final_labor: 0.115, b2b_product: 0.115, b2b_labor: 0.04 };

const DEFAULT_TERMS = `Garantía del Servicio: OTESS se compromete a brindar soporte técnico y mantenimiento correctivo sobre la instalación y configuración de los sistemas implementados por un período de un (1) año a partir de la fecha de finalización del proyecto.

Garantía de los Equipos: La garantía de los equipos y dispositivos instalados está sujeta a los términos y condiciones establecidos por el fabricante o suplidor. OTESS gestionará el proceso de garantía con el proveedor correspondiente en caso de defectos de fabricación dentro del período estipulado por el fabricante. No obstante, los tiempos de respuesta y el alcance de dicha garantía dependerán exclusivamente de la política del suplidor.`;

export default function NuevaFactura() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobIdParam = searchParams.get('job');

  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [form, setForm] = useState({
    client_id: '', job_id: '', notes: '', bill_to: 'person', terms: DEFAULT_TERMS,
    issued_at: new Date().toISOString().split('T')[0],
    due_at: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  });
  const [items, setItems] = useState([{ type: 'labor', description: '', quantity: 1, unit_price: '', msrp: '', supplier_price: '', exempt: false, catalog_item_id: null, photoFile: null, photoPreview: null, existingPhotoPath: null }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('clients').select('id, name, company, client_type').order('name').then(({ data }) => setClients(data ?? []));
    supabase.from('jobs').select('id, title, client_id, bill_to, job_line_items(*)').order('created_at', { ascending: false }).then(({ data }) => setJobs(data ?? []));
    supabase.from('catalog_items').select('*').order('item_code').then(({ data }) => setCatalogItems(data ?? []));
  }, []);

  useEffect(() => {
    if (jobIdParam && jobs.length) {
      const job = jobs.find(j => j.id === jobIdParam);
      if (job) {
        setForm(f => ({ ...f, job_id: job.id, client_id: job.client_id, bill_to: job.bill_to ?? 'person' }));
        if (job.job_line_items?.length) {
          Promise.all(job.job_line_items.map(async li => {
            let photoPreview = null;
            if (li.photo_url) {
              const { data } = await supabase.storage.from('Job-photos').createSignedUrl(li.photo_url, 3600);
              photoPreview = data?.signedUrl ?? null;
            }
            return {
              type: li.type, description: li.description,
              quantity: li.quantity, unit_price: li.unit_price,
              msrp: li.msrp ?? '', supplier_price: li.supplier_price ?? '', exempt: !!li.exempt_reason,
              catalog_item_id: li.catalog_item_id ?? null,
              photoFile: null, photoPreview, existingPhotoPath: li.photo_url ?? null,
            };
          })).then(setItems);
        }
      }
    }
  }, [jobIdParam, jobs]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const selectedClient = clients.find(c => c.id === form.client_id);
  const clientType = selectedClient?.client_type ?? 'final';
  const hasCompany = !!selectedClient?.company;

  const addItem = () => setItems(i => [...i, { type: 'labor', description: '', quantity: 1, unit_price: '', msrp: '', supplier_price: '', exempt: false, catalog_item_id: null, photoFile: null, photoPreview: null, existingPhotoPath: null }]);
  const removeItem = idx => setItems(i => i.filter((_, n) => n !== idx));
  const setItem = (idx, k, v) => setItems(i => i.map((it, n) => n === idx ? { ...it, [k]: v } : it));
  function handleItemPhoto(idx, file) {
    if (!file) return;
    setItems(i => i.map((it, n) => n === idx ? { ...it, photoFile: file, photoPreview: URL.createObjectURL(file), existingPhotoPath: null } : it));
  }
  function handleCatalogSelect(idx, value) {
    const match = catalogItems.find(c => `${c.item_code} — ${c.description}` === value);
    if (match) {
      setItems(i => i.map((it, n) => n === idx ? {
        ...it, description: match.description, unit_price: match.price ?? '', msrp: match.msrp ?? '', supplier_price: match.supplier_price ?? '',
        catalog_item_id: match.id,
      } : it));
    } else {
      setItems(i => i.map((it, n) => n === idx ? { ...it, description: value, catalog_item_id: null } : it));
    }
  }

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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_id) { setError('Selecciona un cliente'); return; }
    if (!items.some(i => i.description.trim())) { setError('Agrega al menos una línea'); return; }

    const shortages = items.filter(i => i.type === 'product' && i.catalog_item_id).map(i => {
      const cat = catalogItems.find(c => c.id === i.catalog_item_id);
      const requested = parseFloat(i.quantity) || 0;
      return cat && cat.stock_quantity != null && requested > cat.stock_quantity
        ? `${cat.description}: pedido ${requested}, disponible ${cat.stock_quantity}`
        : null;
    }).filter(Boolean);
    if (shortages.length && !confirm(`Stock insuficiente para:\n${shortages.join('\n')}\n\n¿Guardar la factura de todas formas?`)) {
      return;
    }

    setSaving(true); setError('');

    const { data: allInvoices } = await supabase.from('invoices').select('invoice_number');
    let maxNum = 999;
    (allInvoices ?? []).forEach(inv => {
      const match = inv.invoice_number?.match(/^INV-(\d+)$/);
      if (match) {
        const n = parseInt(match[1]);
        if (n > maxNum) maxNum = n;
      }
    });
    const invoiceNumber = `INV-${maxNum + 1}`;

    const { data: invoice, error: err } = await supabase.from('invoices').insert([{
      invoice_number: invoiceNumber,
      client_id: form.client_id,
      job_id: form.job_id || null,
      notes: form.notes || null,
      terms: form.terms || null,
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

    const lineItems = [];
    let sortOrder = 0;
    for (const i of items.filter(i => i.description.trim())) {
      let photoPath = i.existingPhotoPath ?? null;
      if (i.photoFile) {
        const ext = i.photoFile.name.split('.').pop();
        const path = `${invoice.id}/${Date.now()}-${sortOrder}.${ext}`;
        const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, i.photoFile);
        if (!upErr) photoPath = path;
      }
      const base = (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0);
      const rate = i.exempt ? 0 : (TAX[`${clientType}_${i.type}`] ?? 0.115);
      lineItems.push({
        invoice_id: invoice.id, type: i.type, description: i.description,
        quantity: parseFloat(i.quantity) || 1, unit_price: parseFloat(i.unit_price) || 0,
        msrp: i.msrp !== '' ? parseFloat(i.msrp) : null,
        supplier_price: i.supplier_price !== '' ? parseFloat(i.supplier_price) : null,
        exempt_reason: i.exempt ? 'Exento' : null,
        catalog_item_id: i.catalog_item_id || null,
        photo_url: photoPath,
        tax_rate: rate, line_total: base, tax_amount: base * rate,
        sort_order: sortOrder++,
      });
    }

    await supabase.from('invoice_line_items').insert(lineItems);

    for (const li of lineItems.filter(li => li.type === 'product' && li.catalog_item_id)) {
      await supabase.rpc('adjust_catalog_stock', {
        p_catalog_item_id: li.catalog_item_id,
        p_delta: -li.quantity,
        p_invoice_id: invoice.id,
        p_reason: 'invoice_created',
      });
    }

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
                  <ClientCombobox clients={clients} value={form.client_id} onChange={id => { set('client_id', id); set('bill_to', 'person'); }} />
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
                <label>Notas / Términos de pago</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Términos de pago, notas para el cliente..." />
              </div>
              <div className="form-group">
                <label>Términos del proyecto</label>
                <textarea value={form.terms} onChange={e => set('terms', e.target.value)} rows={6} style={{ fontSize: 13, lineHeight: 1.6 }} />
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Líneas de factura</p>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addItem}>+ Agregar línea</button>
              </div>

              {items.map((item, idx) => (
                <LineItemRow
                  key={idx}
                  type={item.type}
                  onTypeChange={v => setItem(idx, 'type', v)}
                  description={item.description}
                  onDescriptionChange={v => handleCatalogSelect(idx, v)}
                  catalogOptions={catalogItems.filter(c => c.type === item.type)}
                  catalogItemId={item.catalog_item_id}
                  datalistId={`fact-cat-${idx}`}
                  quantity={item.quantity}
                  onQuantityChange={v => setItem(idx, 'quantity', v)}
                  msrp={item.msrp}
                  onMsrpChange={v => setItem(idx, 'msrp', v)}
                  unitPrice={item.unit_price}
                  onUnitPriceChange={v => setItem(idx, 'unit_price', v)}
                  supplierPrice={item.supplier_price}
                  onSupplierPriceChange={v => setItem(idx, 'supplier_price', v)}
                  exempt={item.exempt}
                  onExemptChange={v => setItem(idx, 'exempt', v)}
                  photoUrl={item.photoPreview}
                  onPhotoSelect={file => handleItemPhoto(idx, file)}
                  fmt={fmt}
                  actions={
                    <button type="button" onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
                  }
                />
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
