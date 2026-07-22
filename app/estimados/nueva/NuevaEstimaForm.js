'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '../../Sidebar';
import ClientCombobox from '../../facturas/nueva/ClientCombobox';
import LineItemRow from '../../LineItemRow';
import CableCalculator from '../../CableCalculator';

const TAX = { final_product: 0.115, final_labor: 0.115, b2b_product: 0.115, b2b_labor: 0.04 };

const DEFAULT_TERMS = `Garantía del Servicio: OTESS se compromete a brindar soporte técnico y mantenimiento correctivo sobre la instalación y configuración de los sistemas implementados por un período de un (1) año a partir de la fecha de finalización del proyecto.

Garantía de los Equipos: La garantía de los equipos y dispositivos instalados está sujeta a los términos y condiciones establecidos por el fabricante o suplidor. OTESS gestionará el proceso de garantía con el proveedor correspondiente en caso de defectos de fabricación dentro del período estipulado por el fabricante. No obstante, los tiempos de respuesta y el alcance de dicha garantía dependerán exclusivamente de la política del suplidor.`;

export default function NuevaEstimaForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobIdParam = searchParams.get('job');

  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [properties, setProperties] = useState([]);
  const [propertyMode, setPropertyMode] = useState('none'); // none | existing | new
  const [newProperty, setNewProperty] = useState({ name: '', street: '', city: '', state: 'PR', zip: '' });
  const [form, setForm] = useState({
    client_id: '', job_id: '', property_id: '', notes: '', bill_to: 'person', terms: DEFAULT_TERMS,
    issued_at: new Date().toISOString().split('T')[0],
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  });
  const [items, setItems] = useState([{ type: 'labor', title: '', description: '', quantity: 1, unit_price: '', msrp: '', supplier_price: '', exempt: false, area: '', vendor: '', catalog_item_id: null, photoFile: null, photoPreview: null, existingPhotoPath: null }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCableCalc, setShowCableCalc] = useState(false);

  useEffect(() => {
    supabase.from('clients').select('id, name, company, client_type').order('name').then(({ data }) => setClients(data ?? []));
    supabase.from('jobs').select('id, title, client_id, bill_to, job_line_items(*)').order('created_at', { ascending: false }).then(({ data }) => setJobs(data ?? []));
    supabase.from('catalog_items').select('*').order('item_code').then(({ data }) => setCatalogItems(data ?? []));
  }, []);

  useEffect(() => {
    if (!form.client_id) { setProperties([]); return; }
    supabase.from('client_properties').select('*').eq('client_id', form.client_id).order('is_primary', { ascending: false })
      .then(({ data }) => setProperties(data ?? []));
  }, [form.client_id]);

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
              type: li.type, title: li.title ?? '', description: li.description,
              quantity: li.quantity, unit_price: li.unit_price,
              msrp: li.msrp ?? '', supplier_price: li.supplier_price ?? '', exempt: !!li.exempt_reason,
              area: li.area ?? '', vendor: li.vendor ?? '', catalog_item_id: li.catalog_item_id ?? null,
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

  const addItem = () => setItems(i => [...i, { type: 'labor', title: '', description: '', quantity: 1, unit_price: '', msrp: '', supplier_price: '', exempt: false, area: '', vendor: '', catalog_item_id: null, photoFile: null, photoPreview: null, existingPhotoPath: null }]);
  const addPrefilledItem = item => setItems(i => [...i, { type: 'product', title: '', description: '', quantity: 1, unit_price: '', msrp: '', supplier_price: '', exempt: false, area: '', vendor: '', catalog_item_id: null, photoFile: null, photoPreview: null, existingPhotoPath: null, ...item }]);
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
        vendor: it.vendor || match.vendor || '', catalog_item_id: match.id,
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
  const areaOptions = [...new Set(items.map(i => i.area).filter(Boolean))];
  const vendorOptions = [...new Set(catalogItems.map(i => i.vendor).filter(Boolean))];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_id) { setError('Selecciona un cliente'); return; }
    if (!items.some(i => i.description.trim())) { setError('Agrega al menos una línea'); return; }
    if (propertyMode === 'new' && !newProperty.name.trim()) { setError('Ponle un nombre a la propiedad nueva'); return; }
    setSaving(true); setError('');

    let propertyId = null;
    if (propertyMode === 'existing' && form.property_id) {
      propertyId = form.property_id;
    } else if (propertyMode === 'new') {
      const { data: newProp, error: propErr } = await supabase.from('client_properties').insert([{
        client_id: form.client_id,
        name: newProperty.name.trim(),
        street: newProperty.street || null,
        city: newProperty.city || null,
        state: newProperty.state || null,
        zip: newProperty.zip || null,
        is_primary: properties.length === 0,
      }]).select().single();
      if (propErr) { setError(propErr.message); setSaving(false); return; }
      propertyId = newProp.id;
    }

    const { data: allEstimates } = await supabase.from('estimates').select('estimate_number');
    let maxNum = 1000;
    (allEstimates ?? []).forEach(est => {
      const match = est.estimate_number?.match(/^EST-(\d+)$/);
      if (match) {
        const n = parseInt(match[1]);
        if (n > maxNum) maxNum = n;
      }
    });
    const estimateNumber = `EST-${maxNum + 1}`;

    const { data: estimate, error: err } = await supabase.from('estimates').insert([{
      estimate_number: estimateNumber,
      client_id: form.client_id,
      job_id: form.job_id || null,
      property_id: propertyId,
      notes: form.notes || null,
      terms: form.terms || null,
      issued_at: form.issued_at,
      valid_until: form.valid_until,
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
        const path = `${estimate.id}/${Date.now()}-${sortOrder}.${ext}`;
        const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, i.photoFile);
        if (!upErr) photoPath = path;
      }
      const base = (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0);
      const rate = i.exempt ? 0 : (TAX[`${clientType}_${i.type}`] ?? 0.115);
      lineItems.push({
        estimate_id: estimate.id, type: i.type, title: i.title || null, description: i.description,
        quantity: parseFloat(i.quantity) || 1, unit_price: parseFloat(i.unit_price) || 0,
        msrp: i.msrp !== '' ? parseFloat(i.msrp) : null,
        supplier_price: i.supplier_price !== '' ? parseFloat(i.supplier_price) : null,
        exempt_reason: i.exempt ? 'Exento' : null,
        area: i.area || null, vendor: i.vendor || null, catalog_item_id: i.catalog_item_id || null,
        photo_url: photoPath,
        tax_rate: rate, line_total: base, tax_amount: base * rate,
        sort_order: sortOrder++,
      });
    }

    await supabase.from('estimate_line_items').insert(lineItems);
    router.push(`/estimados/${estimate.id}`);
  }

  return (
    <div className="admin-shell ds-estimados">
      <Sidebar />
      <main className="main-content">
        <div className="page-header"><div className="page-title">Nuevo estimado</div></div>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && <p style={{ color: 'var(--warn)', fontSize: 14 }}>{error}</p>}

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Información general</p>
              <div className="form-row">
                <div className="form-group">
                  <label>Cliente *</label>
                  <ClientCombobox clients={clients} value={form.client_id} onChange={id => {
                    set('client_id', id); set('bill_to', 'person'); set('property_id', '');
                    setPropertyMode('none'); setNewProperty({ name: '', street: '', city: '', state: 'PR', zip: '' });
                  }} />
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
                  <label>A nombre de</label>
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
                  <label>Fecha</label>
                  <input type="date" value={form.issued_at} onChange={e => set('issued_at', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Válida hasta</label>
                  <input type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Notas para el cliente</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notas, condiciones de pago, etc..." />
              </div>
            </div>

            {form.client_id && (
              <div className="card">
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>📍 Propiedad (opcional)</p>
                <div className="form-group">
                  <label>Dirección del trabajo</label>
                  <select
                    value={propertyMode === 'existing' ? form.property_id : (propertyMode === 'new' ? '__new__' : '')}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === '__new__') { setPropertyMode('new'); set('property_id', ''); }
                      else if (v === '') { setPropertyMode('none'); set('property_id', ''); }
                      else { setPropertyMode('existing'); set('property_id', v); }
                    }}>
                    <option value="">— Sin propiedad —</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}{p.is_primary ? ' ★' : ''}</option>)}
                    <option value="__new__">+ Dirección nueva</option>
                  </select>
                </div>
                {propertyMode === 'new' && (
                  <>
                    <div className="form-group">
                      <label>Nombre de la propiedad</label>
                      <input value={newProperty.name} onChange={e => setNewProperty(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Oficina Principal, Almacén Caguas" />
                    </div>
                    <div className="form-group">
                      <label>Dirección</label>
                      <input value={newProperty.street} onChange={e => setNewProperty(p => ({ ...p, street: e.target.value }))} placeholder="Calle y número" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 10 }}>
                      <div className="form-group">
                        <label>Ciudad</label>
                        <input value={newProperty.city} onChange={e => setNewProperty(p => ({ ...p, city: e.target.value }))} placeholder="San Juan" />
                      </div>
                      <div className="form-group">
                        <label>Estado</label>
                        <input value={newProperty.state} onChange={e => setNewProperty(p => ({ ...p, state: e.target.value }))} placeholder="PR" />
                      </div>
                      <div className="form-group">
                        <label>Zip</label>
                        <input value={newProperty.zip} onChange={e => setNewProperty(p => ({ ...p, zip: e.target.value }))} placeholder="00901" />
                      </div>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Se guardará como propiedad del cliente para futuros estimados, facturas y trabajos.</p>
                  </>
                )}
              </div>
            )}

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Líneas del estimado</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setShowCableCalc(true)}>🧮 Calcular cable/tubo</button>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addItem}>+ Agregar línea</button>
                </div>
              </div>

              {items.map((item, idx) => (
                <LineItemRow
                  key={idx}
                  type={item.type}
                  onTypeChange={v => setItem(idx, 'type', v)}
                  title={item.title}
                  onTitleChange={v => setItem(idx, 'title', v)}
                  description={item.description}
                  onDescriptionChange={v => handleCatalogSelect(idx, v)}
                  catalogOptions={catalogItems.filter(c => c.type === item.type)}
                  catalogItemId={item.catalog_item_id}
                  datalistId={`est-cat-${idx}`}
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
                  area={item.area}
                  onAreaChange={v => setItem(idx, 'area', v)}
                  areaOptions={areaOptions}
                  vendor={item.vendor}
                  onVendorChange={v => setItem(idx, 'vendor', v)}
                  vendorOptions={vendorOptions}
                  photoUrl={item.photoPreview}
                  onPhotoSelect={file => handleItemPhoto(idx, file)}
                  fmt={fmt}
                  actions={
                    <button type="button" onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
                  }
                />
              ))}
            </div>

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Términos del proyecto</p>
              <div className="form-group">
                <textarea value={form.terms} onChange={e => set('terms', e.target.value)} rows={6} style={{ fontSize: 13, lineHeight: 1.6 }} />
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
              {saving ? 'Guardando...' : '💾 Guardar estimado'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => router.back()} style={{ width: '100%', justifyContent: 'center' }}>Cancelar</button>
          </div>
        </form>
        {showCableCalc && (
          <CableCalculator
            areaOptions={areaOptions}
            vendorOptions={vendorOptions}
            onAdd={item => { addPrefilledItem(item); setShowCableCalc(false); }}
            onClose={() => setShowCableCalc(false)}
          />
        )}
      </main>
    </div>
  );
}
