'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '../Sidebar';
import LineItemRow from '../LineItemRow';

function emptyItem(parentKey = null, itemType = 'labor') {
  return {
    key: Math.random().toString(36).slice(2),
    parentKey,
    item_type: itemType,
    description: '',
    quantity: 1,
    msrp: '',
    unit_price: '',
    supplier_price: '',
    exempt: false,
    discount: '',
    vendor: '',
    photoFile: null,
    photoPreview: null,
    existingPhotoPath: null,
  };
}
function emptyArea(name = 'Área 1') {
  return { key: Math.random().toString(36).slice(2), name, items: [emptyItem()] };
}
function emptyOption(name = 'Propuesta') {
  return {
    key: Math.random().toString(36).slice(2),
    name,
    description: '',
    is_recommended: false,
    areas: [emptyArea()],
  };
}

// Rebuilds the local {areas: [{name, items}]} builder shape from the flat
// proposal_line_items rows an option was loaded with — same parent_item_id
// grouping ProposalDocument.js's groupByArea() uses for display, so edit
// mode reconstructs exactly what's on screen.
function itemsToAreas(items) {
  const topLevel = (items ?? []).filter(it => !it.parent_item_id).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const areas = [];
  topLevel.forEach(parent => {
    const name = parent.area || 'General';
    let area = areas.find(a => a.name === name);
    if (!area) { area = { key: Math.random().toString(36).slice(2), name, items: [] }; areas.push(area); }
    const parentKey = Math.random().toString(36).slice(2);
    area.items.push({
      key: parentKey,
      parentKey: null,
      item_type: parent.item_type,
      description: parent.description,
      quantity: parent.quantity,
      msrp: parent.msrp ?? '',
      unit_price: parent.unit_price ?? '',
      supplier_price: parent.supplier_price ?? '',
      exempt: !!parent.exempt_reason,
      discount: parent.discount_amount ?? '',
      vendor: parent.vendor ?? '',
      photoFile: null,
      photoPreview: parent.photo_signed_url ?? null,
      existingPhotoPath: parent.photo_url ?? null,
    });
    const children = (items ?? []).filter(c => c.parent_item_id === parent.id).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    children.forEach(child => {
      area.items.push({
        key: Math.random().toString(36).slice(2),
        parentKey,
        item_type: child.item_type,
        description: child.description,
        quantity: child.quantity,
        msrp: '',
        unit_price: '',
        supplier_price: '',
        exempt: false,
        discount: '',
        photoFile: null,
        photoPreview: child.photo_signed_url ?? null,
        existingPhotoPath: child.photo_url ?? null,
      });
    });
  });
  return areas.length ? areas : [emptyArea()];
}

