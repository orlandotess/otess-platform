'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Sidebar from '../../Sidebar';

function emptyOption(name = 'Opción') {
  return {
    key: Math.random().toString(36).slice(2),
    name,
    description: '',
    is_recommended: false,
    items: [{ description: '', quantity: 1, unit_price: '', photoFile: null, photoPreview: null }],
  };
}

export default function NuevaPropuesta() {
  const router = useRouter();
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [title, setTitle] = useState('');
  const [introNote, setIntroNote] = useState('');
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [multiOption, setMultiOption] = useState(false);
  const [options, setOptions] = useState([emptyOption('Propuesta')]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('clients').select('id, name, client_type').order('name').then(({ data }) => setClients(data ?? []));
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

  function addOption() {
    setOptions(prev => [...prev, emptyOption(`Opción ${prev.length + 1}`)]);
  }
  function removeOption(key) {
    setOptions(prev => prev.filter(o => o.key !== key));
  }
  function updateOption(key, field, value) {
    setOptions(prev => prev.map(o => o.key === key ? { ...o, [field]: value } : o));
  }
  function setRecommended(key) {
    setOptions(prev => prev.map(o => ({ ...o, is_recommended: o.key === key })));
  }

  function addItem(optKey) {
    setOptions(prev => prev.map(o => o.key === optKey
      ? { ...o, items: [...o.items, { description: '', quantity: 1, unit_price: '', photoFile: null, photoPreview: null }] }
      : o));
  }
  function removeItem(optKey, idx) {
    setOptions(prev => prev.map(o => o.key === optKey
      ? { ...o, items: o.items.filter((_, i) => i !== idx) }
      : o));
  }
  function updateItem(optKey, idx, field, value) {
    setOptions(prev => prev.map(o => o.key === optKey
      ? { ...o, items: o.items.map((it, i) => i === idx ? { ...it, [field]: value } : it) }
      : o));
  }
  function handleItemPhoto(optKey, idx, file) {
    if (!file) return;
    updateItem(optKey, idx, 'photoFile', file);
    updateItem(optKey, idx, 'photoPreview', URL.createObjectURL(file));
  }

  function optionTotal(opt) {
    return opt.items.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0);
  }
  const fmt = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  async function handleSave() {
    if (!selectedClient || !title.trim()) { setError('Cliente y título son requeridos'); return; }
    setSaving(true); setError('');

    const { data: last } = await supabase.from('proposals').select('proposal_number').order('created_at', { ascending: false }).limit(1).single();
    let nextNum = 1001;
    if (last?.proposal_number) {
      const n = parseInt(last.proposal_number.replace('PROP-', ''));
      if (!isNaN(n)) nextNum = n + 1;
    }

    const { data: proposal, error: err } = await supabase.from('proposals').insert([{
      proposal_number: `PROP-${nextNum}`,
      client_id: selectedClient.id,
      title: title.trim(),
      intro_note: introNote.trim() || null,
      requires_signature: requiresSignature,
      status: 'borrador',
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

      const lineItems = [];
      for (let j = 0; j < opt.items.length; j++) {
        const it = opt.items[j];
        if (!it.description.trim()) continue;
        let photoPath = null;
        if (it.photoFile) {
          const ext = it.photoFile.name.split('.').pop();
          const path = `proposals/${optRow.id}/${Date.now()}-${j}.${ext}`;
          const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, it.photoFile);
          if (!upErr) photoPath = path;
        }
        lineItems.push({
          option_id: optRow.id,
          description: it.description.trim(),
          quantity: parseFloat(it.quantity) || 1,
          unit_price: parseFloat(it.unit_price) || 0,
          photo_url: photoPath,
          sort_order: j,
        });
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>

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
                          <div key={c.id} onClick={() => { setSelectedClient(c); setClientSearch(''); setShowClientDropdown(false); }}
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

          {options.map((opt, oi) => (
            <div key={opt.key} className="card" style={{ border: opt.is_recommended ? '2px solid var(--amber)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                {multiOption ? (
                  <input value={opt.name} onChange={e => updateOption(opt.key, 'name', e.target.value)}
                    style={{ fontWeight: 700, fontSize: 15, border: 'none', background: 'none', color: 'var(--navy)', padding: 0 }} />
                ) : (
                  <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Líneas de la propuesta</p>
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
                  placeholder="Descripción breve de esta opción..." style={{ marginBottom: 12 }} />
              )}

              {opt.items.map((it, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 60px 32px', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                  <input value={it.description} onChange={e => updateItem(opt.key, idx, 'description', e.target.value)} placeholder="Descripción del ítem/labor..." style={{ fontSize: 13 }} />
                  <input type="number" value={it.quantity} onChange={e => updateItem(opt.key, idx, 'quantity', e.target.value)} placeholder="Cant." style={{ fontSize: 13 }} min="0" step="0.01" />
                  <input type="number" value={it.unit_price} onChange={e => updateItem(opt.key, idx, 'unit_price', e.target.value)} placeholder="Precio" style={{ fontSize: 13 }} min="0" step="0.01" />
                  <label style={{ cursor: 'pointer', textAlign: 'center' }}>
                    {it.photoPreview ? (
                      <img src={it.photoPreview} style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4 }} />
                    ) : <span style={{ fontSize: 16 }}>📷</span>}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleItemPhoto(opt.key, idx, e.target.files?.[0])} />
                  </label>
                  <button type="button" onClick={() => removeItem(opt.key, idx)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px', marginTop: 4 }} onClick={() => addItem(opt.key)}>+ Agregar línea</button>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--navy)' }}>Total: {fmt(optionTotal(opt))}</span>
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
