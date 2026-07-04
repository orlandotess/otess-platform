'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Sidebar from '../../Sidebar';

function emptyItem() {
  return {
    key: Math.random().toString(36).slice(2),
    item_type: 'labor',
    description: '',
    quantity: 1,
    msrp: '',
    unit_price: '',
    supplier_price: '',
    photoFile: null,
    photoPreview: null,
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

export default function NuevaPropuesta() {
  const router = useRouter();
  const [clients, setClients] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [title, setTitle] = useState('');
  const [introNote, setIntroNote] = useState('');
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [taxClientType, setTaxClientType] = useState('final');
  const [multiOption, setMultiOption] = useState(false);
  const [options, setOptions] = useState([emptyOption('Propuesta')]);
  const [coverPhoto, setCoverPhoto] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [terms, setTerms] = useState('Esta propuesta es válida por 30 días a partir de la fecha de envío. Los precios incluyen materiales y labor según lo descrito. Cualquier trabajo adicional fuera del alcance será cotizado por separado.');
  const [validUntil, setValidUntil] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('clients').select('id, name, client_type').order('name').then(({ data }) => setClients(data ?? []));
    supabase.from('catalog_items').select('*').order('item_code').then(({ data }) => setCatalogItems(data ?? []));
  }, []);

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

  function addItem(optKey, areaKey) {
    setOptions(prev => prev.map(o => o.key === optKey
      ? { ...o, areas: o.areas.map(a => a.key === areaKey ? { ...a, items: [...a.items, emptyItem()] } : a) }
      : o));
  }
  function removeItem(optKey, areaKey, itemKey) {
    setOptions(prev => prev.map(o => o.key === optKey
      ? { ...o, areas: o.areas.map(a => a.key === areaKey ? { ...a, items: a.items.filter(it => it.key !== itemKey) } : a) }
      : o));
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
            } : it) } : a) }
        : o));
    } else {
      updateItem(optKey, areaKey, itemKey, 'description', value);
    }
  }
  function handleItemPhoto(optKey, areaKey, itemKey, file) {
    if (!file) return;
    updateItem(optKey, areaKey, itemKey, 'photoFile', file);
    updateItem(optKey, areaKey, itemKey, 'photoPreview', URL.createObjectURL(file));
  }

  function optionTotal(opt) {
    return opt.areas.reduce((sum, a) => sum + a.items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0), 0);
  }
  const fmt = n => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  function handleCoverPhoto(file) {
    if (!file) return;
    setCoverPhoto(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!selectedClient || !title.trim()) { setError('Cliente y título son requeridos'); return; }
    setSaving(true); setError('');

    const { data: last } = await supabase.from('proposals').select('proposal_number').order('created_at', { ascending: false }).limit(1).single();
    let nextNum = 1001;
    if (last?.proposal_number) {
      const n = parseInt(last.proposal_number.replace('PROP-', ''));
      if (!isNaN(n)) nextNum = n + 1;
    }

    let coverPath = null;
    if (coverPhoto) {
      const ext = coverPhoto.name.split('.').pop();
      coverPath = `proposals/covers/${Date.now()}.${ext}`;
      await supabase.storage.from('Job-photos').upload(coverPath, coverPhoto);
    }

    const { data: proposal, error: err } = await supabase.from('proposals').insert([{
      proposal_number: `PROP-${nextNum}`,
      client_id: selectedClient.id,
      title: title.trim(),
      intro_note: introNote.trim() || null,
      requires_signature: requiresSignature,
      status: 'borrador',
      tax_client_type: taxClientType,
      cover_photo_url: coverPath,
      terms: terms.trim() || null,
      valid_until: validUntil || null,
    }]).select().single();

    if (err) { setError(err.message); setSaving(false); return; }

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

      let sortOrder = 0;
      const lineItems = [];
      for (const area of opt.areas) {
        for (const it of area.items) {
          if (!it.description.trim()) continue;
          let photoPath = null;
          if (it.photoFile) {
            const ext = it.photoFile.name.split('.').pop();
            const path = `proposals/${optRow.id}/${Date.now()}-${sortOrder}.${ext}`;
            const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, it.photoFile);
            if (!upErr) photoPath = path;
          }
          lineItems.push({
            option_id: optRow.id,
            area: area.name,
            item_type: it.item_type,
            description: it.description.trim(),
            quantity: parseFloat(it.quantity) || 1,
            msrp: it.msrp !== '' ? parseFloat(it.msrp) : null,
            unit_price: parseFloat(it.unit_price) || 0,
            supplier_price: it.supplier_price !== '' ? parseFloat(it.supplier_price) : null,
            photo_url: photoPath,
            sort_order: sortOrder++,
          });
        }
      }
      if (lineItems.length) await supabase.from('proposal_line_items').insert(lineItems);
    }

    setSaving(false);
    router.push(`/propuestas/${proposal.id}`);
  }

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header"><div className="page-title">Nueva propuesta</div></div>

        {error && <p style={{ color: 'var(--warn)', fontSize: 14, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 840 }}>

          <div className="card">
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Información general</p>

            <div className="form-group" style={{ position: 'relative' }}>
              <label>Cliente *</label>
              {selectedClient ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, background: '#f8f9fb' }}>
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
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1.5px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 11, maxHeight: 220, overflowY: 'auto' }}>
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

            <div className="form-group">
              <label>Título de la propuesta *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Sistema de cámaras CCTV — Oficina Caguas" />
            </div>

            <div className="form-group">
              <label>Nota para el cliente</label>
              <textarea value={introNote} onChange={e => setIntroNote(e.target.value)} placeholder="Mensaje introductorio que verá el cliente..." />
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
              <label>Términos y condiciones</label>
              <textarea value={terms} onChange={e => setTerms(e.target.value)} placeholder="Términos y condiciones de la propuesta..." />
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

          {options.map(opt => (
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
              {opt.areas.map(area => (
                <div key={area.key} style={{ background: '#f8f9fb', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <input value={area.name} onChange={e => updateAreaName(opt.key, area.key, e.target.value)}
                      style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', border: 'none', background: 'none', padding: 0 }} />
                    {opt.areas.length > 1 && (
                      <button type="button" onClick={() => removeArea(opt.key, area.key)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 15 }}>× Quitar área</button>
                    )}
                  </div>

                  {area.items.map(it => (
                    <div key={it.key} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 55px 90px 32px', gap: 8, marginBottom: 8, alignItems: 'start', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                      <select value={it.item_type} onChange={e => updateItem(opt.key, area.key, it.key, 'item_type', e.target.value)} style={{ fontSize: 12, padding: 6 }}>
                        <option value="labor">Labor</option>
                        <option value="product">Producto</option>
                      </select>

                      <div>
                        <input list={`cat-${it.key}`} value={it.description}
                          onChange={e => handleCatalogSelect(opt.key, area.key, it.key, e.target.value)}
                          placeholder="Descripción o código..." style={{ fontSize: 13, width: '100%', marginBottom: 6 }} />
                        <datalist id={`cat-${it.key}`}>
                          {catalogItems.filter(c => c.type === it.item_type).map(c => (
                            <option key={c.id} value={`${c.item_code} — ${c.description}`} />
                          ))}
                        </datalist>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11.5, color: 'var(--muted)' }}>
                          {it.photoPreview ? <img src={it.photoPreview} style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: 4 }} /> : '📷'} Foto
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleItemPhoto(opt.key, area.key, it.key, e.target.files?.[0])} />
                        </label>
                      </div>

                      <input type="number" value={it.quantity} onChange={e => updateItem(opt.key, area.key, it.key, 'quantity', e.target.value)} placeholder="Cant." style={{ fontSize: 12, padding: 6 }} min="0" step="0.01" />

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <input type="number" value={it.msrp} onChange={e => updateItem(opt.key, area.key, it.key, 'msrp', e.target.value)} placeholder="MSRP" style={{ fontSize: 11, padding: '4px 6px', color: 'var(--muted)' }} min="0" step="0.01" title="MSRP (referencia, solo interno)" />
                        <input type="number" value={it.unit_price} onChange={e => updateItem(opt.key, area.key, it.key, 'unit_price', e.target.value)} placeholder="Precio venta" style={{ fontSize: 12, padding: '4px 6px', fontWeight: 700, border: '1.5px solid var(--amber)' }} min="0" step="0.01" title="Precio de venta al cliente" />
                        <input type="number" value={it.supplier_price} onChange={e => updateItem(opt.key, area.key, it.key, 'supplier_price', e.target.value)} placeholder="Costo suplidor" style={{ fontSize: 11, padding: '4px 6px', color: '#c0392b' }} min="0" step="0.01" title="Costo del suplidor (solo interno)" />
                      </div>

                      <button type="button" onClick={() => removeItem(opt.key, area.key, it.key)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => addItem(opt.key, area.key)}>+ Línea</button>
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

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave} style={{ flex: 1, justifyContent: 'center' }}>
              {saving ? 'Guardando...' : 'Guardar propuesta'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => router.back()}>Cancelar</button>
          </div>
        </div>
      </main>
    </div>
  );
}
