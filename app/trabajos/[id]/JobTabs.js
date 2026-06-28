'use client';
import { useState, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';

const SUPABASE_URL = 'https://zisidorwdhrttmdppnbj.supabase.co';

const statusOptions = [
  { value: 'estimate', label: 'Estimado' },
  { value: 'scheduled', label: 'Programado' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'completed', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
];

export default function JobTabs({ job, items, technicians, notes, checklist, templates, clientType, totals }) {
  const router = useRouter();
  const fmt = n => `$${Number(n).toFixed(2)}`;
  const [tab, setTab] = useState('info');
  const [status, setStatus] = useState(job.status);
  const [techId, setTechId] = useState(job.technician_id ?? '');
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [schedStart, setSchedStart] = useState(job.scheduled_start ? new Date(job.scheduled_start).toISOString().slice(0, 16) : '');
  const [schedEnd, setSchedEnd] = useState(job.scheduled_end ? new Date(job.scheduled_end).toISOString().slice(0, 16) : '');
  const [savingSchedule, setSavingSchedule] = useState(false);

  async function saveSchedule() {
    setSavingSchedule(true);
    await supabase.from('jobs').update({
      scheduled_start: schedStart || null,
      scheduled_end: schedEnd || null,
    }).eq('id', job.id);
    setSavingSchedule(false);
    setEditingSchedule(false);
    router.refresh();
  }

  // Notes state
  const [notesList, setNotesList] = useState(notes);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileRef = useRef();
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState(null);

  // Checklist state
  const [checklistItems, setChecklistItems] = useState(checklist);
  const [showTemplates, setShowTemplates] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupMenuOpen, setGroupMenuOpen] = useState(null);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(null);
  const [newItemText, setNewItemText] = useState({});
  const [addingItemGroup, setAddingItemGroup] = useState(null);

  const groupedMap = {};
  checklistItems.forEach(i => {
    const g = i.group_name || '__none__';
    if (!groupedMap[g]) groupedMap[g] = [];
    groupedMap[g].push(i);
  });

  async function addGroup() {
    if (!newGroupName.trim()) return;
    setAddingGroup(false);
    setChecklistItems(prev => [...prev, {
      id: '__placeholder__' + Date.now(),
      job_id: job.id,
      description: '',
      group_name: newGroupName.trim(),
      completed: false,
      sort_order: prev.length,
      __placeholder: true,
    }]);
    setNewGroupName('');
  }

  async function addItemToGroup(groupName) {
    const key = groupName ?? '__none__';
    const text = newItemText[key] ?? '';
    if (!text.trim()) return;
    const { data } = await supabase.from('job_checklist_items').insert([{
      job_id: job.id,
      description: text.trim(),
      sort_order: checklistItems.filter(i => !i.__placeholder).length,
      group_name: groupName || null,
    }]).select().single();
    if (data) setChecklistItems(prev => [
      ...prev.filter(i => !(i.__placeholder && i.group_name === groupName)),
      data,
    ]);
    setNewItemText(prev => ({ ...prev, [key]: '' }));
    setAddingItemGroup(null);
  }

  async function renameGroup(oldName) {
    const newName = prompt(`Renombrar grupo "${oldName}":`, oldName);
    if (!newName || newName === oldName) return;
    await supabase.from('job_checklist_items').update({ group_name: newName })
      .eq('job_id', job.id).eq('group_name', oldName);
    setChecklistItems(prev => prev.map(i => i.group_name === oldName ? { ...i, group_name: newName } : i));
    setGroupMenuOpen(null);
  }

  async function deleteGroup(groupName) {
    if (!confirm(`¿Eliminar el grupo "${groupName}" y todos sus ítems?`)) return;
    await supabase.from('job_checklist_items').delete().eq('job_id', job.id).eq('group_name', groupName);
    setChecklistItems(prev => prev.filter(i => i.group_name !== groupName));
    setGroupMenuOpen(null);
  }

  async function updateStatus(val) {
    setStatus(val);
    await supabase.from('jobs').update({ status: val }).eq('id', job.id);
    router.refresh();
  }

  async function assignTech(val) {
    setTechId(val);
    await supabase.from('jobs').update({ technician_id: val || null }).eq('id', job.id);
  }

  async function deleteJob() {
    setDeleting(true);
    await supabase.from('job_line_items').delete().eq('job_id', job.id);
    await supabase.from('job_notes').delete().eq('job_id', job.id);
    await supabase.from('job_checklist_items').delete().eq('job_id', job.id);
    await supabase.from('jobs').delete().eq('id', job.id);
    window.location.replace('/trabajos');
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingPhoto(file);
    setPendingPhotoPreview(URL.createObjectURL(file));
  }

  async function saveNote(e) {
    e.preventDefault();
    if (!noteText.trim() && !pendingPhoto) return;
    setSavingNote(true);
    let photoUrl = null;
    if (pendingPhoto) {
      setUploadingPhoto(true);
      const ext = pendingPhoto.name.split('.').pop();
      const path = `${job.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('Job-photos').upload(path, pendingPhoto);
      if (!error) photoUrl = path; // Save only the path, not the full URL
      setUploadingPhoto(false);
    }
    const { data: newNote } = await supabase.from('job_notes').insert([{
      job_id: job.id, note: noteText.trim() || null, photo_url: photoUrl,
    }]).select().single();
    if (newNote) setNotesList(prev => [{ ...newNote, photo_url: null }, ...prev]);
    setNoteText(''); setPendingPhoto(null); setPendingPhotoPreview(null); setSavingNote(false);
    if (photoUrl) window.location.reload();
  }

  async function deleteNote(noteId) {
    await supabase.from('job_notes').delete().eq('id', noteId);
    setNotesList(prev => prev.filter(n => n.id !== noteId));
  }

  async function toggleItem(itemId, completed) {
    await supabase.from('job_checklist_items').update({
      completed: !completed,
      completed_at: !completed ? new Date().toISOString() : null,
    }).eq('id', itemId);
    setChecklistItems(prev => prev.map(i => i.id === itemId ? { ...i, completed: !completed } : i));
  }

  async function deleteItem(itemId) {
    await supabase.from('job_checklist_items').delete().eq('id', itemId);
    setChecklistItems(prev => prev.filter(i => i.id !== itemId));
  }

  async function applyTemplate(template) {
    const its = template.checklist_template_items?.sort((a, b) => a.sort_order - b.sort_order) ?? [];
    const toInsert = its.map((it, idx) => ({
      job_id: job.id, description: it.description,
      sort_order: checklistItems.length + idx,
    }));
    const { data } = await supabase.from('job_checklist_items').insert(toInsert).select();
    if (data) setChecklistItems(prev => [...prev, ...data]);
    setShowTemplates(false);
  }

  const completedCount = checklistItems.filter(i => i.completed && !i.__placeholder).length;
  const realCount = checklistItems.filter(i => !i.__placeholder).length;
  const progress = realCount > 0 ? Math.round((completedCount / realCount) * 100) : 0;

  const tabStyle = (t) => ({
    padding: '10px 20px', fontWeight: tab === t ? 700 : 500,
    color: tab === t ? 'var(--navy)' : 'var(--muted)', cursor: 'pointer',
    background: 'none', border: 'none',
    borderBottom: tab === t ? '2px solid var(--navy)' : '2px solid transparent', fontSize: 14,
  });

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1.5px solid var(--border)', marginBottom: 20, background: '#fff', borderRadius: '12px 12px 0 0', padding: '0 8px' }}>
        <button style={tabStyle('info')} onClick={() => setTab('info')}>📋 Info</button>
        <button style={tabStyle('notes')} onClick={() => setTab('notes')}>
          📸 Notas & Fotos {notesList.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{notesList.length}</span>}
        </button>
        <button style={tabStyle('checklist')} onClick={() => setTab('checklist')}>
          ✅ Checklist {realCount > 0 && <span style={{ background: progress === 100 ? '#e6f4ee' : 'var(--bg)', color: progress === 100 ? '#1a7a4a' : 'var(--muted)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{completedCount}/{realCount}</span>}
        </button>
      </div>

      {/* ─── INFO TAB ─── */}
      {tab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Cliente</p>
                <a href={`/clientes/${job.client_id}`} style={{ color: 'var(--amber)', fontSize: 13, fontWeight: 600 }}>Ver cliente →</a>
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{job.clients?.name}</div>
              <span className={`badge ${job.clients?.client_type === 'b2b' ? 'badge-blue' : 'badge-gray'}`} style={{ marginBottom: 12, display: 'inline-block' }}>
                {job.clients?.client_type === 'b2b' ? 'B2B' : 'Consumidor final'}
              </span>
              {(job.clients?.phone || job.clients?.email) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {job.clients?.phone && <a href={`tel:${job.clients.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#27ae60', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>📞 {job.clients.phone}</a>}
                  {job.clients?.email && <a href={`mailto:${job.clients.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--navy)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>✉️ {job.clients.email}</a>}
                </div>
              )}
            </div>

            {(job.contact_name || job.contact_phone || job.contact_email) && (
              <div className="card">
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>👤 Contacto encargado</p>
                {job.contact_name && <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{job.contact_name}</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {job.contact_phone && <a href={`tel:${job.contact_phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#27ae60', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>📞 {job.contact_phone}</a>}
                  {job.contact_email && <a href={`mailto:${job.contact_email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--navy)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>✉️ {job.contact_email}</a>}
                </div>
              </div>
            )}

            {(job.street || job.city || job.property_name) && (
              <div className="card">
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>📍 Propiedad</p>
                {job.property_name && <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{job.property_name}</div>}
                {job.street && <div style={{ fontSize: 14, color: 'var(--muted)' }}>{job.street}</div>}
                {job.city && <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 10 }}>{job.city}{job.state ? `, ${job.state}` : ''}{job.zip ? ` ${job.zip}` : ''}</div>}
                {(job.street || job.city) && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([job.street, job.city, job.state, job.zip].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🗺️ Google Maps</a>
                    <a href={`https://maps.apple.com/?q=${encodeURIComponent([job.street, job.city, job.state, job.zip].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#000', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🍎 Apple Maps</a>
                    <a href={`https://waze.com/ul?q=${encodeURIComponent([job.street, job.city, job.state, job.zip].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#33CCFF', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🚗 Waze</a>
                  </div>
                )}
              </div>
            )}

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Detalles</p>
              {job.description && <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 12 }}>{job.description}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {job.scheduled_start && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Inicio</div>
                    <div style={{ fontSize: 14 }} suppressHydrationWarning>{new Date(job.scheduled_start).toLocaleString('es-PR')}</div>
                  </div>
                )}
                {job.scheduled_end && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Fin</div>
                    <div style={{ fontSize: 14 }} suppressHydrationWarning>{new Date(job.scheduled_end).toLocaleString('es-PR')}</div>
                  </div>
                )}
              </div>
              {job.notes && (
                <div style={{ marginTop: 12, padding: '12px 14px', background: '#f8f9fb', borderRadius: 8, fontSize: 13, color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--navy)' }}>Notas:</strong> {job.notes}
                </div>
              )}
            </div>

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Líneas de trabajo</p>
              {!items?.length ? <p style={{ color: 'var(--muted)', fontSize: 14 }}>Sin líneas.</p> : (
                <table>
                  <thead><tr><th>Descripción</th><th>Tipo</th><th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
                  <tbody>
                    {items.map(it => (
                      <tr key={it.id}>
                        <td style={{ fontWeight: 500 }}>{it.description}</td>
                        <td><span className={`badge ${it.type === 'labor' ? 'badge-amber' : 'badge-gray'}`}>{it.type === 'labor' ? 'Labor' : 'Producto'}</span></td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{it.quantity}</td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(it.unit_price)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(Number(it.quantity) * Number(it.unit_price))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Estado</p>
              <select value={status} onChange={e => updateStatus(e.target.value)} style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}>
                {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Técnico asignado</p>
              <select value={techId} onChange={e => assignTech(e.target.value)} style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}>
                <option value="">— Sin asignar —</option>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Resumen IVU</p>
              {clientType === 'b2b' && <div style={{ background: '#e8eeff', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#2a4cb5', fontWeight: 600 }}>Cliente B2B — Labor al 4%</div>}
              {[
                { label: 'Subtotal productos', value: totals.subProd },
                { label: 'IVU productos (11.5%)', value: totals.taxProd },
                { label: 'Subtotal labor', value: totals.subLabor },
                { label: `IVU labor (${clientType === 'b2b' ? '4%' : '11.5%'})`, value: totals.taxLabor },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)' }}>{r.label}</span><span>{fmt(r.value)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 18, fontWeight: 900, color: 'var(--navy)' }}>
                <span>Total</span><span>{fmt(totals.total)}</span>
              </div>
            </div>
            <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: '#fca5a5', width: '100%', justifyContent: 'center' }} onClick={() => setShowDelete(true)}>
              🗑 Eliminar trabajo
            </button>
          </div>
        </div>
      )}

      {/* ─── NOTES & PHOTOS TAB ─── */}
      {tab === 'notes' && (
        <div style={{ maxWidth: 700 }}>
          <div className="card" style={{ marginBottom: 20 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Agregar nota o foto</p>
            <form onSubmit={saveNote}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Escribe una nota..." rows={3}
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
              </div>
              {pendingPhotoPreview && (
                <div style={{ marginBottom: 12, position: 'relative', display: 'inline-block' }}>
                  <img src={pendingPhotoPreview} alt="preview" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10 }} />
                  <button type="button" onClick={() => { setPendingPhoto(null); setPendingPhotoPreview(null); }}
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>📷 Foto</button>
                <button type="submit" className="btn btn-primary" disabled={savingNote || uploadingPhoto} style={{ flex: 1, justifyContent: 'center' }}>
                  {uploadingPhoto ? 'Subiendo foto...' : savingNote ? 'Guardando...' : '💾 Guardar'}
                </button>
              </div>
            </form>
          </div>
          {notesList.length === 0 ? (
            <div className="empty"><p>No hay notas aún.</p></div>
          ) : notesList.map(n => (
            <div key={n.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: n.photo_url || n.note ? 10 : 0 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }} suppressHydrationWarning>
                  {new Date(n.created_at).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
                <button onClick={() => deleteNote(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>🗑</button>
              </div>
              {n.photo_url && <img src={n.photo_url} alt="job photo" style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 10, marginBottom: n.note ? 10 : 0 }} />}
              {n.note && <p style={{ fontSize: 14, color: 'var(--text)', margin: 0 }}>{n.note}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ─── CHECKLIST TAB ─── */}
      {tab === 'checklist' && (
        <div style={{ maxWidth: 700 }}>
          {realCount > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Progreso</span>
                <span style={{ fontWeight: 700, color: progress === 100 ? 'var(--ok)' : 'var(--navy)' }}>{progress}%</span>
              </div>
              <div style={{ background: 'var(--border)', borderRadius: 50, height: 8 }}>
                <div style={{ background: progress === 100 ? 'var(--ok)' : 'var(--amber)', borderRadius: 50, height: 8, width: `${progress}%`, transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{completedCount} de {realCount} completados</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => setAddingGroup(true)} style={{ whiteSpace: 'nowrap' }}>+ Nuevo grupo</button>
            <button className="btn btn-ghost" onClick={() => setShowTemplates(!showTemplates)} style={{ whiteSpace: 'nowrap' }}>📋 Plantilla</button>
          </div>

          {addingGroup && (
            <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
              <input autoFocus value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addGroup()}
                placeholder="Nombre del grupo..." style={{ flex: 1, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
              <button className="btn btn-primary" onClick={addGroup}>Crear</button>
              <button className="btn btn-ghost" onClick={() => { setAddingGroup(false); setNewGroupName(''); }}>Cancelar</button>
            </div>
          )}

          {showTemplates && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>PLANTILLAS</p>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setShowTemplates(false)}>✕ Cancelar</button>
              </div>
              {templates.length === 0
                ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No hay plantillas. <a href="/admin/plantillas" style={{ color: 'var(--amber)' }}>Crear una →</a></p>
                : templates.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.checklist_template_items?.length ?? 0} ítems</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => { applyTemplate(t); setShowTemplates(false); }}>Aplicar</button>
                      <div style={{ position: 'relative' }}>
                        <button onClick={() => setTemplateMenuOpen(templateMenuOpen === t.id ? null : t.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 20, lineHeight: 1, padding: '2px 6px' }}>⋮</button>
                        {templateMenuOpen === t.id && (
                          <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setTemplateMenuOpen(null)} />
                            <div style={{ position: 'absolute', right: 0, top: 28, background: '#fff', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: '1px solid var(--border)', zIndex: 99, minWidth: 160, overflow: 'hidden' }}>
                              <button onClick={() => { applyTemplate(t); setShowTemplates(false); setTemplateMenuOpen(null); }} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, cursor: 'pointer' }}>✅ Aplicar</button>
                              <button onClick={() => { setShowTemplates(false); setTemplateMenuOpen(null); }} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, cursor: 'pointer' }}>✕ Cancelar</button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {Object.keys(groupedMap).length === 0 && (
            <div className="card empty"><p>Sin ítems. Crea un grupo o agrega ítems directamente.</p></div>
          )}

          {Object.entries(groupedMap).map(([groupKey, groupItems]) => {
            const groupName = groupKey === '__none__' ? null : groupKey;
            const realItems = groupItems.filter(i => !i.__placeholder);
            return (
              <div key={groupKey} className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>
                    {groupName ?? 'General'}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setGroupMenuOpen(groupMenuOpen === groupKey ? null : groupKey)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 20, lineHeight: 1, padding: '2px 6px' }}>⋮</button>
                    {groupMenuOpen === groupKey && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setGroupMenuOpen(null)} />
                        <div style={{ position: 'absolute', right: 0, top: 28, background: '#fff', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: '1px solid var(--border)', zIndex: 99, minWidth: 160, overflow: 'hidden' }}>
                          <button onClick={() => renameGroup(groupName ?? 'General')} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, cursor: 'pointer' }}>✏️ Renombrar</button>
                          {groupName && <button onClick={() => deleteGroup(groupName)} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, cursor: 'pointer', color: 'var(--warn)' }}>🗑 Eliminar grupo</button>}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {realItems.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div onClick={() => toggleItem(item.id, item.completed)}
                      style={{ width: 24, height: 24, borderRadius: '50%', border: item.completed ? 'none' : '2px solid #ccc', background: item.completed ? '#27ae60' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginTop: 1 }}>
                      {item.completed && <span style={{ color: '#fff', fontSize: 14, fontWeight: 900 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, textDecoration: item.completed ? 'line-through' : 'none', color: item.completed ? 'var(--muted)' : 'var(--text)' }}>
                        {item.description}
                      </div>
                      {item.completed && item.completed_at && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }} suppressHydrationWarning>
                          Completado el {new Date(item.completed_at).toLocaleDateString('es-PR')}
                        </div>
                      )}
                    </div>
                    <button onClick={() => deleteItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>×</button>
                  </div>
                ))}

                {addingItemGroup === groupKey ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <input autoFocus value={newItemText[groupKey] ?? ''}
                      onChange={e => setNewItemText(prev => ({ ...prev, [groupKey]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addItemToGroup(groupName)}
                      placeholder="Descripción del ítem..."
                      style={{ flex: 1, padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                    <button className="btn btn-primary" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => addItemToGroup(groupName)}>Agregar</button>
                    <button className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => setAddingItemGroup(null)}>×</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingItemGroup(groupKey)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, fontWeight: 600, padding: '4px 0' }}>
                    + Nuevo ítem
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar trabajo?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Esta acción es permanente.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteJob} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: '#fdecea', color: 'var(--warn)', border: 'none' }}>
                {deleting ? 'Eliminando...' : '🗑 Sí, eliminar'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
