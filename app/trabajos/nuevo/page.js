'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Sidebar from '../../Sidebar';

const TAX = { final_product: 0.115, final_labor: 0.115, b2b_product: 0.115, b2b_labor: 0.04 };

export default function NuevoTrabajo() {
  const router = useRouter();
  const [catalogItems, setCatalogItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [properties, setProperties] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({
    client_id: '', title: '', description: '', status: 'estimate',
    scheduled_start: '', scheduled_end: '', notes: '',
    property_id: '', contact_id: '',
    property_name: '', street: '', city: '', state: 'PR', zip: '',
    contact_name: '', contact_phone: '', contact_email: '',
  });
  const [items, setItems] = useState([{ type: 'labor', description: '', quantity: 1, unit_price: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  useEffect(() => {
    supabase.from('clients').select('id, name, client_type').order('name').then(({ data }) => setClients(data ?? []));
    supabase.from('catalog_items').select('*').order('item_code').then(({ data }) => setCatalogItems(data ?? []));
  }, []);

  function handleDescriptionSelect(idx, value) {
    const match = catalogItems.find(c => `${c.item_code} — ${c.description}` === value);
    if (match) {
      setItems(prev => prev.map((it, n) => n === idx ? { ...it, type: match.type, description: match.description, unit_price: match.price } : it));
    } else {
      setItem(idx, 'description', value);
    }
  }

  useEffect(() => {
    if (!form.client_id) { setProperties([]); setContacts([]); return; }
    supabase.from('client_properties').select('*').eq('client_id', form.client_id).order('is_primary', { ascending: false })
      .then(({ data }) => setProperties(data ?? []));
    supabase.from('client_contacts').select('*').eq('client_id', form.client_id).order('is_primary', { ascending: false })
      .then(({ data }) => setContacts(data ?? []));
  }, [form.client_id]);

  useEffect(() => {
    if (!form.property_id) return;
    const p = properties.find(p => p.id === form.property_id);
    if (p) {
      setForm(f => ({ ...f, street: p.street ?? '', city: p.city ?? '', state: p.state ?? 'PR', zip: p.zip ?? '' }));
    }
  }, [form.property_id]);

  useEffect(() => {
    if (!form.contact_id) return;
    const c = contacts.find(c => c.id === form.contact_id);
    if (c) {
      setForm(f => ({ ...f, contact_name: c.name ?? '', contact_phone: c.phone ?? '', contact_email: c.email ?? '' }));
    }
  }, [form.contact_id]);

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
  const fmt = n => `$${n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

  const fullAddress = [form.street, form.city, form.state, form.zip].filter(Boolean).join(', ');
  const mapsQuery = encodeURIComponent(fullAddress);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_id || !form.title.trim()) { setError('Cliente y título son requeridos'); return; }
    setSaving(true); setError('');

    const { data: lastJob } = await supabase.from('jobs').select('job_number').order('created_at', { ascending: false }).limit(1).single();
    let nextNum = 1001;
    if (lastJob?.job_number) {
      const n = parseInt(lastJob.job_number.replace('JOB-', ''));
      if (!isNaN(n)) nextNum = n + 1;
    }
    const jobNumber = `JOB-${nextNum}`;

    const { data: job, error: err } = await supabase.from('jobs').insert([{
      job_number: jobNumber,
      client_id: form.client_id,
      title: form.title,
      description: form.description || null,
      status: form.status,
      notes: form.notes || null,
      scheduled_start: form.scheduled_start || null,
      scheduled_end: form.scheduled_end || null,
      property_id: form.property_id || null,
      contact_id: form.contact_id || null,
      property_name: form.property_name || null,
      street: form.street || null,
      city: form.city || null,
      state: form.state || null,
      zip: form.zip || null,
      contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null,
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

            {/* Info general */}
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Información general</p>
              <div className="form-group" style={{ position: 'relative' }}>
                <label>Cliente *</label>
                {selectedClient ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, background: '#f8f9fb' }}>
                    <span style={{ flex: 1, fontWeight: 600 }}>{selectedClient.name}{selectedClient.client_type === 'b2b' ? ' (B2B)' : ''}</span>
                    <button type="button" onClick={() => { set('client_id', ''); setClientSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, fontWeight: 700 }}>Cambiar</button>
                  </div>
                ) : (
                  <>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>🔍</span>
                      <input
                        value={clientSearch}
                        onChange={e => { setClientSearch(e.target.value); setShowClientDropdown(true); }}
                        onFocus={() => setShowClientDropdown(true)}
                        placeholder="Buscar cliente por nombre..."
                        style={{ paddingLeft: 36 }}
                      />
                    </div>
                    {showClientDropdown && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setShowClientDropdown(false)} />
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1.5px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 11, maxHeight: 240, overflowY: 'auto' }}>
                          {clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 ? (
                            <div style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: 13 }}>No se encontraron clientes.</div>
                          ) : clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(c => (
                            <div key={c.id} onClick={() => { set('client_id', c.id); setClientSearch(''); setShowClientDropdown(false); }}
                              style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 500, borderBottom: '1px solid var(--border)' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#f8f9fb'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              {c.name}{c.client_type === 'b2b' ? ' (B2B)' : ''}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
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

            {/* Propiedad */}
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>📍 Propiedad</p>
              {properties.length > 0 && (
                <div className="form-group">
                  <label>Seleccionar propiedad del cliente</label>
                  <select value={form.property_id} onChange={e => set('property_id', e.target.value)}>
                    <option value="">— Seleccionar propiedad —</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}{p.is_primary ? ' ★' : ''}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Nombre de la propiedad</label>
                <input value={form.property_name} onChange={e => set('property_name', e.target.value)} placeholder="Ej: Oficina Principal, Almacén Caguas" />
              </div>
              <div className="form-group">
                <label>Dirección</label>
                <input value={form.street} onChange={e => set('street', e.target.value)} placeholder="Calle y número" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 10 }}>
                <div className="form-group">
                  <label>Ciudad</label>
                  <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="San Juan" />
                </div>
                <div className="form-group">
                  <label>Estado</label>
                  <input value={form.state} onChange={e => set('state', e.target.value)} placeholder="PR" />
                </div>
                <div className="form-group">
                  <label>Zip</label>
                  <input value={form.zip} onChange={e => set('zip', e.target.value)} placeholder="00901" />
                </div>
              </div>
              {fullAddress && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                    🗺️ Google Maps
                  </a>
                  <a href={`https://maps.apple.com/?q=${mapsQuery}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#000', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                    🍎 Apple Maps
                  </a>
                  <a href={`https://waze.com/ul?q=${mapsQuery}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#33CCFF', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                    🚗 Waze
                  </a>
                </div>
              )}
            </div>

            {/* Contacto */}
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>👤 Contacto encargado</p>
              {contacts.length > 0 && (
                <div className="form-group">
                  <label>Seleccionar contacto del cliente</label>
                  <select value={form.contact_id} onChange={e => set('contact_id', e.target.value)}>
                    <option value="">— Seleccionar contacto —</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.is_primary ? ' ★' : ''}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Nombre</label>
                <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Nombre del contacto" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label>Teléfono</label>
                  <input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="787-000-0000" />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="contacto@email.com" />
                </div>
              </div>
            </div>

            {/* Líneas */}
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
                  <input list={`catalog-${idx}`} value={item.description} onChange={e => handleDescriptionSelect(idx, e.target.value)} placeholder="Descripción o código..." style={{ fontSize: 13 }} />
                  <datalist id={`catalog-${idx}`}>
                    {catalogItems.filter(c => c.type === item.type).map(c => (
                      <option key={c.id} value={`${c.item_code} — ${c.description}`} />
                    ))}
                  </datalist>
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
                {[
                  { label: 'Subtotal productos', value: t.subProd },
                  { label: 'IVU productos (11.5%)', value: t.taxProd },
                  { label: 'Subtotal labor', value: t.subLabor },
                  { label: `IVU labor (${clientType === 'b2b' ? '4%' : '11.5%'})`, value: t.taxLabor },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--muted)' }}>{r.label}</span>
                    <span>{fmt(r.value)}</span>
                  </div>
                ))}
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
