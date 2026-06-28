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
  const [newItem, setNewItem] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const groups = [...new Set(checklistItems.map(i => i.group_name).filter(Boolean))];

  function addGroup() {
    if (!newGroup.trim()) return;
    if (!groups.includes(newGroup.trim())) setSelectedGroup(newGroup.trim());
    setSelectedGroup(newGroup.trim());
    setNewGroup('');
  }

  async function renameGroup(oldName) {
    const newName = prompt(`Renombrar grupo "${oldName}":`, oldName);
    if (!newName || newName === oldName) return;
    await supabase.from('job_checklist_items').update({ group_name: newName }).eq('job_id', job.id).eq('group_name', oldName);
    setChecklistItems(prev => prev.map(i => i.group_name === oldName ? { ...i, group_name: newName } : i));
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
    router.push('/trabajos');
  }

  // ─── Notes & Photos ───
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
      const { error } = await supabase.storage.from('job-photos').upload(path, pendingPhoto);
      if (!error) {
        photoUrl = `${SUPABASE_URL}/storage/v1/object/public/job-photos/${path}`;
      }
      setUploadingPhoto(false);
    }

    const { data: newNote } = await supabase.from('job_notes').insert([{
      job_id: job.id,
      note: noteText.trim() || null,
      photo_url: photoUrl,
    }]).select().single();

    if (newNote) setNotesList(prev => [newNote, ...prev]);
    setNoteText('');
    setPendingPhoto(null);
    setPendingPhotoPreview(null);
    setSavingNote(false);
  }

  async function deleteNote(noteId) {
    await supabase.from('job_notes').delete().eq('id', noteId);
    setNotesList(prev => prev.filter(n => n.id !== noteId));
  }

  // ─── Checklist ───
  async function addItem(e) {
    e.preventDefault();
    if (!newItem.trim()) return;
    setAddingItem(true);
    console.log('Adding item:', { job_id: job.id, description: newItem.trim(), group_name: selectedGroup || null });
    const { data } = await supabase.from('job_checklist_items').insert([{
      job_id: job.id,
      description: newItem.trim(),
      sort_order: checklistItems.length,
    }]).select().single();
    if (data) setChecklistItems(prev => [...prev, data]);
    setNewItem('');
    setAddingItem(false);
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
    const items = template.checklist_template_items?.sort((a, b) => a.sort_order - b.sort_order) ?? [];
    const toInsert = items.map((it, idx) => ({
      job_id: job.id,
      description: it.description,
      sort_order: checklistItems.length + idx,
    }));
    const { data } = await supabase.from('job_checklist_items').insert(toInsert).select();
    if (data) setChecklistItems(prev => [...prev, ...data]);
    setShowTemplates(false);
  }

  const completedCount = checklistItems.filter(i => i.completed).length;
  const progress = checklistItems.length > 0 ? Math.round((completedCount / checklistItems.length) * 100) : 0;

  const tabStyle = (t) => ({
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
        <button style={tabStyle('info')} onClick={() => setTab('info')}>📋 Info</button>
        <button style={tabStyle('notes')} onClick={() => setTab('notes')}>
          📸 Notas & Fotos {notesList.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{notesList.length}</span>}
        </button>
        <button style={tabStyle('checklist')} onClick={() => setTab('checklist')}>
          ✅ Checklist {checklistItems.length > 0 && <span style={{ background: progress === 100 ? '#e6f4ee' : 'var(--bg)', color: progress === 100 ? '#1a7a4a' : 'var(--muted)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{completedCount}/{checklistItems.length}</span>}
        </button>
      </div>

      {/* ─── INFO TAB ─── */}
      {tab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Cliente */}
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
                  {job.clients?.phone && (
                    <a href={`tel:${job.clients.phone}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#27ae60', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                      📞 {job.clients.phone}
                    </a>
                  )}
                  {job.clients?.email && (
                    <a href={`mailto:${job.clients.email}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--navy)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                      ✉️ {job.clients.email}
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Contacto encargado */}
            {(job.contact_name || job.contact_phone || job.contact_email) && (
              <div className="card">
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>👤 Contacto encargado</p>
                {job.contact_name && <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{job.contact_name}</div>}
                {(job.contact_phone || job.contact_email) && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {job.contact_phone && (
                      <a href={`tel:${job.contact_phone}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#27ae60', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                        📞 {job.contact_phone}
                      </a>
                    )}
                    {job.contact_email && (
                      <a href={`mailto:${job.contact_email}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--navy)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                        ✉️ {job.contact_email}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Propiedad */}
            {(job.street || job.city || job.property_name) && (
              <div className="card">
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>📍 Propiedad</p>
                {job.property_name && <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{job.property_name}</div>}
                {job.street && <div style={{ fontSize: 14, color: 'var(--muted)' }}>{job.street}</div>}
                {job.city && <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 10 }}>{job.city}{job.state ? `, ${job.state}` : ''}{job.zip ? ` ${job.zip}` : ''}</div>}
                {(job.street || job.city) && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([job.street, job.city, job.state, job.zip].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                      🗺️ Google Maps
                    </a>
                    <a href={`https://maps.apple.com/?q=${encodeURIComponent([job.street, job.city, job.state, job.zip].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#000', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                      🍎 Apple Maps
                    </a>
                    <a href={`https://waze.com/ul?q=${encodeURIComponent([job.street, job.city, job.state, job.zip].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#33CCFF', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                      🚗 Waze
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Detalles */}
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
                  <thead>
                    <tr><th>Descripción</th><th>Tipo</th><th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr>
                  </thead>
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
                <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                  placeholder="Escribe una nota..." rows={3}
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
          ) : (
            notesList.map(n => (
              <div key={n.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: n.photo_url || n.note ? 10 : 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }} suppressHydrationWarning>
                    {new Date(n.created_at).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <button onClick={() => deleteNote(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>🗑</button>
                </div>
                {n.photo_url && (
                  <img src={n.photo_url} alt="job photo" style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 10, marginBottom: n.note ? 10 : 0 }} />
                )}
                {n.note && <p style={{ fontSize: 14, color: 'var(--text)', margin: 0 }}>{n.note}</p>}
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── CHECKLIST TAB ─── */}
      {tab === 'checklist' && (
        <div style={{ maxWidth: 700 }}>
          {checklistItems.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Progreso</span>
                <span style={{ fontWeight: 700, color: progress === 100 ? 'var(--ok)' : 'var(--navy)' }}>{progress}%</span>
              </div>
              <div style={{ background: 'var(--border)', borderRadius: 50, height: 8 }}>
                <div style={{ background: progress === 100 ? 'var(--ok)' : 'var(--amber)', borderRadius: 50, height: 8, width: `${progress}%`, transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{completedCount} de {checklistItems.length} completados</div>
            </div>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Agregar ítem</p>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setShowTemplates(!showTemplates)}>
                📋 Usar plantilla
              </button>
            </div>

            {showTemplates && (
              <div style={{ marginBottom: 16, background: 'var(--bg)', borderRadius: 10, padding: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>PLANTILLAS DISPONIBLES</p>
                {templates.length === 0
                  ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No hay plantillas. <a href="/admin/plantillas" style={{ color: 'var(--amber)' }}>Crear una →</a></p>
                  : templates.map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.checklist_template_items?.length ?? 0} ítems</div>
                      </div>
                      <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => applyTemplate(t)}>Aplicar</button>
                    </div>
                  ))
                }
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <input value={newGroup} onChange={e => setNewGroup(e.target.value)} placeholder="Nombre del grupo (opcional)..." style={{ flex: 1, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }} onClick={addGroup}>+ Grupo</button>
            </div>
            <form onSubmit={addItem} style={{ display: 'flex', gap: 10 }}>
              <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} style={{ padding: '10px 10px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', minWidth: 140 }}>
                <option value="">Sin grupo</option>
                {groups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Descripción del ítem..." style={{ flex: 1, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
              <button type="submit" className="btn btn-primary" disabled={addingItem}>+ Agregar</button>
            </form>
          </div>

          <div className="card">
            {checklistItems.length === 0 ? (
              <div className="empty"><p>Sin ítems. Agrega uno arriba o usa una plantilla.</p></div>
            ) : (
              (() => {
                const grouped = {};
                checklistItems.forEach(item => {
                  const g = item.group_name || '';
                  if (!grouped[g]) grouped[g] = [];
                  grouped[g].push(item);
                });
                return Object.entries(grouped).map(([groupName, items]) => (
                  <div key={groupName} style={{ marginBottom: 16 }}>
                    {groupName && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📁 {groupName}</div>
                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                        <button onClick={() => renameGroup(groupName)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}>✏️</button>
                      </div>
                    )}
                    {items.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <div onClick={() => toggleItem(item.id, item.completed)}
                          style={{ width: 22, height: 22, borderRadius: 6, border: item.completed ? 'none' : '2px solid var(--border)', background: item.completed ? 'var(--ok)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                          {item.completed && <span style={{ color: '#fff', fontSize: 13, fontWeight: 900 }}>✓</span>}
                        </div>
                        <span style={{ flex: 1, fontSize: 14, textDecoration: item.completed ? 'line-through' : 'none', color: item.completed ? 'var(--muted)' : 'var(--text)' }}>
                          {item.description}
                        </span>
                        {item.completed && item.completed_at && (
                          <span style={{ fontSize: 11, color: 'var(--muted)' }} suppressHydrationWarning>
                            {new Date(item.completed_at).toLocaleDateString('es-PR')}
                          </span>
                        )}
                        <button onClick={() => deleteItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>×</button>
                      </div>
                    ))}
                  </div>
                ));
              })()
            )}
          </div>
        </div>
      )}

      {/* Delete modal */}
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
