'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '../../Sidebar';
import LineItemRow from '../../LineItemRow';
import LineItemPicker from '../../LineItemPicker';
import CableCalculator from '../../CableCalculator';
import TaxBreakdown from '../../TaxBreakdown';
import { calcularIVU } from '../../../lib/tax';
import { buildMapsLinks } from '../../../lib/mapsLinks';
import { localInputToIso } from '../../../lib/datetimeLocal';
import { useTranslations } from 'next-intl';

export default function NuevoTrabajo() {
  return <NuevoTrabajoForm />;
}

function emptyItem(overrides = {}) {
  return {
    key: Math.random().toString(36).slice(2),
    parentKey: null, combinePrice: true,
    type: 'labor', tax_category: 'labor', title: '', description: '', note: '', quantity: 1,
    unit_price: '', msrp: '', supplier_price: '', exempt: false, vendor: '',
    photoFile: null, photoPreview: null, existingPhotoPath: null,
    ...overrides,
  };
}
function emptyArea(name) {
  return { key: Math.random().toString(36).slice(2), name, items: [emptyItem()] };
}

function NuevoTrabajoForm() {
  const t = useTranslations('trabajos.newJob');
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientParam = searchParams.get('client');
  const [catalogItems, setCatalogItems] = useState([]);
  const [taxRules, setTaxRules] = useState([]);
  const [clients, setClients] = useState([]);
  const [properties, setProperties] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({
    client_id: '', title: '', description: '', status: 'estimate',
    scheduled_start: '', scheduled_end: '', notes: '', bill_to: 'person',
    property_id: '', contacts: [],
    property_name: '', street: '', city: '', state: 'PR', zip: '',
  });
  const [contactDraft, setContactDraft] = useState({ contact_id: '', name: '', phone: '', email: '', cargo: '' });
  const [editingContactKey, setEditingContactKey] = useState(null);
  const [areas, setAreas] = useState(() => [emptyArea(t('areaName', { number: 1 }))]);
  const [areaMenuOpen, setAreaMenuOpen] = useState(null);
  const [dragItem, setDragItem] = useState(null); // { areaKey, itemKey } — item currently being dragged
  const [cableCalcTarget, setCableCalcTarget] = useState(null); // { areaKey } — which area the calculator adds into, or null when closed
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [quickSuccess, setQuickSuccess] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);
  const [showNewProperty, setShowNewProperty] = useState(false);

  useEffect(() => {
    supabase.from('clients').select('id, name, client_type, company, report_name_source').order('name').then(({ data }) => setClients(data ?? []));
    supabase.from('catalog_items').select('*').order('item_code').then(({ data }) => setCatalogItems(data ?? []));
    supabase.from('tax_rules').select('client_type, line_item_type, rate').then(({ data }) => setTaxRules(data ?? []));
  }, []);

  useEffect(() => {
    if (!clientParam || !clients.length) return;
    const match = clients.find(c => c.id === clientParam);
    if (match) {
      setForm(f => (f.client_id ? f : { ...f, client_id: match.id, bill_to: match.report_name_source === 'company' ? 'company' : 'person' }));
    }
  }, [clientParam, clients]);

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
    if (p) {
      setForm(f => ({ ...f, property_name: p.name ?? '', street: p.street ?? '', city: p.city ?? '', state: p.state ?? 'PR', zip: p.zip ?? '' }));
    }
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
  const selectedClient = clients.find(c => c.id === form.client_id);
  const clientType = selectedClient?.client_type ?? 'final';
  const hasCompany = !!selectedClient?.company;
  const selectedProperty = properties.find(p => p.id === form.property_id);

  function addArea() {
    setAreas(prev => [...prev, emptyArea(t('areaName', { number: prev.length + 1 }))]);
  }
  function removeArea(areaKey) {
    setAreas(prev => prev.filter(a => a.key !== areaKey));
  }
  function updateAreaName(areaKey, name) {
    setAreas(prev => prev.map(a => a.key === areaKey ? { ...a, name } : a));
  }
  function addItem(areaKey, overrides = {}) {
    setAreas(prev => prev.map(a => a.key === areaKey ? { ...a, items: [...a.items, emptyItem(overrides)] } : a));
  }
  // Used by the cable/tubo calculator — merges a prefilled item into a specific
  // area instead of appending a blank one. The calculator's own `area` field is
  // dropped since grouping here already happens structurally, by area section.
  function addPrefilledItem(areaKey, { area, ...item }) {
    addItem(areaKey, { type: 'product', tax_category: 'product', ...item });
  }
  async function addFromCatalog(areaKey, catalogItem) {
    let existingPhotoPath = null, photoPreview = null;
    if (catalogItem.photo_url) {
      const { data } = await supabase.storage.from('Job-photos').createSignedUrl(catalogItem.photo_url, 3600);
      existingPhotoPath = catalogItem.photo_url;
      photoPreview = data?.signedUrl ?? null;
    }
    addItem(areaKey, {
      type: catalogItem.type, tax_category: catalogItem.tax_category,
      title: catalogItem.name || '', description: catalogItem.description,
      unit_price: catalogItem.price ?? '', msrp: catalogItem.msrp ?? '', supplier_price: catalogItem.supplier_price ?? '',
      vendor: catalogItem.vendor || '', photoPreview, existingPhotoPath,
    });
  }
  // Accessories are inserted right after the last item already belonging to
  // their parent's group, so they stay visually grouped under it.
  function addAccessory(areaKey, parentKey) {
    setAreas(prev => prev.map(a => {
      if (a.key !== areaKey) return a;
      let insertAt = a.items.findIndex(it => it.key === parentKey);
      const parentType = a.items[insertAt]?.type || 'product';
      for (let i = insertAt + 1; i < a.items.length; i++) {
        if (a.items[i].parentKey === parentKey) insertAt = i;
        else break;
      }
      const items = [...a.items];
      items.splice(insertAt + 1, 0, emptyItem({ parentKey, type: parentType, tax_category: parentType === 'fee' ? 'labor' : parentType }));
      return { ...a, items };
    }));
  }
  function removeItem(areaKey, itemKey) {
    setAreas(prev => prev.map(a => a.key === areaKey ? { ...a, items: a.items.filter(it => it.key !== itemKey && it.parentKey !== itemKey) } : a));
  }
  // Moves a top-level item + its trailing accessory block (contiguous in the
  // items array, linked by parentKey) from one area to another, or reorders
  // it within the same area. beforeItemKey is where to insert — null appends
  // at the end of the target area.
  function moveItem(fromAreaKey, itemKey, toAreaKey, beforeItemKey) {
    setAreas(prev => {
      const fromArea = prev.find(a => a.key === fromAreaKey);
      if (!fromArea) return prev;
      const startIdx = fromArea.items.findIndex(it => it.key === itemKey);
      if (startIdx === -1) return prev;
      let endIdx = startIdx;
      while (endIdx + 1 < fromArea.items.length && fromArea.items[endIdx + 1].parentKey === itemKey) endIdx++;
      const block = fromArea.items.slice(startIdx, endIdx + 1);
      const blockKeys = new Set(block.map(it => it.key));
      if (beforeItemKey && blockKeys.has(beforeItemKey)) return prev;

      const afterRemoval = prev.map(a => a.key === fromAreaKey ? { ...a, items: a.items.filter(it => !blockKeys.has(it.key)) } : a);
      return afterRemoval.map(a => {
        if (a.key !== toAreaKey) return a;
        const items = [...a.items];
        const insertIdx = beforeItemKey ? items.findIndex(it => it.key === beforeItemKey) : -1;
        items.splice(insertIdx === -1 ? items.length : insertIdx, 0, ...block);
        return { ...a, items };
      });
    });
  }
  function setItem(areaKey, itemKey, k, v) {
    setAreas(prev => prev.map(a => a.key === areaKey ? { ...a, items: a.items.map(it => it.key === itemKey ? { ...it, [k]: v } : it) } : a));
  }
  function setItemType(areaKey, itemKey, type) {
    setAreas(prev => prev.map(a => a.key === areaKey
      ? { ...a, items: a.items.map(it => it.key === itemKey ? { ...it, type, tax_category: type === 'fee' ? (it.tax_category || 'labor') : type } : it) }
      : a));
  }
  function handleItemPhoto(areaKey, itemKey, file) {
    if (!file) return;
    setAreas(prev => prev.map(a => a.key === areaKey
      ? { ...a, items: a.items.map(it => it.key === itemKey ? { ...it, photoFile: file, photoPreview: URL.createObjectURL(file), existingPhotoPath: null } : it) }
      : a));
  }
  async function applyCatalogItemPhoto(areaKey, itemKey, match) {
    const current = areas.find(a => a.key === areaKey)?.items.find(it => it.key === itemKey);
    if (!current || current.photoFile || current.existingPhotoPath || !match.photo_url) return;
    const { data } = await supabase.storage.from('Job-photos').createSignedUrl(match.photo_url, 3600);
    setAreas(prev => prev.map(a => a.key === areaKey
      ? { ...a, items: a.items.map(it => it.key === itemKey && !it.photoFile && !it.existingPhotoPath ? { ...it, existingPhotoPath: match.photo_url, photoPreview: data?.signedUrl ?? it.photoPreview } : it) }
      : a));
  }
  function handleDescriptionSelect(areaKey, itemKey, value) {
    const match = catalogItems.find(c => `${c.item_code} — ${c.description}` === value);
    if (match) {
      setAreas(prev => prev.map(a => a.key === areaKey
        ? { ...a, items: a.items.map(it => it.key === itemKey ? {
              ...it, type: match.type, tax_category: match.tax_category, description: match.description, unit_price: match.price ?? '', msrp: match.msrp ?? '', supplier_price: match.supplier_price ?? '',
              vendor: it.vendor || match.vendor || '', title: it.title || match.name || '',
            } : it) } : a));
      applyCatalogItemPhoto(areaKey, itemKey, match);
    } else {
      setItem(areaKey, itemKey, 'description', value);
    }
  }
  function handleTitleSelect(areaKey, itemKey, value) {
    const match = catalogItems.find(c => `${c.item_code} — ${c.description}` === value);
    if (match) {
      setAreas(prev => prev.map(a => a.key === areaKey
        ? { ...a, items: a.items.map(it => it.key === itemKey ? {
              ...it, type: match.type, tax_category: match.tax_category, title: match.name || match.item_code, description: it.description || match.description,
              unit_price: match.price ?? '', msrp: match.msrp ?? '', supplier_price: match.supplier_price ?? '',
              vendor: it.vendor || match.vendor || '',
            } : it) } : a));
      applyCatalogItemPhoto(areaKey, itemKey, match);
    } else {
      setItem(areaKey, itemKey, 'title', value);
    }
  }

  const flatItems = areas.flatMap(a => a.items);
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  const vendorOptions = [...new Set(catalogItems.map(i => i.vendor).filter(Boolean))];
  // Accessories only carry their own weight in the total when their parent
  // has opted out of "Combinar precio" — otherwise the parent's own price is
  // assumed to already include them.
  function itemLineTotal(it, area) {
    if (it.parentKey) {
      const parent = area?.items.find(p => p.key === it.parentKey);
      if (!parent || parent.combinePrice !== false) return 0;
    }
    return (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
  }
  function areaTotal(area) {
    return area.items.reduce((s, it) => s + itemLineTotal(it, area), 0);
  }
  // calcularIVU/TaxBreakdown sum quantity*unit_price directly with no
  // parent/child awareness, so bundled accessories need their price zeroed
  // out here before they're fed in — same net effect as itemLineTotal above.
  const flatItemsForTax = areas.flatMap(a => a.items.map(it => it.parentKey && itemLineTotal(it, a) === 0 ? { ...it, unit_price: 0 } : it));
  const ivuResult = calcularIVU(flatItemsForTax, clientType, taxRules);

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
        status: quickMode ? 'estimate' : form.status,
        notes: form.notes || null,
        bill_to: form.bill_to,
        scheduled_start: quickMode ? null : localInputToIso(form.scheduled_start),
        scheduled_end: quickMode ? null : localInputToIso(form.scheduled_end),
        property_id: form.property_id || null,
        property_name: form.property_name || null,
        street: form.street || null,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
      }]).select().single();

      if (err) { setError(err.message); return; }

      if (form.contacts.length > 0) {
        await supabase.from('job_contacts').insert(form.contacts.map(c => ({
          job_id: job.id,
          contact_id: c.contact_id || null,
          name: c.name.trim(),
          phone: c.phone.trim() || null,
          email: c.email.trim() || null,
          cargo: c.cargo.trim() || null,
        })));
      }

      if (!quickMode) {
        async function uploadItemPhoto(i, sortOrder) {
          if (!i.photoFile) return i.existingPhotoPath ?? null;
          const ext = i.photoFile.name.split('.').pop();
          const path = `${job.id}/${Date.now()}-${sortOrder}.${ext}`;
          const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, i.photoFile);
          return upErr ? null : path;
        }

        // Parents are inserted first so their DB ids can be attached to their
        // accessories' parent_item_id in a second pass.
        let sortOrder = 0;
        const keyToId = {};
        for (const area of areas) {
          for (const i of area.items.filter(it => !it.parentKey && it.description.trim())) {
            const photoPath = await uploadItemPhoto(i, sortOrder);
            const { data: row } = await supabase.from('job_line_items').insert([{
              job_id: job.id, type: i.type, tax_category: i.tax_category || i.type, title: i.title || null, description: i.description, note: i.note?.trim() || null,
              quantity: parseFloat(i.quantity) || 1, unit_price: parseFloat(i.unit_price) || 0,
              msrp: i.msrp !== '' ? parseFloat(i.msrp) : null,
              supplier_price: i.supplier_price !== '' ? parseFloat(i.supplier_price) : null,
              exempt_reason: i.exempt ? 'Exento' : null,
              area: area.name || null, vendor: i.vendor || null,
              combine_price: i.combinePrice !== false,
              photo_url: photoPath,
              sort_order: sortOrder++,
            }]).select().single();
            if (row) keyToId[i.key] = row.id;
          }
        }
        for (const area of areas) {
          for (const i of area.items.filter(it => it.parentKey && it.description.trim() && keyToId[it.parentKey])) {
            const photoPath = await uploadItemPhoto(i, sortOrder);
            await supabase.from('job_line_items').insert([{
              job_id: job.id, type: i.type, tax_category: i.tax_category || i.type, description: i.description, note: i.note?.trim() || null,
              quantity: parseFloat(i.quantity) || 1, unit_price: parseFloat(i.unit_price) || 0,
              msrp: i.msrp !== '' ? parseFloat(i.msrp) : null,
              supplier_price: i.supplier_price !== '' ? parseFloat(i.supplier_price) : null,
              exempt_reason: i.exempt ? 'Exento' : null,
              area: area.name || null, parent_item_id: keyToId[i.parentKey],
              photo_url: photoPath,
              sort_order: sortOrder++,
            }]);
          }
        }
      }

      if (quickMode) {
        setForm({
          client_id: '', title: '', description: '', status: 'estimate',
          scheduled_start: '', scheduled_end: '', notes: '', bill_to: 'person',
          property_id: '', contacts: [],
          property_name: '', street: '', city: '', state: 'PR', zip: '',
        });
        setContactDraft({ contact_id: '', name: '', phone: '', email: '', cargo: '' });
        setEditingContactKey(null);
        setClientSearch('');
        setShowNewClient(false);
        setQuickSuccess(true);
        setTimeout(() => setQuickSuccess(false), 3000);
        return;
      }
      router.push(`/trabajos/${job.id}`);
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
          <div className="page-title">{quickMode ? t('pageTitleQuick') : t('pageTitleNew')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>{t('quickToggleLabel')}</span>
            <button type="button" onClick={() => setQuickMode(q => !q)}
              style={{ width: 44, height: 24, borderRadius: 20, border: 'none', cursor: 'pointer', position: 'relative', background: quickMode ? 'var(--amber)' : 'var(--border-strong)', transition: 'background 0.2s' }}>
              <span style={{ position: 'absolute', top: 2, left: quickMode ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'var(--surface)', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </button>
          </div>
        </div>

        {quickMode && quickSuccess && (
          <div className="card" style={{ marginBottom: 20, background: 'var(--ok-tint)', border: '1.5px solid var(--ok)' }}>
            <p style={{ fontSize: 13, color: 'var(--navy)', margin: 0, fontWeight: 600 }}>
              {t('quickSuccessMessage')}
            </p>
          </div>
        )}

        {quickMode && !quickSuccess && (
          <div className="card" style={{ marginBottom: 20, background: 'var(--amber-tint)', border: '1.5px solid var(--amber)' }}>
            <p style={{ fontSize: 13, color: 'var(--navy)', margin: 0 }}>
              {t('quickModeInfoPre')} <strong>{t('quickModeInfoBold')}</strong> {t('quickModeInfoPost')}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: quickMode ? '1fr' : '1fr 340px', gap: 20, alignItems: 'start' }}>
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
                    <button type="button" onClick={() => { set('client_id', ''); set('bill_to', 'person'); setClientSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, fontWeight: 700 }}>{t('change')}</button>
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
                            <div key={c.id} onClick={() => { set('client_id', c.id); set('bill_to', c.report_name_source === 'company' ? 'company' : 'person'); setClientSearch(''); setShowClientDropdown(false); }}
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
              {hasCompany && (
                <div className="form-group" style={{ marginTop: 4 }}>
                  <label>{t('billToLabel')}</label>
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
              <div className="form-group">
                <label>{quickMode ? t('jobTitleLabelQuick') : t('jobTitleLabel')}</label>
                <input value={form.title} onChange={e => set('title', e.target.value)} placeholder={t('jobTitlePlaceholder')} />
              </div>

              {!quickMode && (
                <>
                  <div className="form-group">
                    <label>{t('statusLabel')}</label>
                    <select value={form.status} onChange={e => set('status', e.target.value)}>
                      <option value="estimate">{t('status.estimate')}</option>
                      <option value="scheduled">{t('status.scheduled')}</option>
                      <option value="in_progress">{t('status.in_progress')}</option>
                      <option value="completed">{t('status.completed')}</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>{t('startDateLabel')}</label>
                      <input type="datetime-local" value={form.scheduled_start} onChange={e => set('scheduled_start', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>{t('endDateLabel')}</label>
                      <input type="datetime-local" value={form.scheduled_end} onChange={e => set('scheduled_end', e.target.value)} />
                    </div>
                  </div>
                </>
              )}
              <div className="form-group">
                <label>{t('notesLabel')}</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder={t('notesPlaceholder')} />
              </div>
            </div>

            {!quickMode && (
              <>
                {/* Propiedad */}
                <div className="card">
                  <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>{t('propertySection')}</p>
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

                {/* Áreas de trabajo */}
                <div className="card">
                  <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>{t('areasSection')}</p>

                  {areas.map((area, areaIndex) => (
                    <div key={area.key}
                      onDragOver={e => { if (dragItem) e.preventDefault(); }}
                      onDrop={e => { e.preventDefault(); if (dragItem) { moveItem(dragItem.areaKey, dragItem.itemKey, area.key, null); setDragItem(null); } }}
                      style={{ background: 'var(--surface-2)', border: dragItem ? '1px dashed var(--border-strong)' : '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <input value={area.name} onChange={e => updateAreaName(area.key, e.target.value)}
                          style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', border: 'none', background: 'none', padding: 0 }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>{t('areaTotal', { name: area.name, total: fmt(areaTotal(area)) })}</span>
                          <div style={{ position: 'relative' }}>
                            <button type="button" onClick={() => setAreaMenuOpen(o => o === area.key ? null : area.key)}
                              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}>⋮</button>
                            {areaMenuOpen === area.key && (
                              <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setAreaMenuOpen(null)} />
                                <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 4, minWidth: 160, whiteSpace: 'nowrap' }}>
                                  <button type="button" disabled={areas.length <= 1}
                                    onClick={() => { removeArea(area.key); setAreaMenuOpen(null); }}
                                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 10px', fontSize: 12.5, cursor: areas.length <= 1 ? 'default' : 'pointer', borderRadius: 6, color: areas.length <= 1 ? 'var(--muted)' : 'var(--warn)' }}>
                                    {t('deleteArea')}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ marginBottom: 10 }}>
                        <LineItemPicker catalogOptions={catalogItems} onSelect={item => addFromCatalog(area.key, item)} placeholder={t('catalogSearchPlaceholder')} />
                      </div>

                      {area.items.map((item, itemIndex) => (
                        item.parentKey ? (() => {
                          const parent = area.items.find(p => p.key === item.parentKey);
                          const showPricing = parent?.combinePrice === false;
                          return (
                            <LineItemRow
                              key={item.key}
                              isAccessory
                              showPricing={showPricing}
                              description={item.description}
                              onDescriptionChange={v => setItem(area.key, item.key, 'description', v)}
                              note={item.note}
                              onNoteChange={v => setItem(area.key, item.key, 'note', v)}
                              catalogOptions={catalogItems}
                              datalistId={`catalog-${areaIndex}-${itemIndex}`}
                              quantity={item.quantity}
                              onQuantityChange={v => setItem(area.key, item.key, 'quantity', v)}
                              msrp={item.msrp}
                              onMsrpChange={v => setItem(area.key, item.key, 'msrp', v)}
                              unitPrice={item.unit_price}
                              onUnitPriceChange={v => setItem(area.key, item.key, 'unit_price', v)}
                              supplierPrice={item.supplier_price}
                              onSupplierPriceChange={v => setItem(area.key, item.key, 'supplier_price', v)}
                              photoUrl={item.photoPreview}
                              onPhotoSelect={file => handleItemPhoto(area.key, item.key, file)}
                              fmt={fmt}
                              actions={
                                <button type="button" onClick={() => removeItem(area.key, item.key)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 15 }}>×</button>
                              }
                            />
                          );
                        })() : (
                        <div key={item.key}
                          onDragOver={e => { if (dragItem) e.preventDefault(); }}
                          onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragItem) { moveItem(dragItem.areaKey, dragItem.itemKey, area.key, item.key); setDragItem(null); } }}
                          style={{ opacity: dragItem?.itemKey === item.key ? 0.4 : 1 }}
                        >
                          <LineItemRow
                            type={item.type}
                            onTypeChange={v => setItemType(area.key, item.key, v)}
                            title={item.title}
                            onTitleChange={v => handleTitleSelect(area.key, item.key, v)}
                            description={item.description}
                            onDescriptionChange={v => handleDescriptionSelect(area.key, item.key, v)}
                            note={item.note}
                            onNoteChange={v => setItem(area.key, item.key, 'note', v)}
                            catalogOptions={catalogItems.filter(c => c.type === item.type)}
                            datalistId={`catalog-${areaIndex}-${itemIndex}`}
                            quantity={item.quantity}
                            onQuantityChange={v => setItem(area.key, item.key, 'quantity', v)}
                            msrp={item.msrp}
                            onMsrpChange={v => setItem(area.key, item.key, 'msrp', v)}
                            unitPrice={item.unit_price}
                            onUnitPriceChange={v => setItem(area.key, item.key, 'unit_price', v)}
                            supplierPrice={item.supplier_price}
                            onSupplierPriceChange={v => setItem(area.key, item.key, 'supplier_price', v)}
                            exempt={item.exempt}
                            onExemptChange={v => setItem(area.key, item.key, 'exempt', v)}
                            vendor={item.vendor}
                            onVendorChange={v => setItem(area.key, item.key, 'vendor', v)}
                            vendorOptions={vendorOptions}
                            photoUrl={item.photoPreview}
                            onPhotoSelect={file => handleItemPhoto(area.key, item.key, file)}
                            fmt={fmt}
                            actions={
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span
                                  draggable
                                  onDragStart={() => setDragItem({ areaKey: area.key, itemKey: item.key })}
                                  onDragEnd={() => setDragItem(null)}
                                  title={t('dragToMoveArea')}
                                  style={{ cursor: 'grab', color: 'var(--muted)', fontSize: 15, padding: '0 4px', userSelect: 'none' }}
                                >⠿</span>
                                <button type="button" onClick={() => removeItem(area.key, item.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
                              </div>
                            }
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 32, marginBottom: 8, marginTop: -4 }}>
                            <button type="button" onClick={() => addAccessory(area.key, item.key)}
                              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, padding: 0 }}>
                              {t('addAccessory')}
                            </button>
                            {area.items.some(child => child.parentKey === item.key) && (
                              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}
                                title={t('combinePriceTitle')}>
                                <input type="checkbox" checked={item.combinePrice !== false}
                                  onChange={e => setItem(area.key, item.key, 'combinePrice', e.target.checked)} />
                                {t('combinePriceLabel')}
                              </label>
                            )}
                          </div>
                        </div>
                        )
                      ))}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => addItem(area.key, { type: 'product', tax_category: 'product' })}>{t('addProduct')}</button>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => addItem(area.key)}>{t('addLabor')}</button>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => setCableCalcTarget({ areaKey: area.key })}>{t('calculateCable')}</button>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addArea}>{t('addArea')}</button>
                </div>
              </>
            )}

            {quickMode && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? t('saving') : t('createRequest')}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => router.back()} style={{ justifyContent: 'center' }}>{t('cancel')}</button>
              </div>
            )}
          </div>

          {/* IVU Summary — solo en modo completo */}
          {!quickMode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card">
                <TaxBreakdown
                  lineas={flatItemsForTax} clientType={clientType} taxRules={taxRules} title={t('taxSummaryTitle')}
                  note={clientType === 'b2b' && (
                    <div style={{ background: 'var(--info-tint)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--info)', fontWeight: 600 }}>
                      {t('b2bLaborNote')}
                    </div>
                  )}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                {saving ? t('saving') : t('saveJob')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => router.back()} style={{ width: '100%', justifyContent: 'center' }}>{t('cancel')}</button>
            </div>
          )}
        </form>
        {cableCalcTarget && (
          <CableCalculator
            vendorOptions={vendorOptions}
            catalogItems={catalogItems}
            onAdd={item => { addPrefilledItem(cableCalcTarget.areaKey, item); setCableCalcTarget(null); }}
            onClose={() => setCableCalcTarget(null)}
          />
        )}
      </main>
    </div>
  );
}
