'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import LineItemRow from '../../LineItemRow';
import LineItemPicker from '../../LineItemPicker';
import TaxBreakdown from '../../TaxBreakdown';
import { calcularIVU } from '../../../lib/tax';
import { buildChecklistItemsFromLineItems } from '../../../lib/generateChecklistFromLineItems';
import { buildMapsLinks } from '../../../lib/mapsLinks';
import { isoToLocalInput, localInputToIso, formatDateTimePR } from '../../../lib/datetimeLocal';

import { uploadJobPhoto } from '../../../lib/uploadJobPhoto';
const statusOptions = [
  { value: 'nueva', key: 'nueva' },
  { value: 'necesita_aprobacion', key: 'necesitaAprobacion' },
  { value: 'evaluacion_completa', key: 'evaluacionCompleta' },
];

export default function SolicitudTabs({ solicitud, items, notes, intakePhotoUrls, clientProperties = [], clientContacts = [], technicians = [], taxRules = [], currentRole = null }) {
  const router = useRouter();
  const t = useTranslations('solicitudes.tabs');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';
  const translatedStatusOptions = useMemo(() => statusOptions.map(o => ({ ...o, label: t(`status.${o.key}`) })), [t]);
  const fmt = n => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const clientType = solicitud.clients?.client_type ?? 'final';
  const isOpen = !['convertida', 'archivada'].includes(solicitud.status);
  // A técnico reaches this page from their Crew App agenda to see/add everything about the
  // visit (notes, photos, line items), but the office-only actions below (convert to job,
  // archive/delete, change status, pricing) stay hidden — those are sales/admin decisions.
  const isTecnico = currentRole === 'tecnico';

  const [converting, setConverting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showDeleteSolicitud, setShowDeleteSolicitud] = useState(false);
  const [deletingSolicitud, setDeletingSolicitud] = useState(false);

  async function convertirATrabajo() {
    if (!confirm(t('confirmConvert', { title: solicitud.title }))) return;
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
        property_name: solicitud.property_name || null,
        street: solicitud.street || null,
        city: solicitud.city || null,
        state: solicitud.state || null,
        zip: solicitud.zip || null,
        technician_id: solicitud.technician_id || null,
      }]).select().single();
      if (jobErr) { alert(jobErr.message); return; }

      const allTechIds = [solicitud.technician_id, ...(solicitud.solicitud_technicians ?? []).map(st => st.technician_id)].filter(Boolean);
      if (allTechIds.length) {
        await supabase.from('job_technicians').insert(allTechIds.map(techId => ({ job_id: job.id, technician_id: techId })));
      }

      if (assignedContacts.length) {
        await supabase.from('job_contacts').insert(assignedContacts.map(c => ({
          job_id: job.id, contact_id: c.contact_id || null, name: c.name, phone: c.phone, email: c.email, cargo: c.cargo,
        })));
      }

      if (items.length) {
        const { data: insertedItems } = await supabase.from('job_line_items').insert(items.map(i => ({
          job_id: job.id, type: i.type, title: i.title, tax_category: i.tax_category, description: i.description, note: i.note,
          quantity: i.quantity, unit_price: i.unit_price, msrp: i.msrp,
          supplier_price: i.supplier_price, exempt_reason: i.exempt_reason,
          area: i.area, vendor: i.vendor, photo_url: i.photo_url, sort_order: i.sort_order,
        }))).select();

        const checklistItems = buildChecklistItemsFromLineItems(insertedItems, job.id);
        if (checklistItems.length) {
          const { error: checklistErr } = await supabase.from('job_checklist_items').insert(checklistItems);
          if (checklistErr) console.error('Error generando checklist automático:', checklistErr);
        }
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

  async function deleteSolicitud() {
    setDeletingSolicitud(true);
    await supabase.from('solicitud_technicians').delete().eq('solicitud_id', solicitud.id);
    await supabase.from('solicitud_line_items').delete().eq('solicitud_id', solicitud.id);
    await supabase.from('solicitud_notes').delete().eq('solicitud_id', solicitud.id);
    const { error } = await supabase.from('solicitudes').delete().eq('id', solicitud.id);
    if (error) {
      setDeletingSolicitud(false);
      alert(t('deleteError', { error: error.message }));
      return;
    }
    // Full reload (not router.push) so the list doesn't serve a stale
    // cached render of the just-deleted solicitud.
    window.location.href = '/solicitudes';
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
  const [technicianIds, setTechnicianIds] = useState(() =>
    [solicitud.technician_id, ...(solicitud.solicitud_technicians ?? []).map(st => st.technician_id)].filter(Boolean)
  );
  const [savingAssessment, setSavingAssessment] = useState(false);

  function toggleTechnician(techId) {
    setTechnicianIds(ids => ids.includes(techId) ? ids.filter(id => id !== techId) : [...ids, techId]);
  }

  async function saveAssessment() {
    setSavingAssessment(true);
    await supabase.from('solicitudes').update({
      assessment_date: assessmentDate ? localInputToIso(assessmentDate) : null,
      assessment_instructions: assessmentInstructions.trim() || null,
      technician_id: technicianIds[0] ?? null,
    }).eq('id', solicitud.id);
    await supabase.from('solicitud_technicians').delete().eq('solicitud_id', solicitud.id);
    if (technicianIds.length > 1) {
      await supabase.from('solicitud_technicians').insert(
        technicianIds.slice(1).map(techId => ({ solicitud_id: solicitud.id, technician_id: techId }))
      );
    }
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
  const [showNewProperty, setShowNewProperty] = useState(false);
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
    setShowNewProperty(false);
    router.refresh();
  }

  const fullAddress = [solicitud.street, solicitud.city, solicitud.state, solicitud.zip].filter(Boolean).join(', ');
  const mapsLinks = buildMapsLinks(solicitud.street, solicitud.city, solicitud.state, solicitud.zip);

  // --- Contacto ---
  const [assignedContacts, setAssignedContacts] = useState(solicitud.solicitud_contacts ?? []);
  const [contactDraft, setContactDraft] = useState({ contact_id: '', name: '', phone: '', email: '', cargo: '' });
  const [editingContactId, setEditingContactId] = useState(null);
  const [savingContact, setSavingContact] = useState(false);

  function contactLabel(c) { return `${c.name}${c.phone ? ' — ' + c.phone : ''}`; }
  function pickExistingContact(contactId) {
    const c = clientContacts.find(c => c.id === contactId);
    if (c) setContactDraft(d => ({ ...d, contact_id: c.id, name: c.name ?? '', phone: c.phone ?? '', email: c.email ?? '' }));
    else setContactDraft(d => ({ ...d, contact_id: '' }));
  }
  async function addContact() {
    if (!contactDraft.name.trim()) return;
    setSavingContact(true);
    if (editingContactId) {
      const payload = {
        contact_id: contactDraft.contact_id || null,
        name: contactDraft.name.trim(),
        phone: contactDraft.phone.trim() || null,
        email: contactDraft.email.trim() || null,
        cargo: contactDraft.cargo.trim() || null,
      };
      await supabase.from('solicitud_contacts').update(payload).eq('id', editingContactId);
      setAssignedContacts(prev => prev.map(c => c.id === editingContactId ? { ...c, ...payload } : c));
      setEditingContactId(null);
    } else {
      const { data } = await supabase.from('solicitud_contacts').insert([{
        solicitud_id: solicitud.id,
        contact_id: contactDraft.contact_id || null,
        name: contactDraft.name.trim(),
        phone: contactDraft.phone.trim() || null,
        email: contactDraft.email.trim() || null,
        cargo: contactDraft.cargo.trim() || null,
      }]).select().single();
      if (data) setAssignedContacts(prev => [...prev, data]);
    }
    setContactDraft({ contact_id: '', name: '', phone: '', email: '', cargo: '' });
    setSavingContact(false);
  }
  function editContact(rowId) {
    const c = assignedContacts.find(c => c.id === rowId);
    if (!c) return;
    setContactDraft({ contact_id: c.contact_id ?? '', name: c.name ?? '', phone: c.phone ?? '', email: c.email ?? '', cargo: c.cargo ?? '' });
    setEditingContactId(rowId);
  }
  function cancelEditContact() {
    setEditingContactId(null);
    setContactDraft({ contact_id: '', name: '', phone: '', email: '', cargo: '' });
  }
  async function removeContact(rowId) {
    if (editingContactId === rowId) cancelEditContact();
    await supabase.from('solicitud_contacts').delete().eq('id', rowId);
    setAssignedContacts(prev => prev.filter(c => c.id !== rowId));
  }

  // --- Líneas ---
  const [lineItems, setLineItems] = useState(items);
  const [addingLine, setAddingLine] = useState(false);
  const [newLine, setNewLine] = useState({ type: 'labor', tax_category: 'labor', description: '', note: '', quantity: 1, unit_price: '', msrp: '', supplier_price: '', exempt: false, area: '', vendor: '', photoFile: null, photoPreview: null });
  const [savingLine, setSavingLine] = useState(false);
  const [catalogItems, setCatalogItems] = useState([]);

  useEffect(() => {
    supabase.from('catalog_items').select('*').order('item_code').then(({ data }) => setCatalogItems(data ?? []));
  }, []);

  // Alta directa desde el catálogo (LineItemPicker) — se guarda de una vez,
  // igual que addLineItem, en vez de pasar por el formulario "+ Agregar línea".
  async function addLineItemFromCatalog(catalogItem) {
    setSavingLine(true);
    let photoPath = null, photoSignedUrl = null;
    if (catalogItem.photo_url) {
      const { data: signed } = await supabase.storage.from('Job-photos').createSignedUrl(catalogItem.photo_url, 3600);
      photoPath = catalogItem.photo_url;
      photoSignedUrl = signed?.signedUrl ?? null;
    }
    const { data } = await supabase.from('solicitud_line_items').insert([{
      solicitud_id: solicitud.id, type: catalogItem.type, tax_category: catalogItem.tax_category,
      description: catalogItem.description, quantity: 1, unit_price: catalogItem.price ?? 0,
      msrp: catalogItem.msrp ?? null, supplier_price: catalogItem.supplier_price ?? null,
      exempt_reason: null, area: null, vendor: catalogItem.vendor || null,
      photo_url: photoPath, sort_order: lineItems.length,
    }]).select().single();
    if (data) setLineItems(prev => [...prev, { ...data, photo_signed_url: photoSignedUrl }]);
    setSavingLine(false);
  }

  function handleNewLinePhoto(file) {
    if (!file) return;
    setNewLine(l => ({ ...l, photoFile: file, photoPreview: URL.createObjectURL(file) }));
  }
  function setNewLineType(type) {
    setNewLine(l => ({ ...l, type, tax_category: type === 'fee' ? (l.tax_category || 'labor') : type }));
  }

  async function addLineItem() {
    if (!newLine.description.trim()) return;
    setSavingLine(true);
    let photoPath = null;
    if (newLine.photoFile) {
      const ext = newLine.photoFile.name.split('.').pop();
      const path = `${solicitud.id}/${Date.now()}.${ext}`;
      const { path: finalPath, error: upErr } = await uploadJobPhoto(path, newLine.photoFile);
      if (!upErr) photoPath = finalPath;
    }
    const { data } = await supabase.from('solicitud_line_items').insert([{
      solicitud_id: solicitud.id, type: newLine.type, tax_category: newLine.tax_category || newLine.type, description: newLine.description.trim(),
      note: newLine.note?.trim() || null,
      quantity: parseFloat(newLine.quantity) || 1, unit_price: parseFloat(newLine.unit_price) || 0,
      msrp: newLine.msrp !== '' ? parseFloat(newLine.msrp) : null,
      supplier_price: newLine.supplier_price !== '' ? parseFloat(newLine.supplier_price) : null,
      exempt_reason: newLine.exempt ? 'Exento' : null,
      area: newLine.area || null, vendor: newLine.vendor || null,
      photo_url: photoPath, sort_order: lineItems.length,
    }]).select().single();
    if (data) setLineItems(prev => [...prev, { ...data, photo_signed_url: newLine.photoPreview }]);
    setNewLine({ type: 'labor', tax_category: 'labor', description: '', note: '', quantity: 1, unit_price: '', msrp: '', supplier_price: '', exempt: false, area: '', vendor: '', photoFile: null, photoPreview: null });
    setAddingLine(false);
    setSavingLine(false);
  }

  async function deleteLineItem(itemId) {
    await supabase.from('solicitud_line_items').delete().eq('id', itemId);
    setLineItems(prev => prev.filter(i => i.id !== itemId));
  }


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
      const { path: finalPath, error } = await uploadJobPhoto(path, file);
      if (!error) uploadedPaths.push(finalPath);
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
    <div className="solicitud-detail-grid" style={{ alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Info general */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{t('generalInfo.title')}</p>
            {!editingDetails && <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setEditingDetails(true)}>{t('common.edit')}</button>}
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>{t('generalInfo.clientLabel')} <strong style={{ color: 'var(--navy)' }}>{solicitud.clients?.name ?? '—'}</strong></p>
          {editingDetails ? (
            <>
              <div className="form-group">
                <label>{t('generalInfo.titleLabel')}</label>
                <input value={titleForm} onChange={e => setTitleForm(e.target.value)} />
              </div>
              <div className="form-group">
                <label>{t('generalInfo.descriptionLabel')}</label>
                <textarea value={descForm} onChange={e => setDescForm(e.target.value)} />
              </div>
              <div className="form-group">
                <label>{t('generalInfo.salespersonLabel')}</label>
                <input value={salespersonForm} onChange={e => setSalespersonForm(e.target.value)} />
              </div>
              <div className="form-group">
                <label>{t('generalInfo.notesLabel')}</label>
                <textarea value={notesForm} onChange={e => setNotesForm(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={savingDetails} onClick={saveDetails}>{savingDetails ? t('common.saving') : t('common.save')}</button>
                <button className="btn btn-ghost" onClick={() => setEditingDetails(false)}>{t('common.cancel')}</button>
              </div>
            </>
          ) : (
            <>
              {solicitud.description && <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginBottom: 10 }}>{solicitud.description}</p>}
              {solicitud.salesperson && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('generalInfo.salespersonPrefix', { name: solicitud.salesperson })}</p>}
              {solicitud.notes && <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>{t('generalInfo.notesPrefix', { notes: solicitud.notes })}</p>}
            </>
          )}
        </div>

        {/* Imágenes de la solicitud */}
        {intakePhotoUrls.length > 0 && (
          <div className="card">
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>{t('images.title')}</p>
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
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{t('assessment.title')}</p>
            {!editingAssessment && <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setEditingAssessment(true)}>{t('common.edit')}</button>}
          </div>
          {editingAssessment ? (
            <>
              <div className="form-group">
                <label>{t('assessment.dateLabel')}</label>
                <input type="datetime-local" value={assessmentDate} onChange={e => setAssessmentDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>{t('assessment.instructionsLabel')}</label>
                <textarea value={assessmentInstructions} onChange={e => setAssessmentInstructions(e.target.value)} />
              </div>
              <div className="form-group">
                <label>{t('assessment.techniciansLabel')}</label>
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
                  {technicians.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 12 }}>{t('assessment.noTechnicians')}</p>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={savingAssessment} onClick={saveAssessment}>{savingAssessment ? t('common.saving') : t('common.save')}</button>
                <button className="btn btn-ghost" onClick={() => setEditingAssessment(false)}>{t('common.cancel')}</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, marginBottom: 6 }}>
                {solicitud.assessment_date ? formatDateTimePR(solicitud.assessment_date, {}, dateLocale) : t('assessment.notScheduled')}
              </p>
              {solicitud.assessment_instructions && <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>{solicitud.assessment_instructions}</p>}
              {(() => {
                const names = [solicitud.technicians?.name, ...(solicitud.solicitud_technicians ?? []).map(st => st.technicians?.name)].filter(Boolean);
                return (
                  <p style={{ fontSize: 13, color: names.length ? 'var(--navy)' : 'var(--muted)', marginBottom: 10 }}>
                    {names.length ? t('assessment.assignedTechnicians', { names: names.join(', ') }) : t('assessment.noTechnicianAssigned')}
                  </p>
                );
              })()}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!solicitud.assessment_completed} onChange={toggleAssessmentComplete} />
                {t('assessment.completedLabel')}
              </label>
            </>
          )}
        </div>

        {/* Propiedad */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{t('property.title')}</p>
            {!editingProperty && <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setEditingProperty(true)}>{t('common.edit')}</button>}
          </div>
          {editingProperty ? (
            <>
              {clientProperties.length > 0 && !showNewProperty && (
                <div className="form-group">
                  <label>{t('property.clientPropertyLabel')}</label>
                  {propertyForm.property_id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
                      <span style={{ flex: 1, fontWeight: 600 }}>{propertyLabel(clientProperties.find(p => p.id === propertyForm.property_id) ?? { name: propertyForm.property_name })}</span>
                      <button type="button" onClick={() => setPropertyForm(f => ({ ...f, property_id: '' }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, fontWeight: 700 }}>{t('common.change')}</button>
                    </div>
                  ) : (
                    <>
                      <select value={propertyForm.property_id} onChange={e => {
                        const p = clientProperties.find(p => p.id === e.target.value);
                        if (p) selectProperty(p); else setPropertyForm(f => ({ ...f, property_id: '' }));
                      }}>
                        <option value="">{t('property.selectPlaceholder')}</option>
                        {clientProperties.map(p => <option key={p.id} value={p.id}>{propertyLabel(p)}</option>)}
                      </select>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px', marginTop: 8 }} onClick={() => setShowNewProperty(true)}>{t('property.addNew')}</button>
                    </>
                  )}
                </div>
              )}
              {(clientProperties.length === 0 || showNewProperty || propertyForm.property_id) && (
                <>
                  {clientProperties.length > 0 && showNewProperty && (
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px', marginBottom: 12 }} onClick={() => setShowNewProperty(false)}>{t('property.useExisting')}</button>
                  )}
                  <div className="form-group">
                    <label>{t('property.nameLabel')}</label>
                    <input value={propertyForm.property_name} onChange={e => setPropertyForm(f => ({ ...f, property_name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>{t('property.addressLabel')}</label>
                    <input value={propertyForm.street} onChange={e => setPropertyForm(f => ({ ...f, street: e.target.value }))} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 10 }}>
                    <div className="form-group"><label>{t('property.cityLabel')}</label><input value={propertyForm.city} onChange={e => setPropertyForm(f => ({ ...f, city: e.target.value }))} /></div>
                    <div className="form-group"><label>{t('property.stateLabel')}</label><input value={propertyForm.state} onChange={e => setPropertyForm(f => ({ ...f, state: e.target.value }))} /></div>
                    <div className="form-group"><label>{t('property.zipLabel')}</label><input value={propertyForm.zip} onChange={e => setPropertyForm(f => ({ ...f, zip: e.target.value }))} /></div>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={savingProperty} onClick={saveProperty}>{savingProperty ? t('common.saving') : t('common.save')}</button>
                <button className="btn btn-ghost" onClick={() => { setEditingProperty(false); setShowNewProperty(false); }}>{t('common.cancel')}</button>
              </div>
            </>
          ) : (
            <>
              {solicitud.property_name && <p style={{ fontWeight: 600, fontSize: 14 }}>{solicitud.property_name}</p>}
              {fullAddress ? (
                <a href={mapsLinks.direct || mapsLinks.google} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>📍 {fullAddress}</a>
              ) : <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('property.noAddress')}</p>}
            </>
          )}
        </div>

        {/* Contacto */}
        <div className="card">
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>{t('contacts.title')}</p>
          {assignedContacts.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>{t('contacts.none')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {assignedContacts.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: c.id === editingContactId ? 'var(--amber-tint)' : 'var(--surface-2)', borderRadius: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                    {c.cargo && <span style={{ fontSize: 13, color: 'var(--muted)' }}> — {c.cargo}</span>}
                    {(c.phone || c.email) && (
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button onClick={() => editContact(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>{t('contacts.editButton')}</button>
                    <button onClick={() => removeContact(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warn)', fontSize: 14 }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {editingContactId && (
            <p style={{ fontSize: 12.5, color: 'var(--amber)', fontWeight: 600, marginBottom: 10 }}>{t('contacts.editingHint')}</p>
          )}
          {clientContacts.length > 0 && (
            <div className="form-group">
              <label>{t('contacts.selectExistingLabel')}</label>
              <select value={contactDraft.contact_id} onChange={e => pickExistingContact(e.target.value)}>
                <option value="">{t('contacts.selectPlaceholder')}</option>
                {clientContacts.map(c => <option key={c.id} value={c.id}>{contactLabel(c)}</option>)}
              </select>
            </div>
          )}
          <div className="form-group"><label>{t('common.name')}</label><input value={contactDraft.name} onChange={e => setContactDraft(d => ({ ...d, name: e.target.value }))} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group"><label>{t('common.phone')}</label><input value={contactDraft.phone} onChange={e => setContactDraft(d => ({ ...d, phone: e.target.value }))} /></div>
            <div className="form-group"><label>{t('common.email')}</label><input type="email" value={contactDraft.email} onChange={e => setContactDraft(d => ({ ...d, email: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label>{t('contacts.positionLabel')}</label><input value={contactDraft.cargo} onChange={e => setContactDraft(d => ({ ...d, cargo: e.target.value }))} placeholder={t('contacts.positionPlaceholder')} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={!contactDraft.name.trim() || savingContact} onClick={addContact}>
              {savingContact ? t('common.saving') : editingContactId ? t('contacts.saveChanges') : t('contacts.addContact')}
            </button>
            {editingContactId && <button className="btn btn-ghost" onClick={cancelEditContact}>{t('common.cancel')}</button>}
          </div>
        </div>

        {/* Líneas */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{t('lineItems.title')}</p>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setAddingLine(true)}>{t('lineItems.addLine')}</button>
          </div>
          {!isTecnico && (
            <div style={{ marginBottom: 16 }}>
              <LineItemPicker catalogOptions={catalogItems} onSelect={addLineItemFromCatalog} placeholder={t('lineItems.catalogSearchPlaceholder')} />
            </div>
          )}
          {lineItems.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{item.description}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
                  {isTecnico ? `${item.quantity}${item.area ? ` — ${item.area}` : ''}` : `${item.quantity} × ${fmt(item.unit_price)}`}
                </span>
                {item.note?.trim() && <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', whiteSpace: 'pre-wrap', marginTop: 3 }}>{item.note}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {!isTecnico && <span style={{ fontWeight: 700, fontSize: 13.5 }}>{fmt(item.quantity * item.unit_price)}</span>}
                <button type="button" onClick={() => deleteLineItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
              </div>
            </div>
          ))}
          {addingLine && (
            <div style={{ marginTop: 12, overflowX: 'auto' }}>
              <LineItemRow
                type={newLine.type} onTypeChange={setNewLineType}
                description={newLine.description} onDescriptionChange={v => setNewLine(l => ({ ...l, description: v }))}
                note={newLine.note} onNoteChange={v => setNewLine(l => ({ ...l, note: v }))}
                catalogOptions={catalogItems} datalistId="new-line"
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
              <button className="btn btn-primary" style={{ marginTop: 8 }} disabled={savingLine} onClick={addLineItem}>{savingLine ? t('common.saving') : t('lineItems.addButton')}</button>
            </div>
          )}
          {lineItems.length === 0 && !addingLine && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('lineItems.none')}</p>}
        </div>

        {/* Notas */}
        <div className="card">
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>{t('notes.title')}</p>
          <form onSubmit={saveNote} style={{ marginBottom: 16 }}>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder={t('notes.placeholder')} style={{ marginBottom: 8 }} />
            {pendingPhotoPreviews.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                {pendingPhotoPreviews.map((p, i) => <img key={i} src={p} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }} />)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} style={{ fontSize: 12 }}>{t('notes.attachPhotos')}</button>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
              <button type="submit" className="btn btn-primary" disabled={savingNote} style={{ fontSize: 12 }}>{savingNote ? t('common.saving') : t('notes.addNote')}</button>
            </div>
          </form>
          {notesList.map(n => (
            <div key={n.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{formatDateTimePR(n.created_at, {}, dateLocale)}</span>
                <button onClick={() => deleteNote(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>{t('common.delete')}</button>
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
          {notesList.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('notes.none')}</p>}
        </div>
      </div>

      {/* Sidebar de acciones */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 12 }}>{t('status.title')}</p>
          {isTecnico ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              {t('status.tecnicoNotice', {
                status: translatedStatusOptions.find(o => o.value === solicitud.status)?.label
                  ?? (solicitud.status === 'convertida' ? t('status.convertida') : solicitud.status === 'archivada' ? t('status.archivada') : solicitud.status),
              })}
            </p>
          ) : (
            <>
              {isOpen ? (
                <select value={solicitud.status} onChange={e => updateStatus(e.target.value)} style={{ marginBottom: 12 }}>
                  {translatedStatusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                  {solicitud.status === 'convertida' ? t('status.alreadyConverted') : t('status.archivedNotice')}
                </p>
              )}
              {isOpen && (
                <button className="btn btn-amber" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }} disabled={converting} onClick={convertirATrabajo}>
                  {converting ? t('status.converting') : t('status.convertToJob')}
                </button>
              )}
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} disabled={archiving} onClick={toggleArchive}>
                {archiving ? t('common.saving') : solicitud.status === 'archivada' ? t('status.unarchive') : t('status.archive')}
              </button>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8, color: 'var(--warn)', borderColor: 'var(--warn)' }} onClick={() => setShowDeleteSolicitud(true)}>
                {t('status.deleteButton')}
              </button>

              {showDeleteSolicitud && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                  <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>{t('deleteModal.title')}</h2>
                    <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>{t('deleteModal.body')}</p>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button className="btn btn-ghost" onClick={deleteSolicitud} disabled={deletingSolicitud}
                        style={{ flex: 1, justifyContent: 'center', background: 'var(--danger-tint)', color: 'var(--warn)', border: 'none' }}>
                        {deletingSolicitud ? t('deleteModal.deleting') : t('deleteModal.confirm')}
                      </button>
                      <button className="btn btn-ghost" onClick={() => setShowDeleteSolicitud(false)} style={{ flex: 1, justifyContent: 'center' }}>{t('common.cancel')}</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!isTecnico && lineItems.length > 0 && (
          <div className="card">
            <TaxBreakdown lineas={lineItems} clientType={clientType} taxRules={taxRules} title={t('taxSummaryTitle')} />
          </div>
        )}
      </div>
    </div>
  );
}