export default function PropuestaForm({ initialData = null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientIdParam = searchParams.get('client');
  const isEdit = !!initialData;

  const [clients, setClients] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [selectedClient, setSelectedClient] = useState(initialData ? {
    id: initialData.proposal.client_id,
    name: initialData.proposal.clients?.name,
    company: initialData.proposal.clients?.company,
    client_type: initialData.proposal.clients?.client_type,
  } : null);
  const [proposalNumber, setProposalNumber] = useState(initialData?.proposal.proposal_number ?? '');
  const [title, setTitle] = useState(initialData?.proposal.title ?? '');
  const [preparedBy, setPreparedBy] = useState(initialData?.proposal.prepared_by ?? '');
  const [introNote, setIntroNote] = useState(initialData?.proposal.intro_note ?? '');
  const [projectDescription, setProjectDescription] = useState(initialData?.proposal.project_description ?? '');
  const [requiresSignature, setRequiresSignature] = useState(initialData?.proposal.requires_signature ?? false);
  const [taxClientType, setTaxClientType] = useState(initialData?.proposal.tax_client_type ?? 'final');
  const [paymentSchedule, setPaymentSchedule] = useState(
    (initialData?.payments ?? []).map(p => ({
      key: Math.random().toString(36).slice(2),
      label: p.label,
      basis: p.basis,
      percent: p.percent,
      due_trigger: p.due_trigger ?? '',
    }))
  );

  function addPayment() {
    setPaymentSchedule(prev => [...prev, { key: Math.random().toString(36).slice(2), label: `Pago ${prev.length + 1}`, basis: 'parts', percent: '', due_trigger: '' }]);
  }
  function updatePayment(key, field, value) {
    setPaymentSchedule(prev => prev.map(p => p.key === key ? { ...p, [field]: value } : p));
  }
  function removePayment(key) {
    setPaymentSchedule(prev => prev.filter(p => p.key !== key));
  }
  const vendorOptions = [...new Set(catalogItems.map(i => i.vendor).filter(Boolean))];
  const [areaMenuOpen, setAreaMenuOpen] = useState(null);
  const [dragItem, setDragItem] = useState(null); // { areaKey, itemKey } — the item group currently being dragged
  const [selectedItemKeys, setSelectedItemKeys] = useState(new Set()); // parent item keys selected for bulk actions
  const [multiOption, setMultiOption] = useState((initialData?.options?.length ?? 0) > 1);
  const [options, setOptions] = useState(() => {
    if (!initialData?.options?.length) return [emptyOption('Propuesta')];
    return initialData.options.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(opt => ({
      key: Math.random().toString(36).slice(2),
      name: opt.name,
      description: opt.description ?? '',
      is_recommended: opt.is_recommended,
      areas: itemsToAreas(opt.items),
    }));
  });
  const [coverPhoto, setCoverPhoto] = useState(null);
  const [coverPreview, setCoverPreview] = useState(initialData?.proposal.cover_photo_signed_url ?? null);
  const [existingCoverPath, setExistingCoverPath] = useState(initialData?.proposal.cover_photo_url ?? null);
  const [terms, setTerms] = useState(initialData?.proposal.terms ?? 'Esta propuesta es válida por 30 días a partir de la fecha de envío. Los precios incluyen materiales y labor según lo descrito. Cualquier trabajo adicional fuera del alcance será cotizado por separado.');
  const [validUntil, setValidUntil] = useState(initialData?.proposal.valid_until ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('clients').select('id, name, client_type').order('name').then(({ data }) => setClients(data ?? []));
    supabase.from('catalog_items').select('*').order('item_code').then(({ data }) => setCatalogItems(data ?? []));
    if (!isEdit) {
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!session) return;
        // profiles.id doesn't always match auth.users.id in this app — look up by email.
        const { data: profile } = await supabase.from('profiles').select('name').eq('email', session.user.email).single();
        if (profile?.name) setPreparedBy(profile.name);
      });
    }
  }, []);

  useEffect(() => {
    if (!isEdit && clientIdParam && clients.length) {
      const match = clients.find(c => c.id === clientIdParam);
      if (match) {
        setSelectedClient(match);
        setTaxClientType(match.client_type === 'b2b' ? 'b2b' : 'final');
      }
    }
  }, [clientIdParam, clients]);

  function toggleMultiOption() {
    setMultiOption(m => {
      const next = !m;
      if (next && options.length === 1) {
        setOptions([{ ...options[0], name: 'Básico' }, emptyOption('Premium')]);
      }
      return next;
    });
  }
  function addOption() { setOptions(prev => [...prev, emptyOption(`Opción ${prev.length + 1}`)]); }
  function removeOption(key) { setOptions(prev => prev.filter(o => o.key !== key)); }
  function updateOption(key, field, value) { setOptions(prev => prev.map(o => o.key === key ? { ...o, [field]: value } : o)); }
  function setRecommended(key) { setOptions(prev => prev.map(o => ({ ...o, is_recommended: o.key === key }))); }

  function addArea(optKey) {
    setOptions(prev => prev.map(o => o.key === optKey ? { ...o, areas: [...o.areas, emptyArea(`Área ${o.areas.length + 1}`)] } : o));
  }
  function removeArea(optKey, areaKey) {
    setOptions(prev => prev.map(o => o.key === optKey ? { ...o, areas: o.areas.filter(a => a.key !== areaKey) } : o));
  }
  function updateAreaName(optKey, areaKey, name) {
    setOptions(prev => prev.map(o => o.key === optKey ? { ...o, areas: o.areas.map(a => a.key === areaKey ? { ...a, name } : a) } : o));
  }

  function addItem(optKey, areaKey, itemType = 'labor') {
    setOptions(prev => prev.map(o => o.key === optKey
      ? { ...o, areas: o.areas.map(a => a.key === areaKey ? { ...a, items: [...a.items, emptyItem(null, itemType)] } : a) }
      : o));
  }
  // Accessories are inserted right after the last item already belonging to
  // their parent's group, so they stay visually grouped under it.
  function addAccessory(optKey, areaKey, parentKey) {
    setOptions(prev => prev.map(o => o.key === optKey
      ? { ...o, areas: o.areas.map(a => {
          if (a.key !== areaKey) return a;
          let insertAt = a.items.findIndex(it => it.key === parentKey);
          for (let i = insertAt + 1; i < a.items.length; i++) {
            if (a.items[i].parentKey === parentKey) insertAt = i;
            else break;
          }
          const items = [...a.items];
          items.splice(insertAt + 1, 0, emptyItem(parentKey));
          return { ...a, items };
        }) }
      : o));
  }
  function removeItem(optKey, areaKey, itemKey) {
    setOptions(prev => prev.map(o => o.key === optKey
      ? { ...o, areas: o.areas.map(a => a.key === areaKey ? { ...a, items: a.items.filter(it => it.key !== itemKey && it.parentKey !== itemKey) } : a) }
      : o));
  }
  // Moves a parent item + its trailing accessory block (contiguous in the
  // items array, linked by parentKey) from one area to another, or reorders
  // it within the same area. beforeItemKey is where to insert — null appends
  // at the end of the target area.
  function moveItemGroup(optKey, fromAreaKey, itemKey, toAreaKey, beforeItemKey) {
    setOptions(prev => prev.map(o => {
      if (o.key !== optKey) return o;
      const fromArea = o.areas.find(a => a.key === fromAreaKey);
      if (!fromArea) return o;
      const startIdx = fromArea.items.findIndex(it => it.key === itemKey);
      if (startIdx === -1) return o;
      let endIdx = startIdx;
      while (endIdx + 1 < fromArea.items.length && fromArea.items[endIdx + 1].parentKey === itemKey) endIdx++;
      const block = fromArea.items.slice(startIdx, endIdx + 1);
      const blockKeys = new Set(block.map(it => it.key));
      if (beforeItemKey && blockKeys.has(beforeItemKey)) return o; // dropped onto itself/its own accessory

      const afterRemoval = o.areas.map(a => a.key === fromAreaKey
        ? { ...a, items: a.items.filter(it => !blockKeys.has(it.key)) }
        : a);
      const afterInsert = afterRemoval.map(a => {
        if (a.key !== toAreaKey) return a;
        const items = [...a.items];
        const insertIdx = beforeItemKey ? items.findIndex(it => it.key === beforeItemKey) : -1;
        items.splice(insertIdx === -1 ? items.length : insertIdx, 0, ...block);
        return { ...a, items };
      });
      return { ...o, areas: afterInsert };
    }));
  }

  function toggleItemSelection(itemKey) {
    setSelectedItemKeys(prev => {
      const next = new Set(prev);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
  }
  function clearSelection() { setSelectedItemKeys(new Set()); }

  // Deletes every selected parent item (+ its accessories), wherever it is.
  function bulkDeleteSelected() {
    setOptions(prev => prev.map(o => ({
      ...o,
      areas: o.areas.map(a => ({
        ...a,
        items: a.items.filter(it => !selectedItemKeys.has(it.key) && !selectedItemKeys.has(it.parentKey)),
      })),
    })));
    clearSelection();
  }
  // Moves every selected item group (within a single option) to the end of
  // the given area, preserving each group's internal parent+accessory order.
  function bulkMoveSelectedToArea(optKey, toAreaKey) {
    setOptions(prev => prev.map(o => {
      if (o.key !== optKey) return o;
      const blocks = [];
      const areasAfterRemoval = o.areas.map(a => {
        const remaining = [];
        let i = 0;
        while (i < a.items.length) {
          const it = a.items[i];
          if (!it.parentKey && selectedItemKeys.has(it.key)) {
            let j = i + 1;
            const block = [it];
            while (j < a.items.length && a.items[j].parentKey === it.key) { block.push(a.items[j]); j++; }
            blocks.push(block);
            i = j;
          } else {
            remaining.push(it);
            i++;
          }
        }
        return { ...a, items: remaining };
      });
      const areasAfterInsert = areasAfterRemoval.map(a => a.key === toAreaKey ? { ...a, items: [...a.items, ...blocks.flat()] } : a);
      return { ...o, areas: areasAfterInsert };
    }));
    clearSelection();
  }
  function updateItem(optKey, areaKey, itemKey, field, value) {
    setOptions(prev => prev.map(o => o.key === optKey
      ? { ...o, areas: o.areas.map(a => a.key === areaKey ? { ...a, items: a.items.map(it => it.key === itemKey ? { ...it, [field]: value } : it) } : a) }
      : o));
  }
  function handleCatalogSelect(optKey, areaKey, itemKey, value) {
    const match = catalogItems.find(c => `${c.item_code} — ${c.description}` === value);
    if (match) {
      setOptions(prev => prev.map(o => o.key === optKey
        ? { ...o, areas: o.areas.map(a => a.key === areaKey ? { ...a, items: a.items.map(it => it.key === itemKey ? {
              ...it, description: match.description, unit_price: match.price ?? '', msrp: match.msrp ?? '', supplier_price: match.supplier_price ?? '',
              vendor: it.vendor || match.vendor || '',
            } : it) } : a) }
        : o));
    } else {
      updateItem(optKey, areaKey, itemKey, 'description', value);
    }
  }
  function handleItemPhoto(optKey, areaKey, itemKey, file) {
    if (!file) return;
    setOptions(prev => prev.map(o => o.key === optKey
      ? { ...o, areas: o.areas.map(a => a.key === areaKey ? { ...a, items: a.items.map(it => it.key === itemKey ? {
            ...it, photoFile: file, photoPreview: URL.createObjectURL(file), existingPhotoPath: null,
          } : it) } : a) }
      : o));
  }

  function itemLineTotal(it) {
    if (it.parentKey) return 0;
    return (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0) - (parseFloat(it.discount) || 0);
  }
  function areaTotal(area) {
    return area.items.reduce((s, it) => s + itemLineTotal(it), 0);
  }
  function optionTotal(opt) {
    return opt.areas.reduce((sum, a) => sum + areaTotal(a), 0);
  }
  const fmt = n => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  function handleCoverPhoto(file) {
    if (!file) return;
    setCoverPhoto(file);
    setCoverPreview(URL.createObjectURL(file));
    setExistingCoverPath(null);
  }

  async function uploadItemPhoto(it, optionId, sortOrder) {
    if (!it.photoFile) return it.existingPhotoPath ?? null;
    const ext = it.photoFile.name.split('.').pop();
    const path = `proposals/${optionId}/${Date.now()}-${sortOrder}.${ext}`;
    const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, it.photoFile);
    return upErr ? null : path;
  }

  async function handleSave() {
    if (!selectedClient || !title.trim()) { setError('Cliente y título son requeridos'); return; }
    if (isEdit && !proposalNumber.trim()) { setError('El número de propuesta es requerido'); return; }
    setSaving(true); setError('');

    let proposal;
    if (isEdit) {
      const { data: current } = await supabase.from('proposals').select('status').eq('id', initialData.proposal.id).single();
      if (!current || !['borrador', 'enviada', 'vista', 'cambios_requeridos'].includes(current.status)) {
        setError('Esta propuesta ya no se puede editar (fue aprobada o rechazada).');
        setSaving(false);
        return;
      }
    }

    let coverPath = existingCoverPath;
    if (coverPhoto) {
      const ext = coverPhoto.name.split('.').pop();
      coverPath = `proposals/covers/${Date.now()}.${ext}`;
      await supabase.storage.from('Job-photos').upload(coverPath, coverPhoto);
    }

    if (isEdit) {
      const { data: updated, error: err } = await supabase.from('proposals').update({
        proposal_number: proposalNumber.trim(),
        client_id: selectedClient.id,
        title: title.trim(),
        prepared_by: preparedBy.trim() || null,
        intro_note: introNote.trim() || null,
        project_description: projectDescription.trim() || null,
        requires_signature: requiresSignature,
        tax_client_type: taxClientType,
        cover_photo_url: coverPath,
        terms: terms.trim() || null,
        valid_until: validUntil || null,
      }).eq('id', initialData.proposal.id).select().single();
      if (err) { setError(err.message); setSaving(false); return; }
      proposal = updated;

      const { data: existingOptions } = await supabase.from('proposal_options').select('id').eq('proposal_id', proposal.id);
      const optionIds = (existingOptions ?? []).map(o => o.id);
      if (optionIds.length) {
        await supabase.from('proposal_line_items').delete().in('option_id', optionIds);
        await supabase.from('proposal_options').delete().eq('proposal_id', proposal.id);
      }
      await supabase.from('proposal_payments').delete().eq('proposal_id', proposal.id);
    } else {
      const { data: last } = await supabase.from('proposals').select('proposal_number').order('created_at', { ascending: false }).limit(1).single();
      let nextNum = 1001;
      if (last?.proposal_number) {
        const n = parseInt(last.proposal_number.replace('PROP-', ''));
        if (!isNaN(n)) nextNum = n + 1;
      }

      const { data: created, error: err } = await supabase.from('proposals').insert([{
        proposal_number: `PROP-${nextNum}`,
        client_id: selectedClient.id,
        title: title.trim(),
        prepared_by: preparedBy.trim() || null,
        intro_note: introNote.trim() || null,
        project_description: projectDescription.trim() || null,
        requires_signature: requiresSignature,
        status: 'borrador',
        tax_client_type: taxClientType,
        cover_photo_url: coverPath,
        terms: terms.trim() || null,
        valid_until: validUntil || null,
      }]).select().single();
      if (err) { setError(err.message); setSaving(false); return; }
      proposal = created;
    }

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const { data: optRow, error: optErr } = await supabase.from('proposal_options').insert([{
        proposal_id: proposal.id,
        name: opt.name.trim() || `Opción ${i + 1}`,
        description: opt.description.trim() || null,
        is_recommended: opt.is_recommended,
        sort_order: i,
      }]).select().single();
      if (optErr) { setError(optErr.message); setSaving(false); return; }

      // Parents are inserted first so their DB ids can be attached to their
      // accessories' parent_item_id in a second pass.
      let sortOrder = 0;
      const keyToId = {};
      for (const area of opt.areas) {
        const parents = area.items.filter(it => !it.parentKey && it.description.trim());
        for (const it of parents) {
          const photoPath = await uploadItemPhoto(it, optRow.id, sortOrder);
          const { data: row } = await supabase.from('proposal_line_items').insert([{
            option_id: optRow.id,
            area: area.name,
            parent_item_id: null,
            item_type: it.item_type,
            description: it.description.trim(),
            quantity: parseFloat(it.quantity) || 1,
            msrp: it.msrp !== '' ? parseFloat(it.msrp) : null,
            unit_price: parseFloat(it.unit_price) || 0,
            supplier_price: it.supplier_price !== '' ? parseFloat(it.supplier_price) : null,
            exempt_reason: it.exempt ? 'Exento' : null,
            discount_amount: it.discount !== '' ? parseFloat(it.discount) : null,
            vendor: it.vendor || null,
            photo_url: photoPath,
            sort_order: sortOrder++,
          }]).select().single();
          if (row) keyToId[it.key] = row.id;
        }
      }
      for (const area of opt.areas) {
        const children = area.items.filter(it => it.parentKey && it.description.trim() && keyToId[it.parentKey]);
        for (const it of children) {
          const photoPath = await uploadItemPhoto(it, optRow.id, sortOrder);
          await supabase.from('proposal_line_items').insert([{
            option_id: optRow.id,
            area: area.name,
            parent_item_id: keyToId[it.parentKey],
            item_type: it.item_type,
            description: it.description.trim(),
            quantity: parseFloat(it.quantity) || 1,
            msrp: null,
            unit_price: 0,
            supplier_price: null,
            exempt_reason: null,
            discount_amount: null,
            photo_url: photoPath,
            sort_order: sortOrder++,
          }]);
        }
      }
    }

    const paymentsToInsert = paymentSchedule
      .filter(p => p.label.trim() && p.percent !== '')
      .map((p, idx) => ({
        proposal_id: proposal.id,
        label: p.label.trim(),
        basis: p.basis,
        percent: parseFloat(p.percent) || 0,
        due_trigger: p.due_trigger.trim() || null,
        sort_order: idx,
      }));
    if (paymentsToInsert.length) await supabase.from('proposal_payments').insert(paymentsToInsert);

    setSaving(false);
    router.push(`/propuestas/${proposal.id}`);
  }

  return (
    <div className="admin-shell ds-propuestas">
      <Sidebar />
      <main className="main-content">
        <div className="page-header"><div className="page-title">{isEdit ? 'Editar propuesta' : 'Nueva propuesta'}</div></div>

        {error && <p style={{ color: 'var(--warn)', fontSize: 14, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 840 }}>

          <div className="card">
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Información general</p>

            <div className="form-group" style={{ position: 'relative' }}>
              <label>Cliente *</label>
              {selectedClient ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{selectedClient.name}</span>
                  <button type="button" onClick={() => setSelectedClient(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontWeight: 700 }}>Cambiar</button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input value={clientSearch} onChange={e => { setClientSearch(e.target.value); setShowClientDropdown(true); }}
                    onFocus={() => setShowClientDropdown(true)} placeholder="Buscar cliente..." />
                  {showClientDropdown && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setShowClientDropdown(false)} />
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 11, maxHeight: 220, overflowY: 'auto' }}>
                        {clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(c => (
                          <div key={c.id} onClick={() => { setSelectedClient(c); setTaxClientType(c.client_type === 'b2b' ? 'b2b' : 'final'); setClientSearch(''); setShowClientDropdown(false); }}
                            style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid var(--border)' }}>
                            {c.name}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {isEdit && (
              <div className="form-group">
                <label>Número de propuesta *</label>
                <input value={proposalNumber} onChange={e => setProposalNumber(e.target.value)} placeholder="PROP-1001" style={{ maxWidth: 200 }} />
              </div>
            )}

            <div className="form-group">
              <label>Título de la propuesta *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Sistema de cámaras CCTV — Oficina Caguas" />
            </div>

            <div className="form-group">
              <label>Preparado por</label>
              <input value={preparedBy} onChange={e => setPreparedBy(e.target.value)} placeholder="Nombre de quien prepara la propuesta" style={{ maxWidth: 300 }} />
            </div>

            <div className="form-group">
              <label>Nota para el cliente</label>
              <textarea value={introNote} onChange={e => setIntroNote(e.target.value)} placeholder="Mensaje introductorio que verá el cliente..." />
            </div>

            <div className="form-group">
              <label>Descripción del proyecto</label>
              <textarea value={projectDescription} onChange={e => setProjectDescription(e.target.value)} placeholder="Alcance del proyecto: qué se va a hacer, en qué consiste el trabajo..." />
            </div>

            <div className="form-group">
              <label>Foto de portada</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1.5px dashed var(--border)', borderRadius: 8, cursor: 'pointer' }}>
                {coverPreview ? (
                  <img src={coverPreview} style={{ width: 60, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                ) : <span style={{ fontSize: 20 }}>🖼️</span>}
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{coverPreview ? 'Cambiar foto de portada' : 'Subir foto de portada (opcional)'}</span>
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleCoverPhoto(e.target.files?.[0])} />
              </label>
            </div>

            <div className="form-group">
              <label>Válida hasta</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={{ maxWidth: 200 }} />
            </div>

            <div className="form-group">
              <label>Tipo de cliente (IVU)</label>
              <select value={taxClientType} onChange={e => setTaxClientType(e.target.value)} style={{ maxWidth: 240 }}>
                <option value="final">Consumidor regular (11.5% / 11.5%)</option>
                <option value="b2b">B2B (11.5% producto / 4% labor)</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={requiresSignature} onChange={e => setRequiresSignature(e.target.checked)} />
                Requiere firma del cliente
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={multiOption} onChange={toggleMultiOption} />
                Ofrecer múltiples opciones (paquetes)
              </label>
            </div>
          </div>

          {selectedItemKeys.size > 0 && (() => {
            const optionsWithSelection = options.filter(o => o.areas.some(a => a.items.some(it => !it.parentKey && selectedItemKeys.has(it.key))));
            const singleOption = optionsWithSelection.length === 1 ? optionsWithSelection[0] : null;
            return (
              <div style={{ position: 'sticky', top: 0, zIndex: 15, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--navy)', color: '#fff', borderRadius: 10, padding: '10px 16px', marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{selectedItemKeys.size} seleccionado{selectedItemKeys.size > 1 ? 's' : ''}</span>
                {singleOption ? (
                  <select onChange={e => { if (e.target.value) bulkMoveSelectedToArea(singleOption.key, e.target.value); }} value=""
                    style={{ fontSize: 12.5, padding: '4px 8px', borderRadius: 6 }}>
                    <option value="">↔ Mover a área...</option>
                    {singleOption.areas.map(a => <option key={a.key} value={a.key}>{a.name}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Selección en varias opciones — solo se puede eliminar</span>
                )}
                <button type="button" onClick={bulkDeleteSelected} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: 12.5, cursor: 'pointer' }}>🗑 Eliminar</button>
                <button type="button" onClick={clearSelection} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 12.5, marginLeft: 'auto' }}>Cancelar selección</button>
              </div>
            );
          })()}

          {options.map((opt, optIndex) => (
            <div key={opt.key} className="card" style={{ border: opt.is_recommended ? '2px solid var(--amber)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                {multiOption ? (
                  <input value={opt.name} onChange={e => updateOption(opt.key, 'name', e.target.value)}
                    style={{ fontWeight: 700, fontSize: 15, border: 'none', background: 'none', color: 'var(--navy)', padding: 0 }} />
                ) : (
                  <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Contenido de la propuesta</p>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {multiOption && (
                    <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: opt.is_recommended ? 'var(--amber)' : 'var(--muted)', fontWeight: 600 }}>
                      <input type="radio" checked={opt.is_recommended} onChange={() => setRecommended(opt.key)} /> Recomendada
                    </label>
                  )}
                  {multiOption && options.length > 1 && (
                    <button type="button" onClick={() => removeOption(opt.key)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
                  )}
                </div>
              </div>
              {multiOption && (
                <input value={opt.description} onChange={e => updateOption(opt.key, 'description', e.target.value)}
                  placeholder="Descripción breve de esta opción..." style={{ marginBottom: 14 }} />
              )}

              {/* Áreas */}
              {opt.areas.map((area, areaIndex) => (
                <div key={area.key}
                  onDragOver={e => { if (dragItem) e.preventDefault(); }}
                  onDrop={e => { e.preventDefault(); if (dragItem) { moveItemGroup(opt.key, dragItem.areaKey, dragItem.itemKey, area.key, null); setDragItem(null); } }}
                  style={{ background: 'var(--surface-2)', border: dragItem ? '1px dashed var(--border-strong)' : '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <input value={area.name} onChange={e => updateAreaName(opt.key, area.key, e.target.value)}
                      style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', border: 'none', background: 'none', padding: 0 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>{area.name} Total: {fmt(areaTotal(area))}</span>
                      <div style={{ position: 'relative' }}>
                        <button type="button" onClick={() => setAreaMenuOpen(o => o === area.key ? null : area.key)}
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}>⋮</button>
                        {areaMenuOpen === area.key && (
                          <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setAreaMenuOpen(null)} />
                            <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 4, minWidth: 160, whiteSpace: 'nowrap' }}>
                              <button type="button" disabled={opt.areas.length <= 1}
                                onClick={() => { removeArea(opt.key, area.key); setAreaMenuOpen(null); }}
                                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 10px', fontSize: 12.5, cursor: opt.areas.length <= 1 ? 'default' : 'pointer', borderRadius: 6, color: opt.areas.length <= 1 ? 'var(--muted)' : 'var(--warn)' }}>
                                🗑 Eliminar área
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {area.items.map((it, itemIndex) => (
                    it.parentKey ? (
                      <LineItemRow
                        key={it.key}
                        isAccessory
                        description={it.description}
                        onDescriptionChange={v => updateItem(opt.key, area.key, it.key, 'description', v)}
                        catalogOptions={catalogItems}
                        datalistId={`cat-${optIndex}-${areaIndex}-${itemIndex}`}
                        quantity={it.quantity}
                        onQuantityChange={v => updateItem(opt.key, area.key, it.key, 'quantity', v)}
                        photoUrl={it.photoPreview}
                        onPhotoSelect={file => handleItemPhoto(opt.key, area.key, it.key, file)}
                        fmt={fmt}
                        actions={
                          <button type="button" onClick={() => removeItem(opt.key, area.key, it.key)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 15 }}>×</button>
                        }
                      />
                    ) : (
                      <div key={it.key}
                        onDragOver={e => { if (dragItem) e.preventDefault(); }}
                        onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragItem) { moveItemGroup(opt.key, dragItem.areaKey, dragItem.itemKey, area.key, it.key); setDragItem(null); } }}
                        style={{ opacity: dragItem?.itemKey === it.key ? 0.4 : 1 }}
                      >
                        <LineItemRow
                          type={it.item_type}
                          onTypeChange={v => updateItem(opt.key, area.key, it.key, 'item_type', v)}
                          description={it.description}
                          onDescriptionChange={v => handleCatalogSelect(opt.key, area.key, it.key, v)}
                          catalogOptions={catalogItems.filter(c => c.type === it.item_type)}
                          datalistId={`cat-${optIndex}-${areaIndex}-${itemIndex}`}
                          quantity={it.quantity}
                          onQuantityChange={v => updateItem(opt.key, area.key, it.key, 'quantity', v)}
                          msrp={it.msrp}
                          onMsrpChange={v => updateItem(opt.key, area.key, it.key, 'msrp', v)}
                          unitPrice={it.unit_price}
                          onUnitPriceChange={v => updateItem(opt.key, area.key, it.key, 'unit_price', v)}
                          supplierPrice={it.supplier_price}
                          onSupplierPriceChange={v => updateItem(opt.key, area.key, it.key, 'supplier_price', v)}
                          exempt={it.exempt}
                          onExemptChange={v => updateItem(opt.key, area.key, it.key, 'exempt', v)}
                          discount={it.discount}
                          onDiscountChange={v => updateItem(opt.key, area.key, it.key, 'discount', v)}
                          vendor={it.vendor}
                          onVendorChange={v => updateItem(opt.key, area.key, it.key, 'vendor', v)}
                          vendorOptions={vendorOptions}
                          photoUrl={it.photoPreview}
                          onPhotoSelect={file => handleItemPhoto(opt.key, area.key, it.key, file)}
                          fmt={fmt}
                          actions={
                            <>
                              <input type="checkbox" checked={selectedItemKeys.has(it.key)} onChange={() => toggleItemSelection(it.key)}
                                title="Seleccionar para acciones en lote" style={{ marginRight: 2, cursor: 'pointer' }} />
                              <span
                                draggable
                                onDragStart={() => setDragItem({ areaKey: area.key, itemKey: it.key })}
                                onDragEnd={() => setDragItem(null)}
                                title="Arrastrar para mover a otra área"
                                style={{ cursor: 'grab', color: 'var(--muted)', fontSize: 15, padding: '0 4px', userSelect: 'none' }}
                              >⠿</span>
                              <button type="button" onClick={() => removeItem(opt.key, area.key, it.key)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
                            </>
                          }
                        />
                        <button type="button" onClick={() => addAccessory(opt.key, area.key, it.key)}
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, marginLeft: 32, marginBottom: 8, marginTop: -4 }}>
                          + Accesorio
                        </button>
                      </div>
                    )
                  ))}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => addItem(opt.key, area.key, 'product')}>+ Añadir producto</button>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => addItem(opt.key, area.key, 'labor')}>+ Añadir labor</button>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => addArea(opt.key)}>+ Agregar área</button>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--navy)' }}>Total venta: {fmt(optionTotal(opt))}</span>
              </div>
            </div>
          ))}

          {multiOption && (
            <button type="button" className="btn btn-ghost" onClick={addOption} style={{ justifyContent: 'center' }}>+ Agregar otra opción</button>
          )}

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Payment Schedule (opcional)</p>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addPayment}>+ Agregar pago</button>
            </div>
            {paymentSchedule.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Sin pagos parciales — se mostrará el total completo.</p>}
            {paymentSchedule.map(p => (
              <div key={p.key} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 70px 1fr 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input value={p.label} onChange={e => updatePayment(p.key, 'label', e.target.value)} placeholder="Ej: Pago 1" style={{ fontSize: 13 }} />
                <select value={p.basis} onChange={e => updatePayment(p.key, 'basis', e.target.value)} style={{ fontSize: 12 }}>
                  <option value="parts">% de Parts</option>
                  <option value="labor">% de Labor</option>
                  <option value="subtotal">% de Subtotal</option>
                </select>
                <input type="number" value={p.percent} onChange={e => updatePayment(p.key, 'percent', e.target.value)} placeholder="%" style={{ fontSize: 13 }} min="0" max="100" />
                <input value={p.due_trigger} onChange={e => updatePayment(p.key, 'due_trigger', e.target.value)} placeholder="Ej: Al aprobar la propuesta" style={{ fontSize: 12 }} />
                <button type="button" onClick={() => removePayment(p.key)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            ))}
          </div>

          <div className="card">
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Términos y condiciones</p>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <textarea value={terms} onChange={e => setTerms(e.target.value)} placeholder="Términos y condiciones de la propuesta..." />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave} style={{ flex: 1, justifyContent: 'center' }}>
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Guardar propuesta'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => router.back()}>Cancelar</button>
          </div>
        </div>
      </main>
    </div>
  );
}
