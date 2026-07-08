'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { buildMapsLinks } from '../../../lib/mapsLinks';

const statusJob = {
  estimate: { cls: 'badge-gray', label: 'Estimado' },
  scheduled: { cls: 'badge-blue', label: 'Programado' },
  in_progress: { cls: 'badge-amber', label: 'En progreso' },
  completed: { cls: 'badge-green', label: 'Completado' },
  cancelled: { cls: 'badge-red', label: 'Cancelado' }
};
const statusInv = {
  draft: { cls: 'badge-gray', label: 'Borrador' },
  sent: { cls: 'badge-blue', label: 'Enviada' },
  paid: { cls: 'badge-green', label: 'Pagada' },
  overdue: { cls: 'badge-red', label: 'Vencida' }
};
const statusProp = {
  borrador: { cls: 'badge-gray', label: 'Borrador' },
  enviada: { cls: 'badge-blue', label: 'Enviada' },
  vista: { cls: 'badge-amber', label: 'Vista' },
  aprobada: { cls: 'badge-green', label: 'Aprobada' },
  rechazada: { cls: 'badge-red', label: 'Rechazada' }
};
const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function extractCoordsFromInput(text) {
  const trimmed = text.trim();

  // Google embeds the exact pin location as !3d{lat}!4d{lng} in place/share links.
  // The @lat,lng in the URL is only the map viewport center, which Google shifts
  // to keep the pin visible next to the search panel (or averages multiple stops
  // on a directions link) - using it directly can point to the wrong location.
  const pinMatch = trimmed.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  if (pinMatch) return `${pinMatch[1]}, ${pinMatch[2]}`;

  // Find ANY pair of coordinates anywhere in the text (covers @lat,lng, ?q=, ?ll=, etc.)
  // Matches patterns like: 18.4337058,-66.1137271 or 18.4337058, -66.1137271
  const coordPattern = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/g;
  const matches = [...trimmed.matchAll(coordPattern)];

  if (matches.length > 0) {
    const atMatch = trimmed.match(/@(-?\d{1,2}\.\d{3,}),(-?\d{1,3}\.\d{3,})/);
    if (atMatch) return `${atMatch[1]}, ${atMatch[2]}`;
    const last = matches[matches.length - 1];
    return `${last[1]}, ${last[2]}`;
  }

  // No coordinates found - return original text as-is for manual entry
  return text;
}

