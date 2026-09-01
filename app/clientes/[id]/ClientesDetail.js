'use client';
import { useState, useRef, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { buildMapsLinks, pickMapsLink } from '../../../lib/mapsLinks';
import { formatDateTimePR, formatDatePR } from '../../../lib/datetimeLocal';
import { uploadJobPhoto } from '../../../lib/uploadJobPhoto';
import { sumBillableLineItems } from '../../../lib/proposalLineItemTotal';
import SearchBox from '../../SearchBox';

const statusJobDefs = {
  estimate: { cls: 'badge-gray', key: 'estimate' },
  scheduled: { cls: 'badge-blue', key: 'scheduled' },
  in_progress: { cls: 'badge-amber', key: 'in_progress' },
  completed: { cls: 'badge-green', key: 'completed' },
  cancelled: { cls: 'badge-red', key: 'cancelled' }
};
const statusInvDefs = {
  draft: { cls: 'badge-gray', key: 'draft' },
  sent: { cls: 'badge-blue', key: 'sent' },
  paid: { cls: 'badge-green', key: 'paid' },
  overdue: { cls: 'badge-red', key: 'overdue' }
};
const statusPropDefs = {
  borrador: { cls: 'badge-gray', key: 'borrador' },
  enviada: { cls: 'badge-blue', key: 'enviada' },
  vista: { cls: 'badge-amber', key: 'vista' },
  aprobada: { cls: 'badge-green', key: 'aprobada' },
  rechazada: { cls: 'badge-red', key: 'rechazada' }
};
const statusTicketDefs = {
  abierto: { cls: 'badge-red', key: 'abierto' },
  en_progreso: { cls: 'badge-blue', key: 'en_progreso' },
  cerrado: { cls: 'badge-gray', key: 'cerrado' },
};
const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function jobLocation(j) {
  return [j.property_name, j.city].filter(Boolean).join(' — ');
}

function cleanPhones(list) {
  return (list ?? []).filter(p => p.number?.trim()).map(p => ({ label: p.label?.trim() ?? '', number: p.number.trim() }));
}

function PhoneListEditor({ phones, onChange }) {
  const t = useTranslations('clientes.detail');
  const list = phones ?? [];
  return (
    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
      <label>{t('phones.additionalLabel')}</label>
      {list.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input value={p.label} onChange={e => onChange(list.map((row, j) => j === i ? { ...row, label: e.target.value } : row))}
            placeholder={t('phones.labelPlaceholder')} style={{ flex: '0 0 140px' }} />
          <input value={p.number} onChange={e => onChange(list.map((row, j) => j === i ? { ...row, number: e.target.value } : row))}
            placeholder={t('phones.numberPlaceholder')} style={{ flex: 1 }} />
          <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>🗑</button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}
        onClick={() => onChange([...list, { label: '', number: '' }])}>
        {t('phones.addPhone')}
      </button>
    </div>
  );
}

function PhonePills({ phone, extraPhones }) {
  const all = [
    ...(phone ? [{ label: '', number: phone }] : []),
    ...(extraPhones ?? []),
  ];
  if (all.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {all.map((p, i) => (
        <a key={i} href={`tel:${p.number}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#1a7a4a', color: '#fff', borderRadius: 7, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
          📞 {p.label ? `${p.label}: ` : ''}{p.number}
        </a>
      ))}
    </div>
  );
}

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

export default function ClientesDetail({ client, jobs, invoices, payments = [], retenciones = [], scheduleDays = [], calendarEvents = [], tasks = [], properties: initProps, contacts: initContacts, propertyContacts: initPropertyContacts = [], proposals, internalNotes: initInternalNotes, serviceTickets = [], currentRole, invoiceReconciliation }) {
  const canDeleteClient = currentRole === 'admin' || currentRole === 'secretaria';
  const router = useRouter();
  const t = useTranslations('clientes.detail');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';
  const statusJob = useMemo(() => Object.fromEntries(
    Object.entries(statusJobDefs).map(([k, v]) => [k, { ...v, label: t(`jobStatus.${v.key}`) }])
  ), [t]);
  const statusInv = useMemo(() => Object.fromEntries(
    Object.entries(statusInvDefs).map(([k, v]) => [k, { ...v, label: t(`invoiceStatus.${v.key}`) }])
  ), [t]);
  const statusProp = useMemo(() => Object.fromEntries(
    Object.entries(statusPropDefs).map(([k, v]) => [k, { ...v, label: t(`proposalStatus.${v.key}`) }])
  ), [t]);
  const statusTicket = useMemo(() => Object.fromEntries(
    Object.entries(statusTicketDefs).map(([k, v]) => [k, { ...v, label: t(`ticketStatus.${v.key}`) }])
  ), [t]);
  const [tab, setTab] = useState('info');
  const [properties, setProperties] = useState(initProps);
  const [contacts, setContacts] = useState(initContacts);
  const [propertyContacts, setPropertyContacts] = useState(initPropertyContacts);
  const [addingContactToProp, setAddingContactToProp] = useState(null);
  const [pickedExistingContactId, setPickedExistingContactId] = useState('');
  const [linkingContact, setLinkingContact] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [propertySearch, setPropertySearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [jobSearch, setJobSearch] = useState('');
  const [billingSearch, setBillingSearch] = useState('');
  const [proposalSearch, setProposalSearch] = useState('');
  const visibleJobs = useMemo(() => {
    const query = jobSearch.trim().toLowerCase();
    return query
      ? jobs.filter(j =>
          j.job_number?.toLowerCase().includes(query) ||
          j.title?.toLowerCase().includes(query) ||
          (statusJob[j.status]?.label ?? '').toLowerCase().includes(query)
        )
      : jobs;
  }, [jobs, jobSearch, statusJob]);
  const sortedProperties = useMemo(() => [...properties].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es')), [properties]);
  const sortedContacts = useMemo(() => [...contacts].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es')), [contacts]);
  const visibleProperties = useMemo(() => {
    const query = propertySearch.trim().toLowerCase();
    return query
      ? sortedProperties.filter(p =>
          p.name?.toLowerCase().includes(query) ||
          p.street?.toLowerCase().includes(query) ||
          p.city?.toLowerCase().includes(query) ||
          p.note?.toLowerCase().includes(query)
        )
      : sortedProperties;
  }, [sortedProperties, propertySearch]);
  const visibleContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    return query
      ? sortedContacts.filter(c =>
          c.name?.toLowerCase().includes(query) ||
          c.phone?.toLowerCase().includes(query) ||
          c.email?.toLowerCase().includes(query)
        )
      : sortedContacts;
  }, [sortedContacts, contactSearch]);

  // Info tab edit
  const [editingInfo, setEditingInfo] = useState(false);
  const [editInfoData, setEditInfoData] = useState({});
  const [editKind, setEditKind] = useState('individual'); // 'individual' | 'empresa'
  const [savingInfo, setSavingInfo] = useState(false);

  // Property form
  const [showPropForm, setShowPropForm] = useState(false);
  const [prop, setProp] = useState({ name: '', street: '', city: '', state: 'PR', zip: '', note: '' });
  const [savingProp, setSavingProp] = useState(false);

  // Contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [contact, setContact] = useState({ name: '', phone: '', extra_phones: [], email: '', property_id: '' });
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
    const payload = { ...editContactData, extra_phones: cleanPhones(editContactData.extra_phones) };
    await supabase.from('client_contacts').update(payload).eq('id', contactId);
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, ...payload } : c));
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
      extra_phones: client.extra_phones ?? [],
      client_type: client.client_type ?? 'final',
      notes: client.notes ?? '',
      report_name_source: client.report_name_source ?? 'client',
    });
    setEditKind(client.company && client.company === client.name ? 'empresa' : 'individual');
    setEditingInfo(true);
  }

  async function saveInfo(e) {
    e.preventDefault();
    if (editKind === 'empresa' && !editInfoData.company.trim()) return;
    setSavingInfo(true);
    const base = { ...editInfoData, extra_phones: cleanPhones(editInfoData.extra_phones) };
    const payload = editKind === 'empresa'
      ? { ...base, name: base.company.trim(), report_name_source: 'company' }
      : base;
    await supabase.from('clients').update(payload).eq('id', client.id);
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
      setProp({ name: '', street: '', city: '', state: 'PR', zip: '', note: '' });
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

  function contactsForProperty(propId) {
    const linkedIds = new Set(propertyContacts.filter(pc => pc.property_id === propId).map(pc => pc.contact_id));
    return sortedContacts.filter(c => c.property_id === propId || linkedIds.has(c.id));
  }

  async function linkExistingContact(propId) {
    if (!pickedExistingContactId) return;
    setLinkingContact(true);
    const { data } = await supabase.from('client_property_contacts').insert([{
      property_id: propId,
      contact_id: pickedExistingContactId,
    }]).select().single();
    if (data) setPropertyContacts(prev => [...prev, data]);
    setPickedExistingContactId('');
    setAddingContactToProp(null);
    setLinkingContact(false);
  }

  async function unlinkContact(linkId) {
    await supabase.from('client_property_contacts').delete().eq('id', linkId);
    setPropertyContacts(prev => prev.filter(pc => pc.id !== linkId));
  }

  async function saveContact(e) {
    e.preventDefault();
    setSavingContact(true);
    const { data } = await supabase.from('client_contacts').insert([{
      client_id: client.id,
      ...contact,
      extra_phones: cleanPhones(contact.extra_phones),
      property_id: contact.property_id || null,
      is_primary: contacts.length === 0,
    }]).select().single();
    if (data) setContacts(prev => [...prev, data]);
    setContact({ name: '', phone: '', extra_phones: [], email: '', property_id: '' });
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
  const [pendingNotePhotos, setPendingNotePhotos] = useState([]);
  const [pendingNotePhotoPreviews, setPendingNotePhotoPreviews] = useState([]);
  const [uploadingNotePhoto, setUploadingNotePhoto] = useState(false);
  const [noteUploadProgress, setNoteUploadProgress] = useState({});
  const [noteLightbox, setNoteLightbox] = useState(null); // { urls, index }
  const noteFileRef = useRef(null);

  const sortedInternalNotes = [...internalNotes].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));

  function handleNotePhotoSelect(e) {
    const files = Array.from(e.target.files || []).filter(f => !f.type.startsWith('video/'));
    if (!files.length) return;
    setPendingNotePhotos(prev => [...prev, ...files]);
    setPendingNotePhotoPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
  }

  async function addInternalNote(e) {
    e.preventDefault();
    if (!newInternalNote.trim() && pendingNotePhotos.length === 0) return;
    setSavingInternalNote(true);

    const uploadedPaths = [];
    if (pendingNotePhotos.length > 0) {
      setUploadingNotePhoto(true);
      for (let i = 0; i < pendingNotePhotos.length; i++) {
        const file = pendingNotePhotos[i];
        const ext = file.name.split('.').pop();
        const path = `client-notes/${client.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { path: finalPath, error } = await uploadJobPhoto(path, file, {
          onProgress: pct => setNoteUploadProgress(prev => ({ ...prev, [i]: pct })),
        });
        if (!error) uploadedPaths.push(finalPath);
      }
      setUploadingNotePhoto(false);
    }

    const { data } = await supabase.from('client_notes').insert([{
      client_id: client.id,
      note: newInternalNote.trim() || null,
      photo_url: uploadedPaths[0] ?? null,
      photo_urls: uploadedPaths.length > 0 ? uploadedPaths : null,
    }]).select().single();

    if (data) {
      const signedUrls = await Promise.all(uploadedPaths.map(async p => {
        const { data: signed } = await supabase.storage.from('Job-photos').createSignedUrl(p, 3600);
        return signed?.signedUrl ?? null;
      }));
      setInternalNotes(prev => [{
        ...data,
        photo_urls: uploadedPaths.length > 0 ? signedUrls : null,
        photo_url: signedUrls[0] ?? null,
      }, ...prev]);
    }
    setNewInternalNote('');
    setPendingNotePhotos([]);
    setPendingNotePhotoPreviews([]);
    setNoteUploadProgress({});
    setSavingInternalNote(false);
  }

  async function deleteInternalNote(noteId) {
    await supabase.from('client_notes').delete().eq('id', noteId);
    setInternalNotes(prev => prev.filter(n => n.id !== noteId));
  }

  async function saveInternalNoteEdit(noteId) {
    const text = editingInternalNoteText.trim() || null;
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
      <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: 4, borderBottom: '1.5px solid var(--border)', marginBottom: 20, background: 'var(--surface)', borderRadius: 12, padding: '4px 8px' }}>
        <button style={tabStyle('info')} onClick={() => setTab('info')}>{t('tabs.info')}</button>
        <button style={tabStyle('properties')} onClick={() => setTab('properties')}>
          {t('tabs.properties')}
          {properties.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{properties.length}</span>}
        </button>
        <button style={tabStyle('contacts')} onClick={() => setTab('contacts')}>
          {t('tabs.contacts')}
          {contacts.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{contacts.length}</span>}
        </button>
        <button style={tabStyle('schedule')} onClick={() => setTab('schedule')}>{t('tabs.schedule')}</button>
        <button style={tabStyle('jobs')} onClick={() => setTab('jobs')}>
          {t('tabs.jobs')}
          {jobs.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{jobs.length}</span>}
        </button>
        <button style={tabStyle('invoices')} onClick={() => setTab('invoices')}>
          {t('tabs.invoices')}
          {invoices.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{invoices.length}</span>}
        </button>
        <button style={tabStyle('billing')} onClick={() => setTab('billing')}>{t('tabs.billing')}</button>
        <button style={tabStyle('proposals')} onClick={() => setTab('proposals')}>
          {t('tabs.proposals')}
          {proposals.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{proposals.length}</span>}
        </button>
        <button style={tabStyle('tickets')} onClick={() => setTab('tickets')}>
          {t('tabs.tickets')}
          {serviceTickets.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{serviceTickets.length}</span>}
        </button>
        <button style={tabStyle('internalNotes')} onClick={() => setTab('internalNotes')}>
          {t('tabs.internalNotes')}
          {internalNotes.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{internalNotes.length}</span>}
        </button>
      </div>

      {/* INFO TAB */}
      {tab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', margin: 0 }}>{t('info.contactInfoTitle')}</p>
                {!editingInfo && (
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={startEditInfo}>{t('info.edit')}</button>
                )}
              </div>

              {editingInfo ? (
                <form onSubmit={saveInfo}>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label>{t('info.clientIsLabel')}</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => setEditKind('individual')}
                        style={{ flex: 1, fontSize: 13, fontWeight: 700, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: editKind === 'individual' ? '1.5px solid var(--navy)' : '1.5px solid var(--border)', background: editKind === 'individual' ? 'var(--navy)' : 'transparent', color: editKind === 'individual' ? '#fff' : 'var(--text)' }}>
                        {t('info.individual')}
                      </button>
                      <button type="button" onClick={() => setEditKind('empresa')}
                        style={{ flex: 1, fontSize: 13, fontWeight: 700, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: editKind === 'empresa' ? '1.5px solid var(--navy)' : '1.5px solid var(--border)', background: editKind === 'empresa' ? 'var(--navy)' : 'transparent', color: editKind === 'empresa' ? '#fff' : 'var(--text)' }}>
                        {t('info.company')}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    {editKind === 'empresa' ? (
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>{t('info.companyNameLabel')}</label>
                        <input value={editInfoData.company} onChange={e => setEditInfoData(d => ({ ...d, company: e.target.value }))} required />
                      </div>
                    ) : (
                      <>
                        <div className="form-group">
                          <label>{t('info.nameLabel')}</label>
                          <input value={editInfoData.name} onChange={e => setEditInfoData(d => ({ ...d, name: e.target.value }))} required />
                        </div>
                        <div className="form-group">
                          <label>{t('info.company')}</label>
                          <input value={editInfoData.company} onChange={e => setEditInfoData(d => ({ ...d, company: e.target.value }))} />
                        </div>
                      </>
                    )}
                    <div className="form-group">
                      <label>{t('info.emailLabel')}</label>
                      <input type="email" value={editInfoData.email} onChange={e => setEditInfoData(d => ({ ...d, email: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>{t('info.phoneLabel')}</label>
                      <input value={editInfoData.phone} onChange={e => setEditInfoData(d => ({ ...d, phone: e.target.value }))} />
                    </div>
                    <PhoneListEditor phones={editInfoData.extra_phones} onChange={list => setEditInfoData(d => ({ ...d, extra_phones: list }))} />
                    <div className="form-group">
                      <label>{t('info.clientTypeLabel')}</label>
                      <select value={editInfoData.client_type} onChange={e => setEditInfoData(d => ({ ...d, client_type: e.target.value }))}>
                        <option value="final">{t('info.clientTypeFinal')}</option>
                        <option value="b2b">{t('info.clientTypeB2b')}</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>{t('info.notesLabel')}</label>
                      <textarea value={editInfoData.notes} onChange={e => setEditInfoData(d => ({ ...d, notes: e.target.value }))} />
                    </div>
                  </div>
                  {editKind === 'individual' && editInfoData.company.trim() && (
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label>{t('info.reportNameLabel')}</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => setEditInfoData(d => ({ ...d, report_name_source: 'client' }))}
                          style={{ flex: 1, fontSize: 13, fontWeight: 700, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: editInfoData.report_name_source === 'client' ? '1.5px solid var(--navy)' : '1.5px solid var(--border)', background: editInfoData.report_name_source === 'client' ? 'var(--navy)' : 'transparent', color: editInfoData.report_name_source === 'client' ? '#fff' : 'var(--text)' }}>
                          {editInfoData.name || t('info.clientNamePlaceholder')}
                        </button>
                        <button type="button" onClick={() => setEditInfoData(d => ({ ...d, report_name_source: 'company' }))}
                          style={{ flex: 1, fontSize: 13, fontWeight: 700, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: editInfoData.report_name_source === 'company' ? '1.5px solid var(--navy)' : '1.5px solid var(--border)', background: editInfoData.report_name_source === 'company' ? 'var(--navy)' : 'transparent', color: editInfoData.report_name_source === 'company' ? '#fff' : 'var(--text)' }}>
                          {editInfoData.company}
                        </button>
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="submit" className="btn btn-primary" disabled={savingInfo}>{savingInfo ? t('info.saving') : t('info.save')}</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setEditingInfo(false)}>{t('info.cancel')}</button>
                  </div>
                </form>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { label: t('info.fieldName'), value: client.name },
                    { label: t('info.fieldCompany'), value: client.company },
                    { label: t('info.fieldEmail'), value: client.email },
                    { label: t('info.fieldType'), value: client.client_type === 'b2b' ? t('info.clientTypeB2b') : t('info.clientTypeFinal') },
                    { label: t('info.fieldReportName'), value: client.company ? (client.report_name_source === 'company' ? client.company : client.name) : null },
                  ].map(f => f.value ? (
                    <div key={f.label}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{f.label}</div>
                      <div style={{ fontSize: 14 }}>{f.value}</div>
                    </div>
                  ) : null)}
                  {(client.phone || client.extra_phones?.length > 0) && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>{t('info.fieldPhone')}</div>
                      <PhonePills phone={client.phone} extraPhones={client.extra_phones} />
                    </div>
                  )}
                </div>
              )}
            </div>
            {!editingInfo && client.notes && (
              <div className="card">
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 10 }}>{t('info.notesTitle')}</p>
                <p style={{ fontSize: 14, color: 'var(--muted)' }}>{client.notes}</p>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>{t('summary.title')}</p>
              {(() => {
                const totalFacturado = invoices.reduce((a, i) => a + Number(i.total ?? 0), 0);
                const totalRetenido = invoiceReconciliation?.totalRetenido ?? 0;
                const balanceDeCuenta = invoiceReconciliation?.balanceDeCuenta ?? 0;
                return [
                  { label: t('summary.properties'), value: properties.length },
                  { label: t('summary.contacts'), value: contacts.length },
                  { label: t('summary.jobs'), value: jobs.length },
                  { label: t('summary.invoices'), value: invoices.length },
                  { label: t('summary.totalInvoiced'), value: fmt(totalFacturado) },
                  ...(totalRetenido > 0 ? [
                    { label: t('summary.retained'), value: fmt(totalRetenido), color: 'var(--amber)' },
                    { label: t('summary.netTotal'), value: fmt(totalFacturado - totalRetenido), color: 'var(--navy)' },
                  ] : []),
                  { label: t('summary.accountBalance'), value: fmt(balanceDeCuenta), color: balanceDeCuenta > 0 ? 'var(--warn)' : 'var(--ok)' },
                  { label: t('summary.proposals'), value: proposals.length },
                  { label: t('summary.internalNotes'), value: internalNotes.length },
                ];
              })().map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                  <span style={{ color: 'var(--muted)' }}>{s.label}</span>
                  <span style={{ fontWeight: 700, color: s.color }}>{s.value}</span>
                </div>
              ))}
            </div>
            {canDeleteClient && (
              <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: 'var(--warn)', justifyContent: 'center' }} onClick={handleDeleteClick}>
                {t('deleteClientButton')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* PROPERTIES TAB */}
      {tab === 'properties' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: showPropForm ? 20 : 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{t('properties.title', { count: properties.length })}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {properties.length > 0 && (
                  <SearchBox value={propertySearch} onChange={setPropertySearch} placeholder={t('properties.searchPlaceholder')} />
                )}
                <button className="btn btn-primary" onClick={() => setShowPropForm(!showPropForm)}>
                  {showPropForm ? t('properties.cancel') : t('properties.add')}
                </button>
              </div>
            </div>
            {showPropForm && (
              <form onSubmit={saveProperty}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>{t('properties.nameLabel')}</label>
                    <input value={prop.name} onChange={e => setProp(p => ({ ...p, name: e.target.value }))} placeholder={t('properties.namePlaceholder')} required />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>{t('properties.streetLabel')}</label>
                    <input value={prop.street} onChange={e => {
                      const val = e.target.value;
                      const isShortLink = /(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(val);
                      setProp(p => ({ ...p, street: isShortLink ? val : extractCoordsFromInput(val) }));
                    }} placeholder={t('properties.streetPlaceholder')} />
                  </div>
                  <div className="form-group">
                    <label>{t('properties.cityLabel')}</label>
                    <input value={prop.city} onChange={e => setProp(p => ({ ...p, city: e.target.value }))} placeholder={t('properties.cityPlaceholder')} />
                  </div>
                  <div className="form-group">
                    <label>{t('properties.stateLabel')}</label>
                    <input value={prop.state} onChange={e => setProp(p => ({ ...p, state: e.target.value }))} placeholder={t('properties.statePlaceholder')} />
                  </div>
                  <div className="form-group">
                    <label>{t('properties.zipLabel')}</label>
                    <input value={prop.zip} onChange={e => setProp(p => ({ ...p, zip: e.target.value }))} placeholder={t('properties.zipPlaceholder')} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>{t('properties.noteLabel')}</label>
                    <input value={prop.note} onChange={e => setProp(p => ({ ...p, note: e.target.value }))} placeholder={t('properties.notePlaceholder')} />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={savingProp}>
                  {savingProp ? t('properties.saving') : t('properties.save')}
                </button>
              </form>
            )}
          </div>

          {properties.length === 0 ? (
            <div className="card empty"><p>{t('properties.emptyNone')}</p></div>
          ) : visibleProperties.length === 0 ? (
            <div className="card empty"><p>{t('properties.noResults', { search: propertySearch })}</p></div>
          ) : visibleProperties.map(p => (
            <div key={p.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
                    {p.is_primary && <span className="badge badge-green">{t('properties.primaryBadge')}</span>}
                  </div>
                  {p.street && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{p.street}{p.city ? `, ${p.city}` : ''}{p.state ? `, ${p.state}` : ''}</div>}
                  {p.note && <div style={{ fontSize: 13, color: 'var(--amber)', marginTop: 2 }}>📝 {p.note}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {!p.is_primary && (
                    <button onClick={() => setPrimary(p.id)} className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}>{t('properties.setPrimary')}</button>
                  )}
                  <button
                    onClick={() => {
                      setExpandedProp(p.id);
                      setEditingProp(p.id);
                      setEditPropData({ name: p.name, street: p.street ?? '', city: p.city ?? '', state: p.state ?? 'PR', zip: p.zip ?? '', note: p.note ?? '' });
                    }}
                    className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}
                  >
                    {t('properties.edit')}
                  </button>
                  <button onClick={() => setExpandedProp(expandedProp === p.id ? null : p.id)} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
                    {expandedProp === p.id ? t('properties.viewClose') : t('properties.viewOpen')}
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
                          <label>{t('properties.fieldNameLabel')}</label>
                          <input value={editPropData.name ?? ''} onChange={e => setEditPropData(d => ({ ...d, name: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label>{t('properties.streetLabel')}</label>
                          <input value={editPropData.street ?? ''} onChange={e => {
                            const val = e.target.value;
                            const isShortLink = /(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(val);
                            setEditPropData(d => ({ ...d, street: isShortLink ? val : extractCoordsFromInput(val) }));
                          }} placeholder={t('properties.streetPlaceholder')} />
                        </div>
                        <div className="form-group">
                          <label>{t('properties.cityLabel')}</label>
                          <input value={editPropData.city ?? ''} onChange={e => setEditPropData(d => ({ ...d, city: e.target.value }))} placeholder={t('properties.cityPlaceholder')} />
                        </div>
                        <div className="form-group">
                          <label>{t('properties.stateLabel')}</label>
                          <input value={editPropData.state ?? ''} onChange={e => setEditPropData(d => ({ ...d, state: e.target.value }))} placeholder={t('properties.statePlaceholder')} />
                        </div>
                        <div className="form-group">
                          <label>{t('properties.zipLabel')}</label>
                          <input value={editPropData.zip ?? ''} onChange={e => setEditPropData(d => ({ ...d, zip: e.target.value }))} placeholder={t('properties.zipPlaceholder')} />
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label>{t('properties.noteLabel')}</label>
                          <input value={editPropData.note ?? ''} onChange={e => setEditPropData(d => ({ ...d, note: e.target.value }))} placeholder={t('properties.notePlaceholder')} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button className="btn btn-primary" onClick={() => saveEditProperty(p.id)} disabled={savingEditProp}>
                          {savingEditProp ? t('properties.saving') : t('properties.saveEdit')}
                        </button>
                        <button className="btn btn-ghost" onClick={() => setEditingProp(null)}>{t('properties.cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => { setEditingProp(p.id); setEditPropData({ name: p.name, street: p.street ?? '', city: p.city ?? '', state: p.state ?? 'PR', zip: p.zip ?? '' }); }}>
                          {t('properties.edit')}
                        </button>
                      </div>
                      {/* Nota */}
                      {p.note && (
                        <div style={{ marginBottom: 16 }}>
                          <p style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>{t('properties.noteTitle')}</p>
                          <div style={{ fontSize: 14 }}>{p.note}</div>
                        </div>
                      )}
                      {/* Dirección y mapas */}
                      {(p.street || p.city) && (
                        <div style={{ marginBottom: 16 }}>
                          <p style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>{t('properties.addressTitle')}</p>
                          {p.street && <div style={{ fontSize: 14 }}>{p.street}</div>}
                          {p.city && <div style={{ fontSize: 14, color: 'var(--muted)' }}>{p.city}{p.state ? `, ${p.state}` : ''}{p.zip ? ` ${p.zip}` : ''}</div>}
                          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                            {(() => {
                              const links = buildMapsLinks(p.street, p.city, p.state, p.zip);
                              if (links.direct) {
                                return (
                                  <a href={links.direct} target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                                    {t('properties.openLocation')}
                                  </a>
                                );
                              }
                              return (
                                <>
                                  <a href={links.google} target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                                    {t('properties.googleMaps')}
                                  </a>
                                  <a href={links.apple} target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#000', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                                    {t('properties.appleMaps')}
                                  </a>
                                  <a href={links.waze} target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#33CCFF', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                                    {t('properties.waze')}
                                  </a>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                      {/* Contactos asociados */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <p style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', margin: 0 }}>{t('properties.associatedContactsTitle')}</p>
                          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }}
                            onClick={() => { setAddingContactToProp(addingContactToProp === p.id ? null : p.id); setPickedExistingContactId(''); }}>
                            {addingContactToProp === p.id ? t('properties.cancel') : t('properties.addExistingContact')}
                          </button>
                        </div>
                        {addingContactToProp === p.id && (() => {
                          const linkedIds = new Set(propertyContacts.filter(pc => pc.property_id === p.id).map(pc => pc.contact_id));
                          const availableContacts = sortedContacts.filter(c => c.property_id !== p.id && !linkedIds.has(c.id));
                          return (
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                              <select value={pickedExistingContactId} onChange={e => setPickedExistingContactId(e.target.value)} style={{ flex: 1 }}>
                                <option value="">{t('properties.chooseContactPlaceholder')}</option>
                                {availableContacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                              <button className="btn btn-primary" disabled={!pickedExistingContactId || linkingContact} onClick={() => linkExistingContact(p.id)}>
                                {linkingContact ? t('properties.adding') : t('properties.addButton')}
                              </button>
                            </div>
                          );
                        })()}
                        {contactsForProperty(p.id).length === 0
                          ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('properties.noAssociatedContacts')}</p>
                          : contactsForProperty(p.id).map(c => {
                            const link = propertyContacts.find(pc => pc.property_id === p.id && pc.contact_id === c.id);
                            return (
                              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                                </div>
                                <PhonePills phone={c.phone} extraPhones={c.extra_phones} />
                                {c.email && <a href={`mailto:${c.email}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'var(--navy)', color: '#fff', borderRadius: 7, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>✉️ {c.email}</a>}
                                {link && (
                                  <button onClick={() => unlinkContact(link.id)} title={t('properties.unlinkTitle')}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>🗑</button>
                                )}
                              </div>
                            );
                          })
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: showContactForm ? 20 : 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{t('contacts.title', { count: contacts.length })}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {contacts.length > 0 && (
                  <SearchBox value={contactSearch} onChange={setContactSearch} placeholder={t('contacts.searchPlaceholder')} />
                )}
                <button className="btn btn-primary" onClick={() => setShowContactForm(!showContactForm)}>
                  {showContactForm ? t('contacts.cancel') : t('contacts.add')}
                </button>
              </div>
            </div>
            {showContactForm && (
              <form onSubmit={saveContact}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>{t('contacts.nameLabel')}</label>
                    <input value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))} placeholder={t('contacts.namePlaceholder')} required />
                  </div>
                  <div className="form-group">
                    <label>{t('contacts.phoneLabel')}</label>
                    <input value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} placeholder={t('contacts.phonePlaceholder')} />
                  </div>
                  <div className="form-group">
                    <label>{t('contacts.emailLabel')}</label>
                    <input type="email" value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} placeholder={t('contacts.emailPlaceholder')} />
                  </div>
                  <PhoneListEditor phones={contact.extra_phones} onChange={list => setContact(c => ({ ...c, extra_phones: list }))} />
                  {properties.length > 0 && (
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>{t('contacts.propertyLabel')}</label>
                      <select value={contact.property_id} onChange={e => setContact(c => ({ ...c, property_id: e.target.value }))}>
                        <option value="">{t('contacts.noPropertyOption')}</option>
                        {sortedProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <button type="submit" className="btn btn-primary" disabled={savingContact}>
                  {savingContact ? t('contacts.saving') : t('contacts.save')}
                </button>
              </form>
            )}
          </div>

          {contacts.length === 0 ? (
            <div className="card empty"><p>{t('contacts.emptyNone')}</p></div>
          ) : visibleContacts.length === 0 ? (
            <div className="card empty"><p>{t('contacts.noResults', { search: contactSearch })}</p></div>
          ) : visibleContacts.map(c => (
            <div key={c.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                    {c.is_primary && <span className="badge badge-green">{t('contacts.primaryBadge')}</span>}
                  </div>
                  {(c.phone || c.extra_phones?.length > 0) && (
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                      {[c.phone, ...(c.extra_phones ?? []).map(p => p.label ? `${p.label}: ${p.number}` : p.number)].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => setExpandedContact(expandedContact === c.id ? null : c.id)} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
                    {expandedContact === c.id ? t('contacts.viewClose') : t('contacts.viewOpen')}
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
                          <label>{t('contacts.fieldNameLabel')}</label>
                          <input value={editContactData.name ?? ''} onChange={e => setEditContactData(d => ({ ...d, name: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label>{t('contacts.phoneLabel')}</label>
                          <input value={editContactData.phone ?? ''} onChange={e => setEditContactData(d => ({ ...d, phone: e.target.value }))} placeholder={t('contacts.phonePlaceholder')} />
                        </div>
                        <div className="form-group">
                          <label>{t('contacts.emailLabel')}</label>
                          <input type="email" value={editContactData.email ?? ''} onChange={e => setEditContactData(d => ({ ...d, email: e.target.value }))} placeholder={t('contacts.emailPlaceholder')} />
                        </div>
                        <PhoneListEditor phones={editContactData.extra_phones} onChange={list => setEditContactData(d => ({ ...d, extra_phones: list }))} />
                        {properties.length > 0 && (
                          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label>{t('contacts.propertyLabel')}</label>
                            <select value={editContactData.property_id ?? ''} onChange={e => setEditContactData(d => ({ ...d, property_id: e.target.value || null }))}>
                              <option value="">{t('contacts.noPropertyOption')}</option>
                              {sortedProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button className="btn btn-primary" onClick={() => saveEditContact(c.id)} disabled={savingEditContact}>
                          {savingEditContact ? t('contacts.saving') : t('contacts.saveEdit')}
                        </button>
                        <button className="btn btn-ghost" onClick={() => setEditingContact(null)}>{t('contacts.cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => { setEditingContact(c.id); setEditContactData({ name: c.name, phone: c.phone ?? '', extra_phones: c.extra_phones ?? [], email: c.email ?? '', property_id: c.property_id ?? '' }); }}>
                          {t('contacts.edit')}
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        {(c.phone || c.extra_phones?.length > 0) && (
                          <div>
                            <p style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>{t('contacts.phoneTitle')}</p>
                            <PhonePills phone={c.phone} extraPhones={c.extra_phones} />
                          </div>
                        )}
                        {c.email && (
                          <div>
                            <p style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>{t('contacts.emailTitle')}</p>
                            <a href={`mailto:${c.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--navy)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                              ✉️ {c.email}
                            </a>
                          </div>
                        )}
                      </div>
                      {c.property_id && (
                        <div>
                          <p style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>{t('contacts.associatedPropertyTitle')}</p>
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

      {/* CLIENT SCHEDULE TAB */}
      {tab === 'schedule' && (() => {
        const jobById = Object.fromEntries(jobs.map(j => [j.id, j]));
        const techNames = entities => {
          const names = new Set();
          entities.forEach(e => { if (e?.name) names.add(e.name); });
          return names;
        };

        const items = [
          ...jobs.filter(j => j.scheduled_start).map(j => {
            const names = techNames([j.technicians, ...(j.job_technicians ?? []).map(jt => jt.technicians)]);
            return {
              key: `job-${j.id}`,
              icon: '🚚',
              label: t('schedule.visitFor', { title: j.title }),
              date: j.scheduled_start,
              techs: names.size ? [...names].join(', ') : '—',
              href: `/trabajos/${j.id}`,
              loc: jobLocation(j),
              mapHref: (j.street || j.city) ? pickMapsLink(j.street, j.city, j.state, j.zip) : null,
            };
          }),
          ...scheduleDays.map(d => {
            const job = jobById[d.job_id];
            const names = techNames([d.technicians]);
            const loc = job ? jobLocation(job) : '';
            return {
              key: `day-${d.id}`,
              icon: '🚚',
              label: job ? t('schedule.visitFor', { title: job.title }) : t('schedule.visit'),
              date: d.scheduled_start,
              techs: names.size ? [...names].join(', ') : '—',
              href: job ? `/trabajos/${job.id}` : undefined,
              loc,
              mapHref: (job?.street || job?.city) ? pickMapsLink(job.street, job.city, job.state, job.zip) : null,
            };
          }),
          ...calendarEvents.map(e => {
            const names = techNames([e.technicians, ...(e.calendar_event_technicians ?? []).map(cet => cet.technicians)]);
            return {
              key: `event-${e.id}`,
              icon: '🗓️',
              label: e.title,
              date: e.start_at,
              techs: names.size ? [...names].join(', ') : '—',
              href: undefined,
              loc: e.address ?? '',
              mapHref: e.address ? pickMapsLink(e.address) : null,
            };
          }),
          ...tasks.map(task => ({
            key: `task-${task.id}`,
            icon: task.completed ? '✅' : '🔔',
            label: task.title,
            date: task.due_at,
            techs: task.technicians?.name ?? '—',
            href: undefined,
            loc: '',
            mapHref: null,
          })),
        ].sort((a, b) => new Date(a.date ?? 0) - new Date(b.date ?? 0));

        return (
          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>{t('schedule.title')}</h2>
            {items.length === 0 ? (
              <div className="empty"><p>{t('schedule.empty')}</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>{t('schedule.columnTitle')}</th><th>{t('schedule.columnLocation')}</th><th>{t('schedule.columnDate')}</th><th>{t('schedule.columnAssigned')}</th></tr>
                  </thead>
                  <tbody>
                    {items.map(it => (
                      <tr key={it.key}>
                        <td style={{ fontWeight: 600 }}>
                          {it.href ? <Link href={it.href} style={{ color: 'inherit' }}>{it.icon} {it.label}</Link> : <>{it.icon} {it.label}</>}
                        </td>
                        <td style={{ fontSize: 13 }}>
                          {it.loc ? (
                            it.mapHref ? (
                              <a href={it.mapHref} target="_blank" rel="noopener noreferrer"
                                style={{ color: 'var(--amber)', fontWeight: 600 }}>
                                📍 {it.loc}
                              </a>
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>{it.loc}</span>
                            )
                          ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                        </td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                          {it.date ? formatDateTimePR(it.date, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }, dateLocale) : '—'}
                        </td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{it.techs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* JOBS TAB */}
      {tab === 'jobs' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{t('jobs.title')}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {jobs.length > 0 && (
                <SearchBox value={jobSearch} onChange={setJobSearch} placeholder={t('jobs.searchPlaceholder')} />
              )}
              <Link href={`/trabajos/nuevo?client=${client.id}`} className="btn btn-primary">{t('jobs.newJob')}</Link>
            </div>
          </div>
          {jobs.length === 0 ? (
            <div className="empty"><p>{t('jobs.empty')}</p></div>
          ) : visibleJobs.length === 0 ? (
            <div className="empty"><p>{t('jobs.noResults', { search: jobSearch })}</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>{t('jobs.columnTitle')}</th><th>{t('jobs.columnProperty')}</th><th>{t('jobs.columnStatus')}</th><th>{t('jobs.columnDate')}</th></tr>
                </thead>
                <tbody>
                  {visibleJobs.map(j => {
                    const b = statusJob[j.status] ?? statusJob.estimate;
                    const loc = jobLocation(j);
                    return (
                      <tr key={j.id}>
                        <td style={{ fontWeight: 600 }}>
                          <Link href={`/trabajos/${j.id}`} style={{ color: 'inherit' }}>
                            {j.job_number && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', fontFamily: 'monospace', background: 'var(--amber-tint)', padding: '2px 6px', borderRadius: 6, marginRight: 8 }}>{j.job_number}</span>}
                            {j.title}
                          </Link>
                        </td>
                        <td style={{ fontSize: 13 }}>
                          {loc ? (
                            (j.street || j.city) ? (
                              <a href={pickMapsLink(j.street, j.city, j.state, j.zip)} target="_blank" rel="noopener noreferrer"
                                style={{ color: 'var(--amber)', fontWeight: 600 }}>
                                📍 {loc}
                              </a>
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>{loc}</span>
                            )
                          ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                        </td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{j.scheduled_start ? formatDatePR(j.scheduled_start, {}, dateLocale) : '—'}</td>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{t('invoices.title')}</h2>
            {invoices.length > 0 && (
              <SearchBox value={invoiceSearch} onChange={setInvoiceSearch} placeholder={t('invoices.searchPlaceholder')} />
            )}
          </div>
          {invoiceReconciliation?.hasVarianza && (
            <div style={{ borderLeft: '4px solid var(--warn)', background: 'var(--danger-tint)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--warn)', marginBottom: 6 }}>{t('invoices.varianceTitle')}</p>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                {t('invoices.varianceNetoEsperadoLabel')} <strong>{fmt(invoiceReconciliation.netoEsperado)}</strong>
                {' · '}{t('invoices.varianceCobradoLabel')} <strong>{fmt(invoiceReconciliation.cobrado)}</strong>
                {' · '}{t('invoices.varianceDiferenciaLabel')} <strong style={{ color: 'var(--warn)' }}>{fmt(Math.abs(invoiceReconciliation.varianza))}</strong>
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{t('invoices.varianceHint')}</p>
            </div>
          )}
          {invoices.length === 0 ? (
            <div className="empty"><p>{t('invoices.empty')}</p></div>
          ) : (() => {
            const jobsById = Object.fromEntries(jobs.map(j => [j.id, j]));
            const propertiesById = Object.fromEntries(properties.map(p => [p.id, p]));
            const query = invoiceSearch.trim().toLowerCase();
            const visibleInvoices = query
              ? invoices.filter(inv =>
                  inv.invoice_number?.toLowerCase().includes(query) ||
                  (statusInv[inv.status]?.label ?? '').toLowerCase().includes(query) ||
                  (jobsById[inv.job_id]?.title ?? '').toLowerCase().includes(query)
                )
              : invoices;
            const invoicesTotal = visibleInvoices.reduce((a, i) => a + Number(i.total ?? 0), 0);
            return visibleInvoices.length === 0 ? (
              <div className="empty"><p>{t('invoices.noResults', { search: invoiceSearch })}</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>{t('invoices.columnNumber')}</th><th>{t('invoices.columnJob')}</th><th>{t('invoices.columnProperty')}</th><th>{t('invoices.columnStatus')}</th><th>{t('invoices.columnTotal')}</th><th>{t('invoices.columnDate')}</th></tr>
                  </thead>
                  <tbody>
                    {visibleInvoices.map(inv => {
                      const b = statusInv[inv.status] ?? statusInv.draft;
                      const job = jobsById[inv.job_id];
                      const prop = propertiesById[inv.property_id];
                      const street = job?.street || prop?.street;
                      const city = job?.city || prop?.city;
                      const state = job?.state || prop?.state;
                      const zip = job?.zip || prop?.zip;
                      const loc = job ? jobLocation(job) : (prop?.name ?? '');
                      return (
                        <tr key={inv.id}>
                          <td style={{ fontWeight: 600 }}><Link href={`/facturas/${inv.id}`} style={{ color: 'inherit' }}>{inv.invoice_number ?? '—'}</Link></td>
                          <td style={{ fontSize: 13 }}>
                            {job ? (
                              <Link href={`/trabajos/${job.id}`} style={{ color: 'var(--amber)', fontWeight: 600 }}>{job.title}</Link>
                            ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                          </td>
                          <td style={{ fontSize: 13 }}>
                            {loc ? (
                              (street || city) ? (
                                <a href={pickMapsLink(street, city, state, zip)} target="_blank" rel="noopener noreferrer"
                                  style={{ color: 'var(--amber)', fontWeight: 600 }}>
                                  📍 {loc}
                                </a>
                              ) : (
                                <span style={{ color: 'var(--muted)' }}>{loc}</span>
                              )
                            ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                          </td>
                          <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                          <td style={{ fontWeight: 700 }}>{fmt(inv.total)}</td>
                          <td style={{ color: 'var(--muted)', fontSize: 13 }}>{formatDatePR(inv.created_at, {}, dateLocale)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', paddingTop: 12 }}>{t('invoices.totalRow')} {query ? t('invoices.totalRowVisible') : ''}</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td style={{ fontWeight: 900, fontSize: 15, color: 'var(--navy)', paddingTop: 12 }}>{fmt(invoicesTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* BILLING TAB */}
      {tab === 'billing' && (() => {
        const invoiceById = Object.fromEntries(invoices.map(i => [i.id, i]));

        // Payments made on the same day are usually one batch applied across
        // several invoices - group them so the ledger reads like a single line,
        // matching how the client actually experiences the transaction.
        const paymentGroups = {};
        payments.forEach(p => {
          const day = p.paid_at ? p.paid_at.slice(0, 10) : 'sin-fecha';
          if (!paymentGroups[day]) paymentGroups[day] = { date: p.paid_at, amount: 0, invoiceNumbers: [] };
          paymentGroups[day].amount += Number(p.amount ?? 0);
          const num = invoiceById[p.invoice_id]?.invoice_number;
          if (num && !paymentGroups[day].invoiceNumbers.includes(num)) paymentGroups[day].invoiceNumbers.push(num);
        });

        const ledger = [
          ...invoices.map(i => ({
            key: `inv-${i.id}`,
            date: i.created_at,
            item: t('billing.invoiceItem', { number: i.invoice_number ?? '—' }),
            appliedTo: '—',
            amount: Number(i.total ?? 0),
            href: `/facturas/${i.id}`,
          })),
          ...Object.values(paymentGroups).map((g, idx) => ({
            key: `pay-${idx}-${g.date}`,
            date: g.date,
            item: t('billing.paymentItem'),
            appliedTo: g.invoiceNumbers.length ? t('billing.appliedToInvoice', { numbers: g.invoiceNumbers.join(', ') }) : '—',
            amount: -g.amount,
          })),
          ...retenciones.filter(r => Number(r.retencion_aplicada ?? 0) !== 0).map(r => ({
            key: `ret-${r.id}`,
            date: r.fecha,
            item: t('billing.retentionItem'),
            appliedTo: invoiceById[r.invoice_id]?.invoice_number ? t('billing.appliedToInvoice', { numbers: invoiceById[r.invoice_id].invoice_number }) : '—',
            amount: -Number(r.retencion_aplicada ?? 0),
          })),
        ].sort((a, b) => new Date(b.date ?? 0) - new Date(a.date ?? 0));

        const balanceDeCuenta = invoiceReconciliation?.balanceDeCuenta ?? 0;
        const billingQuery = billingSearch.trim().toLowerCase();
        const visibleLedger = billingQuery
          ? ledger.filter(row =>
              row.item.toLowerCase().includes(billingQuery) ||
              row.appliedTo.toLowerCase().includes(billingQuery)
            )
          : ledger;

        return (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{t('billing.title')}</h2>
              {ledger.length > 0 && (
                <SearchBox value={billingSearch} onChange={setBillingSearch} placeholder={t('billing.searchPlaceholder')} />
              )}
            </div>
            {ledger.length === 0 ? (
              <div className="empty"><p>{t('billing.empty')}</p></div>
            ) : visibleLedger.length === 0 ? (
              <div className="empty"><p>{t('billing.noResults', { search: billingSearch })}</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>{t('billing.columnItem')}</th><th>{t('billing.columnAppliedTo')}</th><th>{t('billing.columnDate')}</th><th style={{ textAlign: 'right' }}>{t('billing.columnAmount')}</th></tr>
                  </thead>
                  <tbody>
                    {visibleLedger.map(row => (
                      <tr key={row.key}>
                        <td style={{ fontWeight: 600 }}>
                          {row.href ? <Link href={row.href} style={{ color: 'inherit', textDecoration: 'none' }}>{row.item}</Link> : row.item}
                        </td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{row.appliedTo}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{row.date ? formatDatePR(row.date, {}, dateLocale) : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: row.amount < 0 ? 'var(--ok)' : 'inherit' }}>
                          {row.amount < 0 ? `-${fmt(Math.abs(row.amount))}` : fmt(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', paddingTop: 12 }}>{t('billing.currentBalance')}</td>
                      <td></td>
                      <td></td>
                      <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: balanceDeCuenta > 0 ? 'var(--warn)' : 'var(--ok)', paddingTop: 12 }}>{fmt(balanceDeCuenta)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* PROPOSALS TAB */}
      {tab === 'proposals' && (() => {
        const proposalQuery = proposalSearch.trim().toLowerCase();
        const visibleProposals = proposalQuery
          ? proposals.filter(p =>
              p.proposal_number?.toLowerCase().includes(proposalQuery) ||
              p.title?.toLowerCase().includes(proposalQuery) ||
              (statusProp[p.status]?.label ?? '').toLowerCase().includes(proposalQuery)
            )
          : proposals;
        return (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{t('proposals.title')}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {proposals.length > 0 && (
                  <SearchBox value={proposalSearch} onChange={setProposalSearch} placeholder={t('proposals.searchPlaceholder')} />
                )}
                <Link href={`/propuestas/nuevo?client=${client.id}`} className="btn btn-primary">{t('proposals.newProposal')}</Link>
              </div>
            </div>
            {proposals.length === 0 ? (
              <div className="empty"><p>{t('proposals.empty')}</p></div>
            ) : visibleProposals.length === 0 ? (
              <div className="empty"><p>{t('proposals.noResults', { search: proposalSearch })}</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>{t('proposals.columnNumber')}</th><th>{t('proposals.columnTitle')}</th><th>{t('proposals.columnStatus')}</th><th>{t('proposals.columnTotal')}</th><th>{t('proposals.columnDate')}</th></tr>
                  </thead>
                  <tbody>
                    {visibleProposals.map(p => {
                      const b = statusProp[p.status] ?? statusProp.borrador;
                      const opt = (p.proposal_options ?? []).find(o => o.is_recommended) ?? (p.proposal_options ?? [])[0];
                      const total = sumBillableLineItems(opt?.proposal_line_items);
                      return (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600, fontFamily: 'monospace' }}><Link href={`/propuestas/${p.id}`} style={{ color: 'inherit' }}>{p.proposal_number}</Link></td>
                          <td style={{ fontWeight: 600 }}>{p.title}</td>
                          <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                          <td style={{ fontWeight: 700 }}>{fmt(total)}</td>
                          <td style={{ color: 'var(--muted)', fontSize: 13 }}>{formatDatePR(p.created_at, {}, dateLocale)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* TICKETS TAB */}
      {tab === 'tickets' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{t('tickets.title')}</h2>
            <Link href={`/boletos/nuevo?client=${client.id}`} className="btn btn-primary">{t('tickets.newTicket')}</Link>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 16 }}>
            {t('tickets.emailInfoPre')} <strong>support@tickets.otesspr.com</strong>{t('tickets.emailInfoPost')}
          </p>
          {serviceTickets.length === 0 ? (
            <div className="empty"><p>{t('tickets.empty')}</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>{t('tickets.columnProblem')}</th><th>{t('tickets.columnSource')}</th><th>{t('tickets.columnStatus')}</th><th>{t('tickets.columnDate')}</th></tr>
                </thead>
                <tbody>
                  {serviceTickets.map(ticket => {
                    const b = statusTicket[ticket.status] ?? statusTicket.abierto;
                    return (
                      <tr key={ticket.id}>
                        <td style={{ fontWeight: 600 }}><Link href={`/boletos/${ticket.id}`} style={{ color: 'inherit' }}>{ticket.subject}</Link></td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{ticket.source === 'email' ? t('tickets.sourceEmail') : t('tickets.sourceManual')}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{formatDatePR(ticket.created_at, {}, dateLocale)}</td>
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
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 12 }}>{t('internalNotes.newNoteTitle')}</p>
            <form onSubmit={addInternalNote}>
              <textarea
                value={newInternalNote}
                onChange={e => setNewInternalNote(e.target.value)}
                placeholder={t('internalNotes.notePlaceholder')}
                rows={3}
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 10 }}
              />
              {pendingNotePhotoPreviews.length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                  {pendingNotePhotoPreviews.map((preview, idx) => (
                    <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={preview} alt={t('internalNotes.previewAlt')} style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8 }} />
                      {uploadingNotePhoto ? (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', borderRadius: '0 0 8px 8px', padding: '3px 5px' }}>
                          <div style={{ background: 'rgba(255,255,255,0.3)', borderRadius: 20, height: 4, overflow: 'hidden' }}>
                            <div style={{ background: 'var(--amber)', height: '100%', width: `${noteUploadProgress[idx] ?? 0}%`, transition: 'width 0.2s' }} />
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => {
                          setPendingNotePhotos(prev => prev.filter((_, i) => i !== idx));
                          setPendingNotePhotoPreviews(prev => prev.filter((_, i) => i !== idx));
                        }}
                          style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: 12 }}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <input ref={noteFileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleNotePhotoSelect} style={{ display: 'none' }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" onClick={() => noteFileRef.current?.click()}>
                  {pendingNotePhotos.length > 0 ? t('internalNotes.photoButtonCount', { count: pendingNotePhotos.length }) : t('internalNotes.photoButton')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingInternalNote || uploadingNotePhoto || (!newInternalNote.trim() && pendingNotePhotos.length === 0)}>
                  {uploadingNotePhoto ? t('internalNotes.uploading') : savingInternalNote ? t('internalNotes.saving') : t('internalNotes.save')}
                </button>
              </div>
            </form>
          </div>

          {sortedInternalNotes.length === 0 ? (
            <div className="card empty"><p>{t('internalNotes.empty')}</p></div>
          ) : sortedInternalNotes.map(n => (
            <div key={n.id} className="card" style={{ marginBottom: 12, ...(n.is_pinned ? { border: '1.5px solid var(--amber)', background: 'var(--amber-tint)' } : {}) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }} suppressHydrationWarning>
                  {n.is_pinned && <span title={t('internalNotes.pinnedTitle')}>📌</span>}
                  {formatDateTimePR(n.created_at, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }, dateLocale)}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => toggleInternalNotePin(n.id, n.is_pinned)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: n.is_pinned ? 'var(--amber)' : 'var(--muted)', fontSize: 15 }} title={n.is_pinned ? t('internalNotes.unpin') : t('internalNotes.pin')}>
                    📌
                  </button>
                  {editingInternalNoteId !== n.id && (
                    <button onClick={() => { setEditingInternalNoteId(n.id); setEditingInternalNoteText(n.note ?? ''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 15 }}>✏️</button>
                  )}
                  <button onClick={() => deleteInternalNote(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>🗑</button>
                </div>
              </div>
              {n.photo_urls && n.photo_urls.length > 1 ? (
                <div style={{ display: 'grid', gridTemplateColumns: n.photo_urls.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 8, marginBottom: n.note ? 10 : 0 }}>
                  {n.photo_urls.map((url, idx) => {
                    const isVideo = /\.(mp4|mov|webm|avi)(\?|$)/i.test(url);
                    const isPdf = /\.pdf(\?|$)/i.test(url);
                    if (isPdf) return (
                      <a key={idx} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 130, background: 'var(--surface-2)', borderRadius: 8, textDecoration: 'none', border: '1.5px solid var(--border)' }}>
                        <span style={{ fontSize: 32 }}>📄</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{t('internalNotes.viewPdf')}</span>
                      </a>
                    );
                    return isVideo ? (
                      <video key={idx} src={url} controls style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 8, background: '#000' }} />
                    ) : (
                      <img key={idx} src={url} alt={t('internalNotes.notePhotoAlt')} onClick={() => setNoteLightbox({ urls: n.photo_urls, index: idx })}
                        style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in' }} />
                    );
                  })}
                </div>
              ) : n.photo_url && (() => {
                const isVideo = /\.(mp4|mov|webm|avi)(\?|$)/i.test(n.photo_url);
                const isPdf = /\.pdf(\?|$)/i.test(n.photo_url);
                if (isPdf) return (
                  <a href={n.photo_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 10, textDecoration: 'none', border: '1.5px solid var(--border)', marginBottom: n.note ? 10 : 0 }}>
                    <span style={{ fontSize: 28 }}>📄</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{t('internalNotes.viewPdfDocument')}</span>
                  </a>
                );
                return isVideo ? (
                  <video src={n.photo_url} controls style={{ width: '100%', maxHeight: 300, borderRadius: 10, marginBottom: n.note ? 10 : 0, background: '#000' }} />
                ) : (
                  <img src={n.photo_url} alt={t('internalNotes.notePhotoAlt')} onClick={() => setNoteLightbox({ urls: [n.photo_url], index: 0 })}
                    style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 10, marginBottom: n.note ? 10 : 0, cursor: 'zoom-in' }} />
                );
              })()}
              {editingInternalNoteId === n.id ? (
                <div>
                  <textarea autoFocus value={editingInternalNoteText} onChange={e => setEditingInternalNoteText(e.target.value)} rows={3}
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 8 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" style={{ fontSize: 13, padding: '5px 12px' }} onClick={() => saveInternalNoteEdit(n.id)}>{t('internalNotes.saveEdit')}</button>
                    <button className="btn btn-ghost" style={{ fontSize: 13, padding: '5px 12px' }} onClick={() => { setEditingInternalNoteId(null); setEditingInternalNoteText(''); }}>{t('internalNotes.cancelEdit')}</button>
                  </div>
                </div>
              ) : n.note && <p style={{ fontSize: 14, color: 'var(--text)', margin: 0, whiteSpace: 'pre-wrap' }}>{n.note}</p>}
            </div>
          ))}

          {noteLightbox && (
            <div onClick={() => setNoteLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, cursor: 'zoom-out' }}>
              <button onClick={() => setNoteLightbox(null)} style={{ position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 28, borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>×</button>
              {noteLightbox.urls.length > 1 && (
                <div style={{ position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)', color: '#fff', fontSize: 14, fontWeight: 600, background: 'rgba(255,255,255,0.15)', padding: '4px 14px', borderRadius: 20 }}>
                  {noteLightbox.index + 1} / {noteLightbox.urls.length}
                </div>
              )}
              {noteLightbox.urls.length > 1 && noteLightbox.index > 0 && (
                <button onClick={e => { e.stopPropagation(); setNoteLightbox(l => ({ ...l, index: l.index - 1 })); }}
                  style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 26, borderRadius: '50%', width: 48, height: 48, cursor: 'pointer', zIndex: 2 }}>‹</button>
              )}
              <img src={noteLightbox.urls[noteLightbox.index]} alt={t('internalNotes.lightboxImageAlt')} onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} />
              {noteLightbox.urls.length > 1 && noteLightbox.index < noteLightbox.urls.length - 1 && (
                <button onClick={e => { e.stopPropagation(); setNoteLightbox(l => ({ ...l, index: l.index + 1 })); }}
                  style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 26, borderRadius: '50%', width: 48, height: 48, cursor: 'pointer', zIndex: 2 }}>›</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delete modal */}
      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>{t('deleteModal.title')}</h2>
            {jobCount > 0 ? (
              <div style={{ background: 'var(--amber-tint)', border: '1.5px solid var(--amber)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--amber)', marginBottom: 4 }}>{t('deleteModal.jobWarning', { count: jobCount })}</p>
                <p style={{ fontSize: 13, color: 'var(--amber)' }}>{t('deleteModal.jobWarningDetail')}</p>
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>{t('deleteModal.permanentText')}</p>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={deleteClient} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger-tint)', color: 'var(--warn)', border: 'none' }}>
                {deleting ? t('deleteModal.deleting') : t('deleteModal.confirmDelete')}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>{t('deleteModal.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
