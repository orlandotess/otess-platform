'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Sidebar from '../../Sidebar';
import LineItemRow from '../../LineItemRow';
import { buildMapsLinks } from '../../../lib/mapsLinks';
import { localInputToIso } from '../../../lib/datetimeLocal';
import { uploadFileWithProgress } from '../../../lib/uploadWithProgress';

const TAX = { final_product: 0.115, final_labor: 0.115, b2b_product: 0.115, b2b_labor: 0.04 };

export default function NuevaSolicitud() {
  const router = useRouter();
  const [catalogItems, setCatalogItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [properties, setProperties] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({
    client_id: '', title: '', description: '', notes: '', salesperson: 'Orlando Tapia',
    property_id: '', contact_id: '',
    property_name: '', street: '', city: '', state: 'PR', zip: '',
    contact_name: '', contact_phone: '', contact_email: '',
  });
  const [wantsAssessment, setWantsAssessment] = useState(false);
  const [assessmentDate, setAssessmentDate] = useState('');
  const [assessmentInstructions, setAssessmentInstructions] = useState('');
  const [items, setItems] = useState([]);
  const [images, setImages] = useState([]); // { file, preview }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);

  useEffect(() => {
    supabase.from('clients').select('id, name, client_type, company').order('name').then(({ data }) => setClients(data ?? []));
    supabase.from('catalog_items').select('*').order('item_code').then(({ data }) => setCatalogItems(data ?? []));
  }, []);

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
    if (p) setForm(f => ({ ...f, property_name: p.name ?? '', street: p.street ?? '', city: p.city ?? '', state: p.state ?? 'PR', zip: p.zip ?? '' }));
  }, [form.property_id]);

  useEffect(() => {
    if (!form.contact_id) return;
    const c = contacts.find(c => c.id === form.contact_id);
    if (c) setForm(f => ({ ...f, contact_name: c.name ?? '', contact_phone: c.phone ?? '', contact_email: c.email ?? '' }));
  }, [form.contact_id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const selectedClient = clients.find(c => c.id === form.client_id);
  const clientType = selectedClient?.client_type ?? 'final';

  const addItem = () => setItems(i => [...i, { type: 'labor', description: '', quantity: 1, unit_price: '', msrp: '', supplier_price: '', exempt: false, area: '', vendor: '', photoFile: null, photoPreview: null }]);
  const removeItem = idx => setItems(i => i.filter((_, n) => n !== idx));
  const setItem = (idx, k, v) => setItems(i => i.map((it, n) => n === idx ? { ...it, [k]: v } : it));
  function handleItemPhoto(idx, file) {
    if (!file) return;
    setItem(idx, 'photoFile', file);
    setItem(idx, 'photoPreview', URL.createObjectURL(file));
  }
  function handleDescriptionSelect(idx, value) {
    const match = catalogItems.find(c => `${c.item_code} — ${c.description}` === value);
    if (match) {
      setItems(prev => prev.map((it, n) => n === idx ? {
        ...it, type: match.type, description: match.description, unit_price: match.price ?? '', msrp: match.msrp ?? '', supplier_price: match.supplier_price ?? '',
        vendor: it.vendor || match.vendor || '',
      } : it));
    } else {
      setItem(idx, 'description', value);
    }
  }

  function handleImageSelect(e) {
    const files = Array.from(e.target.files || []).slice(0, 10 - images.length);
    if (!files.length) return;
    setImages(prev => [...prev, ...files.map(file => ({ file, preview: URL.createObjectURL(file) }))]);
  }
  const removeImage = idx => setImages(prev => prev.filter((_, n) => n !== idx));

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
  const areaOptions = [...new Set(items.map(i => i.area).filter(Boolean))];
  const vendorOptions = [...new Set(catalogItems.map(i => i.vendor).filter(Boolean))];
  const fullAddress = [form.street, form.city, form.state, form.zip].filter(Boolean).join(', ');
  const mapsLinks = buildMapsLinks(form.street, form.city, form.state, form.zip);

  async function handleCreateQuickClient() {
    if (!newClientName.trim()) return;
    setCreatingClient(true);
    const { data, error: err } = await supabase.from('clients')
      .insert([{ name: newClientName.trim(), phone: newClientPhone.trim() || null, client_type: 'final' }])
      .select('id, name, client_type').single();
    setCreatingClient(false);
    if (err) { setError(err.message); return; }
    setClients(prev => [...prev, data]);
    set('client_id', data.id);
    setShowNewClient(false);
    setNewClientName(''); setNewClientPhone('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_id || !form.title.trim()) { setError('Cliente y título son requeridos'); return; }
    setSaving(true); setError('');

    try {
      const { data: last } = await supabase.from('solicitudes').select('solicitud_number').order('created_at', { ascending: false }).limit(1).single();
      let nextNum = 1001;
      if (last?.solicitud_number) {
        const n = parseInt(last.solicitud_number.replace('REQ-', ''));
        if (!isNaN(n)) nextNum = n + 1;
      }
      const solicitudNumber = `REQ-${nextNum}`;

      const { data: solicitud, error: err } = await supabase.from('solicitudes').insert([{
        solicitud_number: solicitudNumber,
        client_id: form.client_id,
        title: form.title,
        description: form.description || null,
        notes: form.notes || null,
        salesperson: form.salesperson || null,
        status: 'nueva',
        assessment_date: wantsAssessment && assessmentDate ? localInputToIso(assessmentDate) : null,
        assessment_instructions: wantsAssessment ? (assessmentInstructions || null) : null,
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

      if (err) { setError(err.message); return; }

      if (images.length) {
        const uploadedPaths = [];
        for (let i = 0; i < images.length; i++) {
          const ext = images[i].file.name.split('.').pop();
          const path = `${solicitud.id}/intake-${Date.now()}-${i}.${ext}`;
          const { error: upErr } = await uploadFileWithProgress('Job-photos', path, images[i].file, () => {});
          if (!upErr) uploadedPaths.push(path);
        }
        if (uploadedPaths.length) await supabase.from('solicitudes').update({ photo_urls: uploadedPaths }).eq('id', solicitud.id);
      }

      const lineItems = [];
      let sortOrder = 0;
      for (const i of items.filter(i => i.description.trim())) {
        let photoPath = null;
        if (i.photoFile) {
          const ext = i.photoFile.name.split('.').pop();
          const path = `${solicitud.id}/${Date.now()}-${sortOrder}.${ext}`;
          const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, i.photoFile);
          if (!upErr) photoPath = path;
        }
        lineItems.push({
          solicitud_id: solicitud.id, type: i.type, description: i.description,
          quantity: parseFloat(i.quantity) || 1, unit_price: parseFloat(i.unit_price) || 0,
          msrp: i.msrp !== '' ? parseFloat(i.msrp) : null,
          supplier_price: i.supplier_price !== '' ? parseFloat(i.supplier_price) : null,
          exempt_reason: i.exempt ? 'Exento' : null,
          area: i.area || null, vendor: i.vendor || null,
          photo_url: photoPath,
          sort_order: sortOrder++,
        });
      }
      if (lineItems.length) await supabase.from('solicitud_line_items').insert(lineItems);

      router.push(`/solicitudes/${solicitud.id}`);
    } catch (e) {
      setError(e.message || 'Ocurrió un error al guardar la solicitud. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-shell ds-trabajos">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Nueva solicitud</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && <p style={{ color: 'var(--warn)', fontSize: 14 }}>{error}</p>}

            {/* Info general */}
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Información general</p>
              <div className="form-group" style={{ position: 'relative' }}>
                <label>Cliente *</label>
                {selectedClient ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
                    <span style={{ flex: 1, fontWeight: 600 }}>{selectedClient.name}{selectedClient.client_type === 'b2b' ? ' (B2B)' : ''}</span>
                    <button type="button" onClick={() => { set('client_id', ''); setClientSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, fontWeight: 700 }}>Cambiar</button>
                  </div>
                ) : showNewClient ? (
                  <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: 12 }}>
                    <input value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="Nombre del cliente" style={{ marginBottom: 8 }} />
                    <input value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} placeholder="Teléfono (opcional)" style={{ marginBottom: 8 }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={creatingClient} onClick={handleCreateQuickClient}>
                        {creatingClient ? 'Creando...' : 'Crear cliente'}
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setShowNewClient(false)}>Cancelar</button>
                    </div>
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
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 11, maxHeight: 240, overflowY: 'auto' }}>
                          {clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 ? (
                            <div style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: 13 }}>No se encontraron clientes.</div>
                          ) : clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(c => (
                            <div key={c.id} onClick={() => { set('client_id', c.id); setClientSearch(''); setShowClientDropdown(false); }}
                              style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 500, borderBottom: '1px solid var(--border)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              {c.name}{c.client_type === 'b2b' ? ' (B2B)' : ''}
                            </div>
                          ))}
                          <div onClick={() => { setShowClientDropdown(false); setShowNewClient(true); }}
                            style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--amber)' }}>
                            + Crear cliente nuevo
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
              <div className="form-group">
                <label>¿Qué necesita el cliente? *</label>
                <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ej: Instalación cámaras CCTV" />
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Toda la información posible sobre lo que pide el cliente..." />
              </div>
              <div className="form-group">
                <label>Vendedor</label>
                <input value={form.salesperson} onChange={e => set('salesperson', e.target.value)} placeholder="Nombre del vendedor" />
              </div>
              <div className="form-group">
                <label>Notas internas</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notas internas del equipo..." />
              </div>
            </div>

            {/* Imágenes */}
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>📷 Imágenes (hasta 10)</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: images.length ? 12 : 0 }}>
                {images.map((img, idx) => (
                  <div key={idx} style={{ position: 'relative', width: 84, height: 84 }}>
                    <img src={img.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: '1.5px solid var(--border)' }} />
                    <button type="button" onClick={() => removeImage(idx)}
                      style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: 'var(--warn)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
              {images.length < 10 && (
                <label className="btn btn-ghost" style={{ display: 'inline-flex', cursor: 'pointer', fontSize: 12.5 }}>
                  + Agregar imágenes
                  <input type="file" accept="image/*" multiple onChange={handleImageSelect} style={{ display: 'none' }} />
                </label>
              )}
            </div>

            {/* Evaluación en sitio */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>📍 Evaluación en sitio</p>
                <button type="button" onClick={() => setWantsAssessment(w => !w)}
                  style={{ width: 44, height: 24, borderRadius: 20, border: 'none', cursor: 'pointer', position: 'relative', background: wantsAssessment ? 'var(--amber)' : 'var(--border-strong)', transition: 'background 0.2s' }}>
                  <span style={{ position: 'absolute', top: 2, left: wantsAssessment ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'var(--surface)', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                </button>
              </div>
              {wantsAssessment && (
                <div style={{ marginTop: 16 }}>
                  <div className="form-group">
                    <label>Fecha y hora de la visita</label>
                    <input type="datetime-local" value={assessmentDate} onChange={e => setAssessmentDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Instrucciones para el técnico</label>
                    <textarea value={assessmentInstructions} onChange={e => setAssessmentInstructions(e.target.value)} placeholder="Ej: Tomar notas sobre control de acceso" />
                  </div>
                </div>
              )}
            </div>

            {/* Propiedad */}
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>🏠 Propiedad</p>
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
                  {mapsLinks.direct ? (
                    <a href={mapsLinks.direct} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                      🗺️ Abrir ubicación
                    </a>
                  ) : (
                    <>
                      <a href={mapsLinks.google} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                        🗺️ Google Maps
                      </a>
                      <a href={mapsLinks.apple} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#000', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                        🍎 Apple Maps
                      </a>
                      <a href={mapsLinks.waze} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#33CCFF', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                        🚗 Waze
                      </a>
                    </>
                  )}
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
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Producto / Servicio (opcional)</p>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addItem}>+ Agregar línea</button>
              </div>
              {items.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Aún no hay líneas. Se pueden agregar después de la evaluación en sitio.</p>}
              {items.map((item, idx) => (
                <LineItemRow
                  key={idx}
                  type={item.type}
                  onTypeChange={v => setItem(idx, 'type', v)}
                  description={item.description}
                  onDescriptionChange={v => handleDescriptionSelect(idx, v)}
                  catalogOptions={catalogItems.filter(c => c.type === item.type)}
                  datalistId={`catalog-${idx}`}
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
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {items.length > 0 && (
              <div className="card">
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Resumen IVU</p>
                {clientType === 'b2b' && (
                  <div style={{ background: 'var(--info-tint)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--info)', fontWeight: 600 }}>
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
            )}
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? 'Guardando...' : 'Guardar solicitud'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => router.back()} style={{ width: '100%', justifyContent: 'center' }}>Cancelar</button>
          </div>
        </form>
      </main>
    </div>
  );
}