async function resolveShortLink(url) {
  try {
    const res = await fetch('/api/resolve-maps-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    return data.coords ?? null;
  } catch {
    return null;
  }
}

export default function ClientesDetail({ client, jobs, invoices, properties: initProps, contacts: initContacts, proposals, internalNotes: initInternalNotes, currentRole }) {
  const canDeleteClient = currentRole === 'admin' || currentRole === 'secretaria';
  const router = useRouter();
  const [tab, setTab] = useState('info');
  const [properties, setProperties] = useState(initProps);
  const [contacts, setContacts] = useState(initContacts);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Info tab edit
  const [editingInfo, setEditingInfo] = useState(false);
  const [editInfoData, setEditInfoData] = useState({});
  const [savingInfo, setSavingInfo] = useState(false);

  // Property form
  const [showPropForm, setShowPropForm] = useState(false);
  const [prop, setProp] = useState({ name: '', street: '', city: '', state: 'PR', zip: '' });
  const [savingProp, setSavingProp] = useState(false);

  // Contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [contact, setContact] = useState({ name: '', phone: '', email: '', property_id: '' });
  const [savingContact, setSavingContact] = useState(false);

  const [editingProp, setEditingProp] = useState(null);
  const [editPropData, setEditPropData] = useState({});
  const [savingEditProp, setSavingEditProp] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [editContactData, setEditContactData] = useState({});
  const [savingEditContact, setSavingEditContact] = useState(false);

  async function saveEditProperty(propId) {
    setSavingEditProp(true);
    await supabase.from('client_properties').update(editPropData).eq('id', propId);
    setProperties(prev => prev.map(p => p.id === propId ? { ...p, ...editPropData } : p));
    setEditingProp(null);
    setSavingEditProp(false);
  }

  async function saveEditContact(contactId) {
    setSavingEditContact(true);
    await supabase.from('client_contacts').update(editContactData).eq('id', contactId);
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, ...editContactData } : c));
    setEditingContact(null);
    setSavingEditContact(false);
  }

  const [jobCount, setJobCount] = useState(0);
  const [expandedProp, setExpandedProp] = useState(null);
  const [expandedContact, setExpandedContact] = useState(null);

  function startEditInfo() {
    setEditInfoData({
      name: client.name ?? '',
      company: client.company ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
      client_type: client.client_type ?? 'final',
      notes: client.notes ?? '',
    });
    setEditingInfo(true);
  }

  async function saveInfo(e) {
    e.preventDefault();
    setSavingInfo(true);
    await supabase.from('clients').update(editInfoData).eq('id', client.id);
    setSavingInfo(false);
    setEditingInfo(false);
    router.refresh();
  }

  async function handleDeleteClick() {
    const { count } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('client_id', client.id);
    setJobCount(count ?? 0);
    setShowDelete(true);
  }

  async function deleteClient() {
    if (!canDeleteClient) return;
    setDeleting(true);
    const { data: clientJobs } = await supabase.from('jobs').select('id').eq('client_id', client.id);
    const jobIds = clientJobs?.map(j => j.id) ?? [];
    if (jobIds.length > 0) {
      await supabase.from('job_line_items').delete().in('job_id', jobIds);
      await supabase.from('job_notes').delete().in('job_id', jobIds);
      await supabase.from('job_checklist_items').delete().in('job_id', jobIds);
      await supabase.from('time_entries').delete().in('job_id', jobIds);
      await supabase.from('invoices').delete().in('job_id', jobIds);
      await supabase.from('jobs').delete().eq('client_id', client.id);
    }
    await supabase.from('invoices').delete().eq('client_id', client.id);
    await supabase.from('client_addresses').delete().eq('client_id', client.id);
    await supabase.from('client_contacts').delete().eq('client_id', client.id);
    await supabase.from('client_properties').delete().eq('client_id', client.id);
    await supabase.from('client_notes').delete().eq('client_id', client.id);
    await supabase.from('clients').delete().eq('id', client.id);
    window.location.replace('/clientes');
  }

  async function saveProperty(e) {
    e.preventDefault();
    setSavingProp(true);
    const { data } = await supabase.from('client_properties').insert([{
      client_id: client.id,
      ...prop,
      is_primary: properties.length === 0,
    }]).select().single();
    if (data) {
      setProperties(prev => [...prev, data]);
      setProp({ name: '', street: '', city: '', state: 'PR', zip: '' });
      setShowPropForm(false);
    }
    setSavingProp(false);
  }

  async function deleteProperty(propId) {
    await supabase.from('client_properties').delete().eq('id', propId);
    setProperties(prev => prev.filter(p => p.id !== propId));
  }

  async function setPrimary(propId) {
    await supabase.from('client_properties').update({ is_primary: false }).eq('client_id', client.id);
    await supabase.from('client_properties').update({ is_primary: true }).eq('id', propId);
    setProperties(prev => prev.map(p => ({ ...p, is_primary: p.id === propId })));
  }

  async function saveContact(e) {
    e.preventDefault();
    setSavingContact(true);
    const { data } = await supabase.from('client_contacts').insert([{
      client_id: client.id,
      ...contact,
      property_id: contact.property_id || null,
      is_primary: contacts.length === 0,
    }]).select().single();
    if (data) setContacts(prev => [...prev, data]);
    setContact({ name: '', phone: '', email: '', property_id: '' });
    setShowContactForm(false);
    setSavingContact(false);
  }

  async function deleteContact(contactId) {
    await supabase.from('client_contacts').delete().eq('id', contactId);
    setContacts(prev => prev.filter(c => c.id !== contactId));
  }

  // Internal notes
  const [internalNotes, setInternalNotes] = useState(initInternalNotes ?? []);
  const [newInternalNote, setNewInternalNote] = useState('');
  const [savingInternalNote, setSavingInternalNote] = useState(false);
  const [editingInternalNoteId, setEditingInternalNoteId] = useState(null);
  const [editingInternalNoteText, setEditingInternalNoteText] = useState('');

  const sortedInternalNotes = [...internalNotes].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));

  async function addInternalNote(e) {
    e.preventDefault();
    if (!newInternalNote.trim()) return;
    setSavingInternalNote(true);
    const { data } = await supabase.from('client_notes').insert([{ client_id: client.id, note: newInternalNote.trim() }]).select().single();
    if (data) setInternalNotes(prev => [data, ...prev]);
    setNewInternalNote('');
    setSavingInternalNote(false);
  }

  async function deleteInternalNote(noteId) {
    await supabase.from('client_notes').delete().eq('id', noteId);
    setInternalNotes(prev => prev.filter(n => n.id !== noteId));
  }

  async function saveInternalNoteEdit(noteId) {
    const text = editingInternalNoteText.trim();
    if (!text) return;
    await supabase.from('client_notes').update({ note: text }).eq('id', noteId);
    setInternalNotes(prev => prev.map(n => n.id === noteId ? { ...n, note: text } : n));
    setEditingInternalNoteId(null);
    setEditingInternalNoteText('');
  }

  async function toggleInternalNotePin(noteId, pinned) {
    setInternalNotes(prev => prev.map(n => n.id === noteId ? { ...n, is_pinned: !pinned } : n));
    await supabase.from('client_notes').update({ is_pinned: !pinned }).eq('id', noteId);
  }

  const tabStyle = t => ({
    padding: '10px 20px',
    fontWeight: tab === t ? 700 : 500,
    color: tab === t ? 'var(--navy)' : 'var(--muted)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottom: tab === t ? '2px solid var(--navy)' : '2px solid transparent',
    fontSize: 14,
  });

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1.5px solid var(--border)', marginBottom: 20, background: '#fff', borderRadius: '12px 12px 0 0', padding: '0 8px' }}>
        <button style={tabStyle('info')} onClick={() => setTab('info')}>👤 Info</button>
        <button style={tabStyle('properties')} onClick={() => setTab('properties')}>
          📍 Propiedades
          {properties.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{properties.length}</span>}
        </button>
        <button style={tabStyle('contacts')} onClick={() => setTab('contacts')}>
          👥 Contactos
          {contacts.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{contacts.length}</span>}
        </button>
        <button style={tabStyle('jobs')} onClick={() => setTab('jobs')}>
          🔧 Trabajos
          {jobs.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{jobs.length}</span>}
        </button>
        <button style={tabStyle('invoices')} onClick={() => setTab('invoices')}>
          🧾 Facturas
          {invoices.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{invoices.length}</span>}
        </button>
        <button style={tabStyle('proposals')} onClick={() => setTab('proposals')}>
          📄 Propuestas
          {proposals.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{proposals.length}</span>}
        </button>
        <button style={tabStyle('internalNotes')} onClick={() => setTab('internalNotes')}>
          📝 Notas internas
          {internalNotes.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{internalNotes.length}</span>}
        </button>
      </div>

      {/* INFO TAB */}
      {tab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', margin: 0 }}>Información de contacto</p>
                {!editingInfo && (
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={startEditInfo}>✏️ Editar</button>
                )}
              </div>

              {editingInfo ? (
                <form onSubmit={saveInfo}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div className="form-group">
                      <label>Nombre *</label>
                      <input value={editInfoData.name} onChange={e => setEditInfoData(d => ({ ...d, name: e.target.value }))} required />
                    </div>
                    <div className="form-group">
                      <label>Empresa</label>
                      <input value={editInfoData.company} onChange={e => setEditInfoData(d => ({ ...d, company: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>Email</label>
                      <input type="email" value={editInfoData.email} onChange={e => setEditInfoData(d => ({ ...d, email: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>Teléfono</label>
                      <input value={editInfoData.phone} onChange={e => setEditInfoData(d => ({ ...d, phone: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>Tipo de cliente</label>
                      <select value={editInfoData.client_type} onChange={e => setEditInfoData(d => ({ ...d, client_type: e.target.value }))}>
                        <option value="final">Consumidor final</option>
                        <option value="b2b">Comerciante Registrado (B2B)</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Notas</label>
                      <textarea value={editInfoData.notes} onChange={e => setEditInfoData(d => ({ ...d, notes: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="submit" className="btn btn-primary" disabled={savingInfo}>{savingInfo ? 'Guardando...' : '💾 Guardar'}</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setEditingInfo(false)}>Cancelar</button>
                  </div>
                </form>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { label: 'Nombre', value: client.name },
                    { label: 'Empresa', value: client.company },
                    { label: 'Email', value: client.email },
                    { label: 'Teléfono', value: client.phone },
                    { label: 'Tipo', value: client.client_type === 'b2b' ? 'Comerciante Registrado (B2B)' : 'Consumidor final' },
                  ].map(f => f.value ? (
                    <div key={f.label}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{f.label}</div>
                      <div style={{ fontSize: 14 }}>{f.value}</div>
                    </div>
                  ) : null)}
                </div>
              )}
            </div>
            {!editingInfo && client.notes && (
              <div className="card">
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 10 }}>Notas</p>
                <p style={{ fontSize: 14, color: 'var(--muted)' }}>{client.notes}</p>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Resumen</p>
              {[
                { label: 'Propiedades', value: properties.length },
                { label: 'Contactos', value: contacts.length },
                { label: 'Trabajos', value: jobs.length },
                { label: 'Facturas', value: invoices.length },
                { label: 'Total facturado', value: fmt(invoices.reduce((a, i) => a + Number(i.total ?? 0), 0)) },
                { label: 'Propuestas', value: proposals.length },
                { label: 'Notas internas', value: internalNotes.length },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                  <span style={{ color: 'var(--muted)' }}>{s.label}</span>
                  <span style={{ fontWeight: 700 }}>{s.value}</span>
                </div>
              ))}
            </div>
            {canDeleteClient && (
              <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: '#fca5a5', justifyContent: 'center' }} onClick={handleDeleteClick}>
                🗑 Eliminar cliente
              </button>
            )}
          </div>
        </div>
      )}

      {/* PROPERTIES TAB */}
      {tab === 'properties' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showPropForm ? 20 : 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Propiedades ({properties.length})</h2>
              <button className="btn btn-primary" onClick={() => setShowPropForm(!showPropForm)}>
                {showPropForm ? 'Cancelar' : '+ Agregar propiedad'}
              </button>
            </div>
            {showPropForm && (
              <form onSubmit={saveProperty}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Nombre de la propiedad *</label>
                    <input value={prop.name} onChange={e => setProp(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Oficina Principal, Almacén Caguas" required />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Calle (puedes pegar un link de Google Maps, Apple Maps o Waze aquí)</label>
                    <input value={prop.street} onChange={e => {
                      const val = e.target.value;
                      const isShortLink = /(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(val);
                      setProp(p => ({ ...p, street: isShortLink ? val : extractCoordsFromInput(val) }));
                    }} placeholder="Pega el link o dirección aquí..." />
                  </div>
                  <div className="form-group">
                    <label>Ciudad</label>
                    <input value={prop.city} onChange={e => setProp(p => ({ ...p, city: e.target.value }))} placeholder="San Juan" />
                  </div>
                  <div className="form-group">
                    <label>Estado</label>
                    <input value={prop.state} onChange={e => setProp(p => ({ ...p, state: e.target.value }))} placeholder="PR" />
                  </div>
                  <div className="form-group">
                    <label>Zip</label>
                    <input value={prop.zip} onChange={e => setProp(p => ({ ...p, zip: e.target.value }))} placeholder="00901" />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={savingProp}>
                  {savingProp ? 'Guardando...' : '💾 Guardar propiedad'}
                </button>
              </form>
            )}
          </div>

          {properties.length === 0 ? (
            <div className="card empty"><p>No hay propiedades. Agrega la primera arriba.</p></div>
          ) : properties.map(p => (
            <div key={p.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
                    {p.is_primary && <span className="badge badge-green">Principal</span>}
                  </div>
                  {p.street && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{p.street}{p.city ? `, ${p.city}` : ''}{p.state ? `, ${p.state}` : ''}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {!p.is_primary && (
                    <button onClick={() => setPrimary(p.id)} className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}>Principal</button>
                  )}
                  <button
                    onClick={() => {
                      setExpandedProp(p.id);
                      setEditingProp(p.id);
                      setEditPropData({ name: p.name, street: p.street ?? '', city: p.city ?? '', state: p.state ?? 'PR', zip: p.zip ?? '' });
                    }}
                    className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}
                  >
                    ✏️ Editar
                  </button>
                  <button onClick={() => setExpandedProp(expandedProp === p.id ? null : p.id)} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
                    {expandedProp === p.id ? 'Cerrar ↑' : 'Ver →'}
                  </button>
                  <button onClick={() => deleteProperty(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>🗑</button>
                </div>
              </div>

              {expandedProp === p.id && (
                <div style={{ marginTop: 16, borderTop: '1.5px solid var(--border)', paddingTop: 16 }}>
                  {editingProp === p.id ? (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label>Nombre</label>
                          <input value={editPropData.name ?? ''} onChange={e => setEditPropData(d => ({ ...d, name: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label>Calle (puedes pegar un link de Google Maps, Apple Maps o Waze aquí)</label>
                          <input value={editPropData.street ?? ''} onChange={e => {
                            const val = e.target.value;
                            const isShortLink = /(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(val);
                            setEditPropData(d => ({ ...d, street: isShortLink ? val : extractCoordsFromInput(val) }));
                          }} placeholder="Pega el link o dirección aquí..." />
                        </div>
                        <div className="form-group">
                          <label>Ciudad</label>
                          <input value={editPropData.city ?? ''} onChange={e => setEditPropData(d => ({ ...d, city: e.target.value }))} placeholder="San Juan" />
                        </div>
                        <div className="form-group">
                          <label>Estado</label>
                          <input value={editPropData.state ?? ''} onChange={e => setEditPropData(d => ({ ...d, state: e.target.value }))} placeholder="PR" />
                        </div>
                        <div className="form-group">
                          <label>Zip</label>
                          <input value={editPropData.zip ?? ''} onChange={e => setEditPropData(d => ({ ...d, zip: e.target.value }))} placeholder="00901" />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button className="btn btn-primary" onClick={() => saveEditProperty(p.id)} disabled={savingEditProp}>
                          {savingEditProp ? 'Guardando...' : '💾 Guardar'}
                        </button>
                        <button className="btn btn-ghost" onClick={() => setEditingProp(null)}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => { setEditingProp(p.id); setEditPropData({ name: p.name, street: p.street ?? '', city: p.city ?? '', state: p.state ?? 'PR', zip: p.zip ?? '' }); }}>
                          ✏️ Editar
                        </button>
                      </div>
                      {/* Dirección y mapas */}
                      {(p.street || p.city) && (
                        <div style={{ marginBottom: 16 }}>
                          <p style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Dirección</p>
                          {p.street && <div style={{ fontSize: 14 }}>{p.street}</div>}
                          {p.city && <div style={{ fontSize: 14, color: 'var(--muted)' }}>{p.city}{p.state ? `, ${p.state}` : ''}{p.zip ? ` ${p.zip}` : ''}</div>}
                          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                            {(() => {
                              const links = buildMapsLinks(p.street, p.city, p.state, p.zip);
                              if (links.direct) {
                                return (
                                  <a href={links.direct} target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                                    🗺️ Abrir ubicación
                                  </a>
                                );
                              }
                              return (
                                <>
                                  <a href={links.google} target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                                    🗺️ Google Maps
                                  </a>
                                  <a href={links.apple} target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#000', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                                    🍎 Apple Maps
                                  </a>
                                  <a href={links.waze} target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#33CCFF', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                                    🚗 Waze
                                  </a>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                      {/* Contactos asociados */}
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Contactos asociados</p>
                        {contacts.filter(c => c.property_id === p.id).length === 0
                          ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin contactos asociados.</p>
                          : contacts.filter(c => c.property_id === p.id).map(c => (
                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                              </div>
                              {c.phone && <a href={`tel:${c.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#27ae60', color: '#fff', borderRadius: 7, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>📞 {c.phone}</a>}
                              {c.email && <a href={`mailto:${c.email}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'var(--navy)', color: '#fff', borderRadius: 7, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>✉️ {c.email}</a>}
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* CONTACTS TAB */}
      {tab === 'contacts' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showContactForm ? 20 : 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Contactos ({contacts.length})</h2>
              <button className="btn btn-primary" onClick={() => setShowContactForm(!showContactForm)}>
                {showContactForm ? 'Cancelar' : '+ Agregar contacto'}
              </button>
            </div>
            {showContactForm && (
              <form onSubmit={saveContact}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Nombre *</label>
                    <input value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))} placeholder="Nombre completo" required />
                  </div>
                  <div className="form-group">
                    <label>Teléfono</label>
                    <input value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} placeholder="787-000-0000" />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} placeholder="contacto@email.com" />
                  </div>
                  {properties.length > 0 && (
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Propiedad asociada</label>
                      <select value={contact.property_id} onChange={e => setContact(c => ({ ...c, property_id: e.target.value }))}>
                        <option value="">— Sin propiedad —</option>
                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <button type="submit" className="btn btn-primary" disabled={savingContact}>
                  {savingContact ? 'Guardando...' : '💾 Guardar contacto'}
                </button>
              </form>
            )}
          </div>

          {contacts.length === 0 ? (
            <div className="card empty"><p>No hay contactos. Agrega el primero arriba.</p></div>
          ) : contacts.map(c => (
            <div key={c.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                    {c.is_primary && <span className="badge badge-green">Principal</span>}
                  </div>
                  {c.phone && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{c.phone}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => setExpandedContact(expandedContact === c.id ? null : c.id)} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
                    {expandedContact === c.id ? 'Cerrar ↑' : 'Ver →'}
                  </button>
                  <button onClick={() => deleteContact(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>🗑</button>
                </div>
              </div>

              {expandedContact === c.id && (
                <div style={{ marginTop: 16, borderTop: '1.5px solid var(--border)', paddingTop: 16 }}>
                  {editingContact === c.id ? (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label>Nombre</label>
                          <input value={editContactData.name ?? ''} onChange={e => setEditContactData(d => ({ ...d, name: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label>Teléfono</label>
                          <input value={editContactData.phone ?? ''} onChange={e => setEditContactData(d => ({ ...d, phone: e.target.value }))} placeholder="787-000-0000" />
                        </div>
                        <div className="form-group">
                          <label>Email</label>
                          <input type="email" value={editContactData.email ?? ''} onChange={e => setEditContactData(d => ({ ...d, email: e.target.value }))} placeholder="contacto@email.com" />
                        </div>
                        {properties.length > 0 && (
                          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label>Propiedad asociada</label>
                            <select value={editContactData.property_id ?? ''} onChange={e => setEditContactData(d => ({ ...d, property_id: e.target.value || null }))}>
                              <option value="">— Sin propiedad —</option>
                              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button className="btn btn-primary" onClick={() => saveEditContact(c.id)} disabled={savingEditContact}>
                          {savingEditContact ? 'Guardando...' : '💾 Guardar'}
                        </button>
                        <button className="btn btn-ghost" onClick={() => setEditingContact(null)}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => { setEditingContact(c.id); setEditContactData({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', property_id: c.property_id ?? '' }); }}>
                          ✏️ Editar
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        {c.phone && (
                          <div>
                            <p style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Teléfono</p>
                            <a href={`tel:${c.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#27ae60', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                              📞 {c.phone}
                            </a>
                          </div>
                        )}
                        {c.email && (
                          <div>
                            <p style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Email</p>
                            <a href={`mailto:${c.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--navy)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                              ✉️ {c.email}
                            </a>
                          </div>
                        )}
                      </div>
                      {c.property_id && (
                        <div>
                          <p style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Propiedad asociada</p>
                          <div style={{ fontSize: 14, color: 'var(--amber)', fontWeight: 600 }}>📍 {properties.find(p => p.id === c.property_id)?.name ?? '—'}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* JOBS TAB */}
      {tab === 'jobs' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Trabajos</h2>
            <Link href={`/trabajos/nuevo?client=${client.id}`} className="btn btn-primary">+ Nuevo trabajo</Link>
          </div>
          {jobs.length === 0 ? (
            <div className="empty"><p>No hay trabajos para este cliente.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Título</th><th>Estado</th><th>Fecha</th><th></th></tr>
                </thead>
                <tbody>
                  {jobs.map(j => {
                    const b = statusJob[j.status] ?? statusJob.estimate;
                    return (
                      <tr key={j.id}>
                        <td style={{ fontWeight: 600 }}>{j.title}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{j.scheduled_start ? new Date(j.scheduled_start).toLocaleDateString('es-PR') : '—'}</td>
                        <td><Link href={`/trabajos/${j.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* INVOICES TAB */}
      {tab === 'invoices' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Facturas</h2>
          </div>
          {invoices.length === 0 ? (
            <div className="empty"><p>No hay facturas para este cliente.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Número</th><th>Estado</th><th>Total</th><th>Fecha</th><th></th></tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const b = statusInv[inv.status] ?? statusInv.draft;
                    return (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: 600 }}>{inv.invoice_number ?? '—'}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ fontWeight: 700 }}>{fmt(inv.total)}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{new Date(inv.created_at).toLocaleDateString('es-PR')}</td>
                        <td><Link href={`/facturas/${inv.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PROPOSALS TAB */}
      {tab === 'proposals' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Propuestas</h2>
            <Link href={`/propuestas/nuevo?client=${client.id}`} className="btn btn-primary">+ Nueva propuesta</Link>
          </div>
          {proposals.length === 0 ? (
            <div className="empty"><p>No hay propuestas para este cliente.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>Título</th><th>Estado</th><th>Total</th><th>Fecha</th><th></th></tr>
                </thead>
                <tbody>
                  {proposals.map(p => {
                    const b = statusProp[p.status] ?? statusProp.borrador;
                    const opt = (p.proposal_options ?? []).find(o => o.is_recommended) ?? (p.proposal_options ?? [])[0];
                    const total = (opt?.proposal_line_items ?? []).reduce((s, li) => s + Number(li.quantity ?? 0) * Number(li.unit_price ?? 0), 0);
                    return (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{p.proposal_number}</td>
                        <td style={{ fontWeight: 600 }}>{p.title}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ fontWeight: 700 }}>{fmt(total)}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{new Date(p.created_at).toLocaleDateString('es-PR')}</td>
                        <td><Link href={`/propuestas/${p.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* INTERNAL NOTES TAB */}
      {tab === 'internalNotes' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 12 }}>Nueva nota interna</p>
            <form onSubmit={addInternalNote}>
              <textarea
                value={newInternalNote}
                onChange={e => setNewInternalNote(e.target.value)}
                placeholder="Escribe una nota interna sobre este cliente..."
                rows={3}
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 10 }}
              />
              <button type="submit" className="btn btn-primary" disabled={savingInternalNote || !newInternalNote.trim()}>
                {savingInternalNote ? 'Guardando...' : '💾 Guardar nota'}
              </button>
            </form>
          </div>

          {sortedInternalNotes.length === 0 ? (
            <div className="card empty"><p>No hay notas internas para este cliente.</p></div>
          ) : sortedInternalNotes.map(n => (
            <div key={n.id} className="card" style={{ marginBottom: 12, ...(n.is_pinned ? { border: '1.5px solid var(--amber)', background: '#fffaf0' } : {}) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }} suppressHydrationWarning>
                  {n.is_pinned && <span title="Pineada">📌</span>}
                  {new Date(n.created_at).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => toggleInternalNotePin(n.id, n.is_pinned)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: n.is_pinned ? 'var(--amber)' : 'var(--muted)', fontSize: 15 }} title={n.is_pinned ? 'Despinear' : 'Pinear'}>
                    📌
                  </button>
                  {editingInternalNoteId !== n.id && (
                    <button onClick={() => { setEditingInternalNoteId(n.id); setEditingInternalNoteText(n.note ?? ''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 15 }}>✏️</button>
                  )}
                  <button onClick={() => deleteInternalNote(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>🗑</button>
                </div>
              </div>
              {editingInternalNoteId === n.id ? (
                <div>
                  <textarea autoFocus value={editingInternalNoteText} onChange={e => setEditingInternalNoteText(e.target.value)} rows={3}
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 8 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" style={{ fontSize: 13, padding: '5px 12px' }} onClick={() => saveInternalNoteEdit(n.id)}>Guardar</button>
                    <button className="btn btn-ghost" style={{ fontSize: 13, padding: '5px 12px' }} onClick={() => { setEditingInternalNoteId(null); setEditingInternalNoteText(''); }}>Cancelar</button>
                  </div>
                </div>
              ) : <p style={{ fontSize: 14, color: 'var(--text)', margin: 0, whiteSpace: 'pre-wrap' }}>{n.note}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Delete modal */}
      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar cliente?</h2>
            {jobCount > 0 ? (
              <div style={{ background: '#fef3cd', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>⚠️ Este cliente tiene {jobCount} trabajo{jobCount > 1 ? 's' : ''} existente{jobCount > 1 ? 's' : ''}.</p>
                <p style={{ fontSize: 13, color: '#92400e' }}>Al eliminar el cliente se borrarán también todos sus trabajos, notas, fotos y checklists.</p>
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Esta acción es permanente.</p>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={deleteClient} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: '#fdecea', color: 'var(--warn)', border: 'none' }}>
                {deleting ? 'Eliminando...' : '🗑 Sí, eliminar todo'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
