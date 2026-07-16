'use client';
import { useState, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import LineItemRow from '../../LineItemRow';
import { buildMapsLinks } from '../../../lib/mapsLinks';
import { isoToLocalInput, localInputToIso } from '../../../lib/datetimeLocal';
import { uploadFileWithProgress } from '../../../lib/uploadWithProgress';

const statusOptions = [
  { value: 'nueva', label: 'Nueva' },
  { value: 'necesita_aprobacion', label: 'Necesita aprobación' },
  { value: 'evaluacion_completa', label: 'Evaluación completa' },
];

const TAX_RATES = { final_product: 0.115, final_labor: 0.115, b2b_product: 0.115, b2b_labor: 0.04 };

export default function SolicitudTabs({ solicitud, items, notes, intakePhotoUrls, clientProperties = [], clientContacts = [] }) {
  const router = useRouter();
  const fmt = n => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const clientType = solicitud.clients?.client_type ?? 'final';
  const isOpen = !['convertida', 'archivada'].includes(solicitud.status);

  const [converting, setConverting] = useState(false);
  const [archiving, setArchiving] = useState(false);

  async function convertirATrabajo() {
    if (!confirm(`¿Convertir "${solicitud.title}" en un trabajo? Se creará un nuevo trabajo con esta información.`)) return;
    setConverting(true);
    try {
      const { data: last } = await supabase.from('jobs').select('job_number').order('created_at', { ascending: false }).limit(1).single();
      let nextNum = 1001;
      if (last?.job_number) {
        const n = parseInt(last.job_number.replace('JOB-', ''));
        if (!isNaN(n)) nextNum = n + 1;
      }
      const jobNumber = `JOB-${nextNum}`;

      const { data: job, error: jobErr } = await supabase.from('jobs').insert([{
        job_number: jobNumber,
        client_id: solicitud.client_id,
        title: solicitud.title,
        description: solicitud.description || null,
        status: 'estimate',
        notes: solicitud.notes || null,
        bill_to: 'person',
        property_id: solicitud.property_id || null,
        contact_id: solicitud.contact_id || null,
        property_name: solicitud.property_name || null,
        street: solicitud.street || null,
        city: solicitud.city || null,
        state: solicitud.state || null,
        zip: solicitud.zip || null,
        contact_name: solicitud.contact_name || null,
        contact_phone: solicitud.contact_phone || null,
        contact_email: solicitud.contact_email || null,
      }]).select().single();
      if (jobErr) { alert(jobErr.message); return; }

      if (items.length) {
        await supabase.from('job_line_items').insert(items.map(i => ({
          job_id: job.id, type: i.type, description: i.description,
          quantity: i.quantity, unit_price: i.unit_price, msrp: i.msrp,
          supplier_price: i.supplier_price, exempt_reason: i.exempt_reason,
          area: i.area, vendor: i.vendor, photo_url: i.photo_url, sort_order: i.sort_order,
        })));
      }

      const carriedNotes = [];
      if (solicitud.photo_urls?.length) {
        carriedNotes.push({ job_id: job.id, title: 'Fotos de la solicitud', note: solicitud.description || null, photo_urls: solicitud.photo_urls, photo_url: solicitud.photo_urls[0] });
      }
      for (const n of notes) {
        carriedNotes.push({ job_id: job.id, title: n.title || null, note: n.note, photo_urls: n.raw_photo_urls || null, photo_url: n.raw_photo_urls?.[0] || null });
      }
      if (carriedNotes.length) await supabase.from('job_notes').insert(carriedNotes);

      await supabase.from('solicitudes').update({ status: 'convertida', converted_to_job_id: job.id }).eq('id', solicitud.id);
      router.push(`/trabajos/${job.id}`);
    } finally {
      setConverting(false);
    }
  }

  async function toggleArchive() {
    setArchiving(true);
    const archiving_now = solicitud.status !== 'archivada';
    await supabase.from('solicitudes').update(
      archiving_now ? { status: 'archivada', archived_at: new Date().toISOString() } : { status: 'nueva', archived_at: null }
    ).eq('id', solicitud.id);
    setArchiving(false);
    router.refresh();
  }

  async function updateStatus(val) {
    await supabase.from('solicitudes').update({ status: val }).eq('id', solicitud.id);
    router.refresh();
  }

  // --- Info general ---
  const [editingDetails, setEditingDetails] = useState(false);
  const [titleForm, setTitleForm] = useState(solicitud.title ?? '');
  const [descForm, setDescForm] = useState(solicitud.description ?? '');
  const [notesForm, setNotesForm] = useState(solicitud.notes ?? '');
  const [salespersonForm, setSalespersonForm] = useState(solicitud.salesperson ?? '');
  const [savingDetails, setSavingDetails] = useState(false);

  async function saveDetails() {
    setSavingDetails(true);
    await supabase.from('solicitudes').update({
      title: titleForm.trim() || solicitud.title,
      description: descForm.trim() || null,
      notes: notesForm.trim() || null,
      salesperson: salespersonForm.trim() || null,
    }).eq('id', solicitud.id);
    setSavingDetails(false);
    setEditingDetails(false);
    router.refresh();
  }

  // --- Evaluación en sitio ---
  const [editingAssessment, setEditingAssessment] = useState(false);
  const [assessmentDate, setAssessmentDate] = useState(isoToLocalInput(solicitud.assessment_date));
  const [assessmentInstructions, setAssessmentInstructions] = useState(solicitud.assessment_instructions ?? '');
  const [savingAssessment, setSavingAssessment] = useState(false);

  async function saveAssessment() {
    setSavingAssessment(true);
    await supabase.from('solicitudes').update({
      assessment_date: assessmentDate ? localInputToIso(assessmentDate) : null,
      assessment_instructions: assessmentInstructions.trim() || null,
    }).eq('id', solicitud.id);
    setSavingAssessment(false);
    setEditingAssessment(false);
    router.refresh();
  }

  async function toggleAssessmentComplete() {
    const next = !solicitud.assessment_completed;
    await supabase.from('solicitudes').update({
      assessment_completed: next,
      status: next && solicitud.status === 'nueva' ? 'evaluacion_completa' : solicitud.status,
    }).eq('id', solicitud.id);
    router.refresh();
  }

  // --- Propiedad ---
  const [editingProperty, setEditingProperty] = useState(false);
  const [propertyForm, setPropertyForm] = useState({
    property_id: solicitud.property_id ?? '', property_name: solicitud.property_name ?? '',
    street: solicitud.street ?? '', city: solicitud.city ?? '', state: solicitud.state ?? 'PR', zip: solicitud.zip ?? '',
  });
  const [savingProperty, setSavingProperty] = useState(false);

  function propertyLabel(p) { return `${p.name}${p.city ? ' — ' + p.city : ''}`; }
  function selectProperty(p) {
    setPropertyForm({ property_id: p.id, property_name: p.name ?? '', street: p.street ?? '', city: p.city ?? '', state: p.state ?? 'PR', zip: p.zip ?? '' });
  }

  async function saveProperty() {
    setSavingProperty(true);
    await supabase.from('solicitudes').update({
      property_id: propertyForm.property_id || null,
      property_name: propertyForm.property_name.trim() || null,
      street: propertyForm.street.trim() || null,
      city: propertyForm.city.trim() || null,
      state: propertyForm.state.trim() || null,
      zip: propertyForm.zip.trim() || null,
    }).eq('id', solicitud.id);
    setSavingProperty(false);
    setEditingProperty(false);
    router.refresh();
  }

  const fullAddress = [solicitud.street, solicitud.city, solicitud.state, solicitud.zip].filter(Boolean).join(', ');
  const mapsLinks = buildMapsLinks(solicitud.street, solicitud.city, solicitud.state, solicitud.zip);

  // --- Contacto ---
  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    contact_id: solicitud.contact_id ?? '', contact_name: solicitud.contact_name ?? '',
    contact_phone: solicitud.contact_phone ?? '', contact_email: solicitud.contact_email ?? '',
  });
  const [savingContact, setSavingContact] = useState(false);

  function contactLabel(c) { return `${c.name}${c.phone ? ' — ' + c.phone : ''}`; }
  function selectContact(c) {
    setContactForm({ contact_id: c.id, contact_name: c.name ?? '', contact_phone: c.phone ?? '', contact_email: c.email ?? '' });
  }

  async function saveContact() {
    setSavingContact(true);
    await supabase.from('solicitudes').update({
      contact_id: contactForm.contact_id || null,
      contact_name: contactForm.contact_name.trim() || null,
      contact_phone: contactForm.contact_phone.trim() || null,
      contact_email: contactForm.contact_email.trim() || null,
    }).eq('id', solicitud.id);
    setSavingContact(false);
    setEditingContact(false);
    router.refresh();
  }

  // --- Líneas ---
  const [lineItems, setLineItems] = useState(items);
  const [addingLine, setAddingLine] = useState(false);
  const [newLine, setNewLine] = useState({ type: 'labor', description: '', quantity: 1, unit_price: '', msrp: '', supplier_price: '', exempt: false, area: '', vendor: '', photoFile: null, photoPreview: null });
  const [savingLine, setSavingLine] = useState(false);

  function handleNewLinePhoto(file) {
    if (!file) return;
    setNewLine(l => ({ ...l, photoFile: file, photoPreview: URL.createObjectURL(file) }));
  }

  async function addLineItem() {
    if (!newLine.description.trim()) return;
    setSavingLine(true);
    let photoPath = null;
    if (newLine.photoFile) {
      const ext = newLine.photoFile.name.split('.').pop();
      const path = `${solicitud.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, newLine.photoFile);
      if (!upErr) photoPath = path;
    }
    const { data } = await supabase.from('solicitud_line_items').insert([{
      solicitud_id: solicitud.id, type: newLine.type, description: newLine.description.trim(),
      quantity: parseFloat(newLine.quantity) || 1, unit_price: parseFloat(newLine.unit_price) || 0,
      msrp: newLine.msrp !== '' ? parseFloat(newLine.msrp) : null,
      supplier_price: newLine.supplier_price !== '' ? parseFloat(newLine.supplier_price) : null,
      exempt_reason: newLine.exempt ? 'Exento' : null,
      area: newLine.area || null, vendor: newLine.vendor || null,
      photo_url: photoPath, sort_order: lineItems.length,
    }]).select().single();
    if (data) setLineItems(prev => [...prev, { ...data, photo_signed_url: newLine.photoPreview }]);
    setNewLine({ type: 'labor', description: '', quantity: 1, unit_price: '', msrp: '', supplier_price: '', exempt: false, area: '', vendor: '', photoFile: null, photoPreview: null });
    setAddingLine(false);
    setSavingLine(false);
  }

  async function deleteLineItem(itemId) {
    await supabase.from('solicitud_line_items').delete().eq('id', itemId);
    setLineItems(prev => prev.filter(i => i.id !== itemId));
  }

  let subProd = 0, taxProd = 0, subLabor = 0, taxLabor = 0;
  lineItems.forEach(it => {
    const base = Number(it.quantity) * Number(it.unit_price);
    const rate = it.exempt_reason ? 0 : (TAX_RATES[`${clientType}_${it.type}`] ?? 0.115);
    if (it.type === 'product') { subProd += base; taxProd += base * rate; }
    else { subLabor += base; taxLabor += base * rate; }
  });
  const total = subProd + taxProd + subLabor + taxLabor;

  // --- Notas ---
  const [notesList, setNotesList] = useState(notes);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [pendingPhotoPreviews, setPendingPhotoPreviews] = useState([]);
  const fileRef = useRef();

  function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPendingPhotos(prev => [...prev, ...files]);
    setPendingPhotoPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
  }

  async function saveNote(e) {
    e.preventDefault();
    if (!noteText.trim() && pendingPhotos.length === 0) return;
    setSavingNote(true);
    const uploadedPaths = [];
    for (let i = 0; i < pendingPhotos.length; i++) {
      const file = pendingPhotos[i];
      const ext = file.name.split('.').pop();
      const path = `${solicitud.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error } = await uploadFileWithProgress('Job-photos', path, file, () => {});
      if (!error) uploadedPaths.push(path);
    }
    const { data: newNote } = await supabase.from('solicitud_notes').insert([{
      solicitud_id: solicitud.id,
      note: noteText.trim() || null,
      photo_url: uploadedPaths[0] ?? null,
      photo_urls: uploadedPaths.length > 0 ? uploadedPaths : null,
    }]).select().single();
    if (newNote) {
      const signedUrls = await Promise.all(uploadedPaths.map(async p => {
        const { data } = await supabase.storage.from('Job-photos').createSignedUrl(p, 3600);
        return data?.signedUrl ?? null;
      }));
      setNotesList(prev => [{ ...newNote, photo_urls: signedUrls.filter(Boolean), raw_photo_urls: uploadedPaths }, ...prev]);
    }
    setNoteText(''); setPendingPhotos([]); setPendingPhotoPreviews([]); setSavingNote(false);
  }

  async function deleteNote(noteId) {
    await supabase.from('solicitud_notes').delete().eq('id', noteId);
    setNotesList(prev => prev.filter(n => n.id !== noteId));
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Info general */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Información general</p>
            {!editingDetails && <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setEditingDetails(true)}>Editar</button>}
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>Cliente: <strong style={{ color: 'var(--navy)' }}>{solicitud.clients?.name ?? '—'}</strong></p>
          {editingDetails ? (
            <>
              <div className="form-group">
                <label>Título</label>
                <input value={titleForm} onChange={e => setTitleForm(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <textarea value={descForm} onChange={e => setDescForm(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Vendedor</label>
                <input value={salespersonForm} onChange={e => setSalespersonForm(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Notas internas</label>
                <textarea value={notesForm} onChange={e => setNotesForm(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={savingDetails} onClick={saveDetails}>{savingDetails ? 'Guardando...' : 'Guardar'}</button>
                <button className="btn btn-ghost" onClick={() => setEditingDetails(false)}>Cancelar</button>
              </div>
            </>
          ) : (
            <>
              {solicitud.description && <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginBottom: 10 }}>{solicitud.description}</p>}
              {solicitud.salesperson && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Vendedor: {solicitud.salesperson}</p>}
              {solicitud.notes && <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>Notas: {solicitud.notes}</p>}
            </>
          )}
        </div>

        {/* Imágenes de la solicitud */}
        {intakePhotoUrls.length > 0 && (
          <div className="card">
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>📷 Imágenes</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {intakePhotoUrls.map((url, idx) => (
                <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1.5px solid var(--border)' }} />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Evaluación en sitio */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>📍 Evaluación en sitio</p>
            {!editingAssessment && <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setEditingAssessment(true)}>Editar</button>}
          </div>
          {editingAssessment ? (
            <>
              <div className="form-group">
                <label>Fecha y hora de la visita</label>
                <input type="datetime-local" value={assessmentDate} onChange={e => setAssessmentDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Instrucciones para el técnico</label>
                <textarea value={assessmentInstructions} onChange={e => setAssessmentInstructions(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={savingAssessment} onClick={saveAssessment}>{savingAssessment ? 'Guardando...' : 'Guardar'}</button>
                <button className="btn btn-ghost" onClick={() => setEditingAssessment(false)}>Cancelar</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, marginBottom: 6 }}>
                {solicitud.assessment_date ? new Date(solicitud.assessment_date).toLocaleString('es-PR') : 'Sin programar'}
              </p>
              {solicitud.assessment_instructions && <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>{solicitud.assessment_instructions}</p>}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!solicitud.assessment_completed} onChange={toggleAssessmentComplete} />
                Evaluación completada
              </label>
            </>
          )}
        </div>

        {/* Propiedad */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>🏠 Propiedad</p>
            {!editingProperty && <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setEditingProperty(true)}>Editar</button>}
          </div>
          {editingProperty ? (
            <>
              {clientProperties.length > 0 && (
                <div className="form-group">
                  <label>Seleccionar propiedad del cliente</label>
                  <select value={propertyForm.property_id} onChange={e => {
                    const p = clientProperties.find(p => p.id === e.target.value);
                    if (p) selectProperty(p); else setPropertyForm(f => ({ ...f, property_id: '' }));
                  }}>
                    <option value="">— Seleccionar propiedad —</option>
                    {clientProperties.map(p => <option key={p.id} value={p.id}>{propertyLabel(p)}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Nombre de la propiedad</label>
                <input value={propertyForm.property_name} onChange={e => setPropertyForm(f => ({ ...f, property_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Dirección</label>
                <input value={propertyForm.street} onChange={e => setPropertyForm(f => ({ ...f, street: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 10 }}>
                <div className="form-group"><label>Ciudad</label><input value={propertyForm.city} onChange={e => setPropertyForm(f => ({ ...f, city: e.target.value }))} /></div>
                <div className="form-group"><label>Estado</label><input value={propertyForm.state} onChange={e => setPropertyForm(f => ({ ...f, state: e.target.value }))} /></div>
                <div className="form-group"><label>Zip</label><input value={propertyForm.zip} onChange={e => setPropertyForm(f => ({ ...f, zip: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={savingProperty} onClick={saveProperty}>{savingProperty ? 'Guardando...' : 'Guardar'}</button>
                <button className="btn btn-ghost" onClick={() => setEditingProperty(false)}>Cancelar</button>
              </div>
            </>
          ) : (
            <>
              {solicitud.property_name && <p style={{ fontWeight: 600, fontSize: 14 }}>{solicitud.property_name}</p>}
              {fullAddress ? (
                <a href={mapsLinks.direct || mapsLinks.google} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>📍 {fullAddress}</a>
              ) : <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin dirección</p>}
            </>
          )}
        </div>

        {/* Contacto */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>👤 Contacto encargado</p>
            {!editingContact && <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setEditingContact(true)}>Editar</button>}
          </div>
          {editingContact ? (
            <>
              {clientContacts.length > 0 && (
                <div className="form-group">
                  <label>Seleccionar contacto del cliente</label>
                  <select value={contactForm.contact_id} onChange={e => {
                    const c = clientContacts.find(c => c.id === e.target.value);
                    if (c) selectContact(c); else setContactForm(f => ({ ...f, contact_id: '' }));
                  }}>
                    <option value="">— Seleccionar contacto —</option>
                    {clientContacts.map(c => <option key={c.id} value={c.id}>{contactLabel(c)}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group"><label>Nombre</label><input value={contactForm.contact_name} onChange={e => setContactForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group"><label>Teléfono</label><input value={contactForm.contact_phone} onChange={e => setContactForm(f => ({ ...f, contact_phone: e.target.value }))} /></div>
                <div className="form-group"><label>Email</label><input type="email" value={contactForm.contact_email} onChange={e => setContactForm(f => ({ ...f, contact_email: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={savingContact} onClick={saveContact}>{savingContact ? 'Guardando...' : 'Guardar'}</button>
                <button className="btn btn-ghost" onClick={() => setEditingContact(false)}>Cancelar</button>
              </div>
            </>
          ) : (
            <>
              {solicitud.contact_name && <p style={{ fontWeight: 600, fontSize: 14 }}>{solicitud.contact_name}</p>}
              {solicitud.contact_phone && <a href={`tel:${solicitud.contact_phone}`} style={{ display: 'block', fontSize: 13, color: 'var(--amber)' }}>{solicitud.contact_phone}</a>}
              {solicitud.contact_email && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{solicitud.contact_email}</p>}
              {!solicitud.contact_name && !solicitud.contact_phone && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin contacto</p>}
            </>
          )}
        </div>

        {/* Líneas */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Producto / Servicio</p>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setAddingLine(true)}>+ Agregar línea</button>
          </div>
          {lineItems.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{item.description}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>{item.quantity} × {fmt(item.unit_price)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{fmt(item.quantity * item.unit_price)}</span>
                <button type="button" onClick={() => deleteLineItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
              </div>
            </div>
          ))}
          {addingLine && (
            <div style={{ marginTop: 12 }}>
              <LineItemRow
                type={newLine.type} onTypeChange={v => setNewLine(l => ({ ...l, type: v }))}
                description={newLine.description} onDescriptionChange={v => setNewLine(l => ({ ...l, description: v }))}
                catalogOptions={[]} datalistId="new-line"
                quantity={newLine.quantity} onQuantityChange={v => setNewLine(l => ({ ...l, quantity: v }))}
                msrp={newLine.msrp} onMsrpChange={v => setNewLine(l => ({ ...l, msrp: v }))}
                unitPrice={newLine.unit_price} onUnitPriceChange={v => setNewLine(l => ({ ...l, unit_price: v }))}
                supplierPrice={newLine.supplier_price} onSupplierPriceChange={v => setNewLine(l => ({ ...l, supplier_price: v }))}
                exempt={newLine.exempt} onExemptChange={v => setNewLine(l => ({ ...l, exempt: v }))}
                area={newLine.area} onAreaChange={v => setNewLine(l => ({ ...l, area: v }))} areaOptions={[]}
                vendor={newLine.vendor} onVendorChange={v => setNewLine(l => ({ ...l, vendor: v }))} vendorOptions={[]}
                photoUrl={newLine.photoPreview} onPhotoSelect={handleNewLinePhoto} fmt={fmt}
                actions={<button type="button" onClick={() => setAddingLine(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>}
              />
              <button className="btn btn-primary" style={{ marginTop: 8 }} disabled={savingLine} onClick={addLineItem}>{savingLine ? 'Guardando...' : 'Agregar'}</button>
            </div>
          )}
          {lineItems.length === 0 && !addingLine && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin líneas todavía.</p>}
        </div>

        {/* Notas */}
        <div className="card">
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Notas</p>
          <form onSubmit={saveNote} style={{ marginBottom: 16 }}>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Agregar una nota..." style={{ marginBottom: 8 }} />
            {pendingPhotoPreviews.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                {pendingPhotoPreviews.map((p, i) => <img key={i} src={p} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }} />)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} style={{ fontSize: 12 }}>📷 Adjuntar fotos</button>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
              <button type="submit" className="btn btn-primary" disabled={savingNote} style={{ fontSize: 12 }}>{savingNote ? 'Guardando...' : 'Agregar nota'}</button>
            </div>
          </form>
          {notesList.map(n => (
            <div key={n.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(n.created_at).toLocaleString('es-PR')}</span>
                <button onClick={() => deleteNote(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>Eliminar</button>
              </div>
              {n.note && <p style={{ fontSize: 14, marginTop: 4, whiteSpace: 'pre-wrap' }}>{n.note}</p>}
              {n.photo_urls?.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {n.photo_urls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 6, border: '1.5px solid var(--border)' }} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
          {notesList.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin notas todavía.</p>}
        </div>
      </div>

      {/* Sidebar de acciones */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 12 }}>Estado</p>
          {isOpen ? (
            <select value={solicitud.status} onChange={e => updateStatus(e.target.value)} style={{ marginBottom: 12 }}>
              {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              {solicitud.status === 'convertida' ? 'Esta solicitud ya fue convertida.' : 'Esta solicitud está archivada.'}
            </p>
          )}
          {isOpen && (
            <button className="btn btn-amber" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }} disabled={converting} onClick={convertirATrabajo}>
              {converting ? 'Convirtiendo...' : '✓ Convertir a Trabajo'}
            </button>
          )}
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} disabled={archiving} onClick={toggleArchive}>
            {archiving ? 'Guardando...' : solicitud.status === 'archivada' ? 'Desarchivar' : 'Archivar'}
          </button>
        </div>

        {lineItems.length > 0 && (
          <div className="card">
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Resumen IVU</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
              {[
                { label: 'Subtotal productos', value: subProd },
                { label: 'IVU productos', value: taxProd },
                { label: 'Subtotal labor', value: subLabor },
                { label: 'IVU labor', value: taxLabor },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>{r.label}</span>
                  <span>{fmt(r.value)}</span>
                </div>
              ))}
              <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
                <span>Total</span>
                <span style={{ color: 'var(--navy)' }}>{fmt(total)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
