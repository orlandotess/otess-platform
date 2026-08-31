'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Sidebar from '../../Sidebar';
import LineItemRow from '../../LineItemRow';
import LineItemPicker from '../../LineItemPicker';
import TaxBreakdown from '../../TaxBreakdown';
import { calcularIVU } from '../../../lib/tax';
import { buildMapsLinks } from '../../../lib/mapsLinks';
import { localInputToIso } from '../../../lib/datetimeLocal';
import { uploadFileWithProgress } from '../../../lib/uploadWithProgress';

export default function NuevaSolicitud() {
  const router = useRouter();
  const t = useTranslations('solicitudes.newSolicitud');
  const [catalogItems, setCatalogItems] = useState([]);
  const [taxRules, setTaxRules] = useState([]);
  const [clients, setClients] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [properties, setProperties] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({
    client_id: '', title: '', description: '', notes: '', salesperson: 'Orlando Tapia',
    property_id: '', contacts: [],
    property_name: '', street: '', city: '', state: 'PR', zip: '',
  });
  const [contactDraft, setContactDraft] = useState({ contact_id: '', name: '', phone: '', email: '', cargo: '' });
  const [editingContactKey, setEditingContactKey] = useState(null);
  const [wantsAssessment, setWantsAssessment] = useState(false);
  const [assessmentDate, setAssessmentDate] = useState('');
  const [assessmentInstructions, setAssessmentInstructions] = useState('');
  const [technicianIds, setTechnicianIds] = useState([]);
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
  const [showNewProperty, setShowNewProperty] = useState(false);

  useEffect(() => {
    supabase.from('clients').select('id, name, client_type, company').order('name').then(({ data }) => setClients(data ?? []));
    supabase.from('catalog_items').select('*').order('item_code').then(({ data }) => setCatalogItems(data ?? []));
    supabase.from('tax_rules').select('client_type, line_item_type, rate').then(({ data }) => setTaxRules(data ?? []));
    supabase.from('technicians').select('id, name').order('name').then(({ data }) => setTechnicians(data ?? []));
  }, []);

  useEffect(() => {
    if (!form.client_id) { setProperties([]); setContacts([]); return; }
    setShowNewProperty(false);
    setForm(f => ({ ...f, property_id: '', contacts: [] }));
    setContactDraft({ contact_id: '', name: '', phone: '', email: '', cargo: '' });
    setEditingContactKey(null);
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

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function pickExistingContact(contactId) {
    const c = contacts.find(c => c.id === contactId);
    if (c) setContactDraft(d => ({ ...d, contact_id: c.id, name: c.name ?? '', phone: c.phone ?? '', email: c.email ?? '' }));
    else setContactDraft(d => ({ ...d, contact_id: '' }));
  }
  function addContact() {
    if (!contactDraft.name.trim()) return;
    if (editingContactKey) {
      setForm(f => ({ ...f, contacts: f.contacts.map(c => c.key === editingContactKey ? { ...contactDraft, key: c.key } : c) }));
      setEditingContactKey(null);
    } else {
      setForm(f => ({ ...f, contacts: [...f.contacts, { ...contactDraft, key: Math.random().toString(36).slice(2) }] }));
    }
    setContactDraft({ contact_id: '', name: '', phone: '', email: '', cargo: '' });
  }
  function editContact(key) {
    const c = form.contacts.find(c => c.key === key);
    if (!c) return;
    setContactDraft({ contact_id: c.contact_id, name: c.name, phone: c.phone, email: c.email, cargo: c.cargo });
    setEditingContactKey(key);
  }
  function cancelEditContact() {
    setEditingContactKey(null);
    setContactDraft({ contact_id: '', name: '', phone: '', email: '', cargo: '' });
  }
  function removeContact(key) {
    setForm(f => ({ ...f, contacts: f.contacts.filter(c => c.key !== key) }));
    if (editingContactKey === key) cancelEditContact();
  }
  const toggleTechnician = techId => setTechnicianIds(ids => ids.includes(techId) ? ids.filter(id => id !== techId) : [...ids, techId]);
  const selectedClient = clients.find(c => c.id === form.client_id);
  const clientType = selectedClient?.client_type ?? 'final';
  const selectedProperty = properties.find(p => p.id === form.property_id);

  const addItem = () => setItems(i => [...i, { type: 'labor', tax_category: 'labor', description: '', note: '', quantity: 1, unit_price: '', msrp: '', supplier_price: '', exempt: false, area: '', vendor: '', photoFile: null, photoPreview: null }]);
  async function addFromCatalog(catalogItem) {
    let photoPreview = null;
    if (catalogItem.photo_url) {
      const { data } = await supabase.storage.from('Job-photos').createSignedUrl(catalogItem.photo_url, 3600);
      photoPreview = data?.signedUrl ?? null;
    }
    setItems(i => [...i, {
      type: catalogItem.type, tax_category: catalogItem.tax_category,
      description: catalogItem.description, quantity: 1, unit_price: catalogItem.price ?? '',
      msrp: catalogItem.msrp ?? '', supplier_price: catalogItem.supplier_price ?? '',
      exempt: false, area: '', vendor: catalogItem.vendor || '',
      photoFile: null, photoPreview,
    }]);
  }
  const removeItem = idx => setItems(i => i.filter((_, n) => n !== idx));
  const setItem = (idx, k, v) => setItems(i => i.map((it, n) => n === idx ? { ...it, [k]: v } : it));
  const setItemType = (idx, type) => setItems(i => i.map((it, n) => n === idx ? { ...it, type, tax_category: type === 'fee' ? (it.tax_category || 'labor') : type } : it));
  function handleItemPhoto(idx, file) {
    if (!file) return;
    setItem(idx, 'photoFile', file);
    setItem(idx, 'photoPreview', URL.createObjectURL(file));
  }
  function handleDescriptionSelect(idx, value) {
    const match = catalogItems.find(c => `${c.item_code} — ${c.description}` === value);
    if (match) {
      setItems(prev => prev.map((it, n) => n === idx ? {
        ...it, type: match.type, tax_category: match.tax_category, description: match.description, unit_price: match.price ?? '', msrp: match.msrp ?? '', supplier_price: match.supplier_price ?? '',
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

  const taxResult = calcularIVU(items, clientType, taxRules);
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
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
    if (!form.client_id || !form.title.trim()) { setError(t('errorRequired')); return; }
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
        technician_id: wantsAssessment ? (technicianIds[0] ?? null) : null,
        property_id: form.property_id || null,
        property_name: form.property_name || null,
        street: form.street || null,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
      }]).select().single();

      if (err) { setError(err.message); return; }

      if (form.contacts.length > 0) {
        await supabase.from('solicitud_contacts').insert(form.contacts.map(c => ({
          solicitud_id: solicitud.id,
          contact_id: c.contact_id || null,
          name: c.name.trim(),
          phone: c.phone.trim() || null,
          email: c.email.trim() || null,
          cargo: c.cargo.trim() || null,
        })));
      }

      if (wantsAssessment && technicianIds.length > 1) {
        await supabase.from('solicitud_technicians').insert(
          technicianIds.slice(1).map(techId => ({ solicitud_id: solicitud.id, technician_id: techId }))
        );
      }

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
          solicitud_id: solicitud.id, type: i.type, tax_category: i.tax_category || i.type, description: i.description, note: i.note?.trim() || null,
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
      setError(e.message || t('errorGeneric'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-shell ds-trabajos">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">{t('pageTitle')}</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && <p style={{ color: 'var(--warn)', fontSize: 14 }}>{error}</p>}

            {/* Info general */}
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>{t('generalInfo')}</p>
              <div className="form-group" style={{ position: 'relative' }}>
                <label>{t('clientLabel')}</label>
                {selectedClient ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
                    <span style={{ flex: 1, fontWeight: 600 }}>{selectedClient.name}{selectedClient.client_type === 'b2b' ? t('b2bSuffix') : ''}</span>
                    <button type="button" onClick={() => { set('client_id', ''); setClientSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, fontWeight: 700 }}>{t('change')}</button>
                  </div>
                ) : showNewClient ? (
                  <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: 12 }}>
                    <input value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder={t('newClientNamePlaceholder')} style={{ marginBottom: 8 }} />
                    <input value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} placeholder={t('newClientPhonePlaceholder')} style={{ marginBottom: 8 }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={creatingClient} onClick={handleCreateQuickClient}>
                        {creatingClient ? t('creatingClient') : t('createClient')}
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setShowNewClient(false)}>{t('cancel')}</button>
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
                        placeholder={t('clientSearchPlaceholder')}
                        style={{ paddingLeft: 36 }}
                      />
                    </div>
                    {showClientDropdown && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setShowClientDropdown(false)} />
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 11, maxHeight: 240, overflowY: 'auto' }}>
                          {clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 ? (
                            <div style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: 13 }}>{t('noClientsFound')}</div>
                          ) : clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(c => (
                            <div key={c.id} onClick={() => { set('client_id', c.id); setClientSearch(''); setShowClientDropdown(false); }}
                              style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 500, borderBottom: '1px solid var(--border)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              {c.name}{c.client_type === 'b2b' ? t('b2bSuffix') : ''}
                            </div>
                          ))}
                          <div onClick={() => { setShowClientDropdown(false); setShowNewClient(true); }}
                            style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--amber)' }}>
                            {t('createNewClient')}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
              <div className="form-group">
                <label>{t('requestTitleLabel')}</label>
                <input value={form.title} onChange={e => set('title', e.target.value)} placeholder={t('requestTitlePlaceholder')} />
              </div>
              <div className="form-group">
                <label>{t('descriptionLabel')}</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder={t('descriptionPlaceholder')} />
              </div>
              <div className="form-group">
                <label>{t('salespersonLabel')}</label>
                <input value={form.salesperson} onChange={e => set('salesperson', e.target.value)} placeholder={t('salespersonPlaceholder')} />
              </div>
              <div className="form-group">
                <label>{t('notesLabel')}</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder={t('notesPlaceholder')} />
              </div>
            </div>

            {/* Imágenes */}
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>{t('imagesTitle')}</p>
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
                  {t('addImages')}
                  <input type="file" accept="image/*" multiple onChange={handleImageSelect} style={{ display: 'none' }} />
                </label>
              )}
            </div>

            {/* Evaluación en sitio */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{t('assessmentTitle')}</p>
                <button type="button" onClick={() => setWantsAssessment(w => !w)}
                  style={{ width: 44, height: 24, borderRadius: 20, border: 'none', cursor: 'pointer', position: 'relative', background: wantsAssessment ? 'var(--amber)' : 'var(--border-strong)', transition: 'background 0.2s' }}>
                  <span style={{ position: 'absolute', top: 2, left: wantsAssessment ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'var(--surface)', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                </button>
              </div>
              {wantsAssessment && (
                <div style={{ marginTop: 16 }}>
                  <div className="form-group">
                    <label>{t('assessmentDateLabel')}</label>
                    <input type="datetime-local" value={assessmentDate} onChange={e => setAssessmentDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>{t('assessmentInstructionsLabel')}</label>
                    <textarea value={assessmentInstructions} onChange={e => setAssessmentInstructions(e.target.value)} placeholder={t('assessmentInstructionsPlaceholder')} />
                  </div>
                  <div className="form-group">
                    <label>{t('techniciansLabel')}</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                      {technicians.map(tech => {
                        const checked = technicianIds.includes(tech.id);
                        return (
                          <label key={tech.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: checked ? 'var(--navy)' : 'var(--surface)', color: checked ? '#fff' : 'var(--navy)', border: '1.5px solid var(--border)', borderRadius: 20, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleTechnician(tech.id)} style={{ margin: 0 }} />
                            {tech.name}
                          </label>
                        );
                      })}
                      {technicians.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 12 }}>{t('noTechnicians')}</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Propiedad */}
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>{t('propertyTitle')}</p>
              {properties.length > 0 && !showNewProperty && (
                <div className="form-group">
                  <label>{t('clientPropertyLabel')}</label>
                  {selectedProperty ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
                      <span style={{ flex: 1, fontWeight: 600 }}>{selectedProperty.name}{selectedProperty.is_primary ? ' ★' : ''}{selectedProperty.city ? ` — ${selectedProperty.city}` : ''}</span>
                      <button type="button" onClick={() => set('property_id', '')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, fontWeight: 700 }}>{t('change')}</button>
                    </div>
                  ) : (
                    <>
                      <select value={form.property_id} onChange={e => set('property_id', e.target.value)}>
                        <option value="">{t('selectPropertyPlaceholder')}</option>
                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}{p.is_primary ? ' ★' : ''}</option>)}
                      </select>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px', marginTop: 8 }} onClick={() => setShowNewProperty(true)}>{t('addNewProperty')}</button>
                    </>
                  )}
                </div>
              )}
              {(properties.length === 0 || showNewProperty || selectedProperty) && (
                <>
                  {properties.length > 0 && showNewProperty && (
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px', marginBottom: 12 }} onClick={() => setShowNewProperty(false)}>{t('useExistingProperty')}</button>
                  )}
                  <div className="form-group">
                    <label>{t('propertyNameLabel')}</label>
                    <input value={form.property_name} onChange={e => set('property_name', e.target.value)} placeholder={t('propertyNamePlaceholder')} />
                  </div>
                  <div className="form-group">
                    <label>{t('addressLabel')}</label>
                    <input value={form.street} onChange={e => set('street', e.target.value)} placeholder={t('addressPlaceholder')} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 10 }}>
                    <div className="form-group">
                      <label>{t('cityLabel')}</label>
                      <input value={form.city} onChange={e => set('city', e.target.value)} placeholder={t('cityPlaceholder')} />
                    </div>
                    <div className="form-group">
                      <label>{t('stateLabel')}</label>
                      <input value={form.state} onChange={e => set('state', e.target.value)} placeholder={t('statePlaceholder')} />
                    </div>
                    <div className="form-group">
                      <label>{t('zipLabel')}</label>
                      <input value={form.zip} onChange={e => set('zip', e.target.value)} placeholder={t('zipPlaceholder')} />
                    </div>
                  </div>
                </>
              )}
              {fullAddress && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {mapsLinks.direct ? (
                    <a href={mapsLinks.direct} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                      {t('openLocation')}
                    </a>
                  ) : (
                    <>
                      <a href={mapsLinks.google} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                        {t('googleMaps')}
                      </a>
                      <a href={mapsLinks.apple} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#000', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                        {t('appleMaps')}
                      </a>
                      <a href={mapsLinks.waze} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#33CCFF', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                        {t('waze')}
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Contacto */}
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>{t('contactsSection')}</p>
              {form.contacts.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {form.contacts.map(c => (
                    <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: c.key === editingContactKey ? 'var(--amber-tint)' : 'var(--surface-2)', borderRadius: 8 }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                        {c.cargo && <span style={{ fontSize: 13, color: 'var(--muted)' }}> — {c.cargo}</span>}
                        {(c.phone || c.email) && (
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <button type="button" onClick={() => editContact(c.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>{t('editContact')}</button>
                        <button type="button" onClick={() => removeContact(c.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warn)', fontSize: 14 }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {editingContactKey && (
                <p style={{ fontSize: 12.5, color: 'var(--amber)', fontWeight: 600, marginBottom: 10 }}>{t('editingContactNotice')}</p>
              )}
              {contacts.length > 0 && (
                <div className="form-group">
                  <label>{t('selectContactLabel')}</label>
                  <select value={contactDraft.contact_id} onChange={e => pickExistingContact(e.target.value)}>
                    <option value="">{t('selectContactPlaceholder')}</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.is_primary ? ' ★' : ''}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>{t('contactNameLabel')}</label>
                <input value={contactDraft.name} onChange={e => setContactDraft(d => ({ ...d, name: e.target.value }))} placeholder={t('contactNamePlaceholder')} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label>{t('phoneLabel')}</label>
                  <input value={contactDraft.phone} onChange={e => setContactDraft(d => ({ ...d, phone: e.target.value }))} placeholder={t('phonePlaceholder')} />
                </div>
                <div className="form-group">
                  <label>{t('emailLabel')}</label>
                  <input type="email" value={contactDraft.email} onChange={e => setContactDraft(d => ({ ...d, email: e.target.value }))} placeholder={t('emailPlaceholder')} />
                </div>
              </div>
              <div className="form-group">
                <label>{t('positionLabel')}</label>
                <input value={contactDraft.cargo} onChange={e => setContactDraft(d => ({ ...d, cargo: e.target.value }))} placeholder={t('positionPlaceholder')} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addContact} disabled={!contactDraft.name.trim()}>
                  {editingContactKey ? t('saveContactChanges') : t('addContact')}
                </button>
                {editingContactKey && (
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={cancelEditContact}>{t('cancel')}</button>
                )}
              </div>
            </div>

            {/* Líneas */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{t('lineItemsTitle')}</p>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addItem}>{t('addLine')}</button>
              </div>
              <div style={{ marginBottom: 16 }}>
                <LineItemPicker catalogOptions={catalogItems} onSelect={addFromCatalog} placeholder={t('catalogSearchPlaceholder')} />
              </div>
              {items.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('noLineItems')}</p>}
              {items.map((item, idx) => (
                <LineItemRow
                  key={idx}
                  type={item.type}
                  onTypeChange={v => setItemType(idx, v)}
                  description={item.description}
                  onDescriptionChange={v => handleDescriptionSelect(idx, v)}
                  note={item.note}
                  onNoteChange={v => setItem(idx, 'note', v)}
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
                <TaxBreakdown
                  lineas={items} clientType={clientType} taxRules={taxRules} title={t('taxSummaryTitle')}
                  note={clientType === 'b2b' && (
                    <div style={{ background: 'var(--info-tint)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--info)', fontWeight: 600 }}>
                      {t('b2bLaborNote')}
                    </div>
                  )}
                />
              </div>
            )}
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? t('saving') : t('saveButton')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => router.back()} style={{ width: '100%', justifyContent: 'center' }}>{t('cancel')}</button>
          </div>
        </form>
      </main>
    </div>
  );
}
