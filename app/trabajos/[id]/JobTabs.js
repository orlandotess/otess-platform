'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import PhotoAnnotator from '../../PhotoAnnotator';
import LineItemRow from '../../LineItemRow';
import CableCalculator from '../../CableCalculator';
import { exportPurchaseListCSV } from '../../purchaseListCsv';
import { buildMapsLinks } from '../../../lib/mapsLinks';
import { isoToLocalInput, localInputToIso } from '../../../lib/datetimeLocal';
import { uploadFileWithProgress } from '../../../lib/uploadWithProgress';

const SUPABASE_URL = 'https://zisidorwdhrttmdppnbj.supabase.co';

const statusOptions = [
  { value: 'estimate', label: 'Estimado' },
  { value: 'scheduled', label: 'Programado' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'completed', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
];

const expenseCategories = [
  { value: 'materiales', label: 'Materiales' },
  { value: 'gasolina', label: 'Gasolina' },
  { value: 'herramientas', label: 'Herramientas' },
  { value: 'subcontratista', label: 'Subcontratista' },
  { value: 'oficina', label: 'Oficina' },
  { value: 'parking', label: 'Parking' },
  { value: 'equipos', label: 'Equipos' },
  { value: 'meals', label: 'Meals' },
  { value: 'otro', label: 'Otro' },
];

export default function JobTabs({ job, items, technicians, notes, checklist, templates, clientType, totals, jobTechnicians = [], clientProperties = [], clientContacts = [], scheduleDays: initialScheduleDays = [], expenses: initialExpenses = [], invoices = [], payments = [], timeEntries = [] }) {
  const router = useRouter();
  const fmt = n => `$${Number(n).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  const [tab, setTab] = useState('info');
  const [status, setStatus] = useState(job.status);
  const [billTo, setBillTo] = useState(job.bill_to ?? 'person');
  const [assignedTechs, setAssignedTechs] = useState(jobTechnicians);
  const [addingTech, setAddingTech] = useState('');
  const [savingTech, setSavingTech] = useState(false);

  async function addTechnician(techId) {
    if (!techId) return;
    setSavingTech(true);
    const { data } = await supabase.from('job_technicians').insert([{ job_id: job.id, technician_id: techId }]).select('*, technicians(name)').single();
    if (data) setAssignedTechs(prev => [...prev, data]);
    setAddingTech('');
    setSavingTech(false);
  }

  async function removeTechnician(rowId) {
    await supabase.from('job_technicians').delete().eq('id', rowId);
    setAssignedTechs(prev => prev.filter(t => t.id !== rowId));
  }
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingNumber, setEditingNumber] = useState(false);
  const [jobNumber, setJobNumber] = useState(job.job_number ?? '');
  const [savingNumber, setSavingNumber] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [schedStart, setSchedStart] = useState(isoToLocalInput(job.scheduled_start));
  const [schedEnd, setSchedEnd] = useState(isoToLocalInput(job.scheduled_end));
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [titleForm, setTitleForm] = useState(job.title ?? '');
  const [descForm, setDescForm] = useState(job.description ?? '');
  const [savingDetails, setSavingDetails] = useState(false);
  const [editingClient, setEditingClient] = useState(false);
  const [allClients, setAllClients] = useState([]);
  const [clientPickerSearch, setClientPickerSearch] = useState('');
  const [savingClient, setSavingClient] = useState(false);

  useEffect(() => {
    if (editingClient && allClients.length === 0) {
      supabase.from('clients').select('id, name, client_type, company').order('name').then(({ data }) => setAllClients(data ?? []));
    }
  }, [editingClient]);

  async function saveClientChange(newClientId) {
    if (!newClientId || newClientId === job.client_id) { setEditingClient(false); return; }
    setSavingClient(true);
    await supabase.from('jobs').update({
      client_id: newClientId,
      bill_to: 'person',
      property_id: null, property_name: null, street: null, city: null, state: null, zip: null,
      contact_id: null, contact_name: null, contact_phone: null, contact_email: null,
    }).eq('id', job.id);
    setSavingClient(false);
    setEditingClient(false);
    setClientPickerSearch('');
    router.refresh();
  }

  const [editingContact, setEditingContact] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [contactForm, setContactForm] = useState({ contact_name: job.contact_name ?? '', contact_phone: job.contact_phone ?? '', contact_email: job.contact_email ?? '' });
  const [savingContact, setSavingContact] = useState(false);
  const [editingProperty, setEditingProperty] = useState(false);
  const [propertySearch, setPropertySearch] = useState('');
  const [propertyForm, setPropertyForm] = useState({ property_id: job.property_id ?? '', property_name: job.property_name ?? '', street: job.street ?? '', city: job.city ?? '', state: job.state ?? 'PR', zip: job.zip ?? '' });
  const [savingProperty, setSavingProperty] = useState(false);

  function contactLabel(c) { return `${c.name}${c.phone ? ' — ' + c.phone : ''}`; }
  function handleContactSearchChange(value) {
    setContactSearch(value);
    const match = clientContacts.find(c => contactLabel(c) === value);
    if (match) setContactForm({ contact_name: match.name ?? '', contact_phone: match.phone ?? '', contact_email: match.email ?? '' });
  }

  function propertyLabel(p) { return `${p.name}${p.city ? ' — ' + p.city : ''}`; }
  function handlePropertySearchChange(value) {
    setPropertySearch(value);
    const match = clientProperties.find(p => propertyLabel(p) === value);
    if (match) setPropertyForm({ property_id: match.id, property_name: match.name ?? '', street: match.street ?? '', city: match.city ?? '', state: match.state ?? 'PR', zip: match.zip ?? '' });
  }

  async function saveDetails() {
    setSavingDetails(true);
    await supabase.from('jobs').update({
      title: titleForm.trim() || job.title,
      description: descForm.trim() || null,
    }).eq('id', job.id);
    setSavingDetails(false);
    setEditingDetails(false);
    router.refresh();
  }

  async function saveContact() {
    setSavingContact(true);
    await supabase.from('jobs').update({
      contact_name: contactForm.contact_name.trim() || null,
      contact_phone: contactForm.contact_phone.trim() || null,
      contact_email: contactForm.contact_email.trim() || null,
    }).eq('id', job.id);
    setSavingContact(false);
    setEditingContact(false);
    router.refresh();
  }

  async function saveProperty() {
    setSavingProperty(true);
    await supabase.from('jobs').update({
      property_id: propertyForm.property_id || null,
      property_name: propertyForm.property_name.trim() || null,
      street: propertyForm.street.trim() || null,
      city: propertyForm.city.trim() || null,
      state: propertyForm.state.trim() || null,
      zip: propertyForm.zip.trim() || null,
    }).eq('id', job.id);
    setSavingProperty(false);
    setEditingProperty(false);
    router.refresh();
  }

  async function saveJobNumber() {
    if (!jobNumber.trim()) return;
    setSavingNumber(true);
    await supabase.from('jobs').update({ job_number: jobNumber.trim() }).eq('id', job.id);
    setSavingNumber(false);
    setEditingNumber(false);
    router.refresh();
  }

  async function saveSchedule() {
    setSavingSchedule(true);
    await supabase.from('jobs').update({
      scheduled_start: localInputToIso(schedStart),
      scheduled_end: localInputToIso(schedEnd),
    }).eq('id', job.id);
    setSavingSchedule(false);
    setEditingSchedule(false);
    router.refresh();
  }

  // Extra work days — a job can span multiple (possibly non-consecutive) days,
  // each with its own time range and technician, beyond the primary scheduled_start/end above.
  const [scheduleDays, setScheduleDays] = useState(initialScheduleDays);
  const [addingDay, setAddingDay] = useState(false);
  const [newDay, setNewDay] = useState({ start: '', end: '', technician_ids: [], lunch_minutes: 0 });
  const [savingDay, setSavingDay] = useState(false);
  const [editingDayId, setEditingDayId] = useState(null);
  const [editDayForm, setEditDayForm] = useState({ start: '', end: '', technician_id: '', lunch_minutes: 0 });
  const [savingEditDay, setSavingEditDay] = useState(false);

  function toggleNewDayTechnician(techId) {
    setNewDay(d => ({
      ...d,
      technician_ids: d.technician_ids.includes(techId)
        ? d.technician_ids.filter(id => id !== techId)
        : [...d.technician_ids, techId],
    }));
  }

  async function addScheduleDay() {
    if (!newDay.start) return;
    setSavingDay(true);
    // One row per selected technician so each tech's hours count toward the day/grand totals;
    // falls back to a single unassigned row when no technician is picked.
    const techIds = newDay.technician_ids.length > 0 ? newDay.technician_ids : [null];
    const rows = techIds.map(techId => ({
      job_id: job.id,
      scheduled_start: localInputToIso(newDay.start),
      scheduled_end: localInputToIso(newDay.end),
      technician_id: techId,
      lunch_minutes: newDay.lunch_minutes,
    }));
    const { data } = await supabase.from('job_schedule_days').insert(rows).select('*, technicians(name)');
    if (data) setScheduleDays(prev => [...prev, ...data].sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start)));
    setNewDay({ start: '', end: '', technician_ids: [], lunch_minutes: 0 });
    setAddingDay(false);
    setSavingDay(false);
  }

  async function removeScheduleDay(dayId) {
    await supabase.from('job_schedule_days').delete().eq('id', dayId);
    setScheduleDays(prev => prev.filter(d => d.id !== dayId));
  }

  async function updateDayLunch(dayId, minutes) {
    setScheduleDays(prev => prev.map(d => d.id === dayId ? { ...d, lunch_minutes: minutes } : d));
    await supabase.from('job_schedule_days').update({ lunch_minutes: minutes }).eq('id', dayId);
  }

  function startEditDay(d) {
    setEditingDayId(d.id);
    setEditDayForm({
      start: isoToLocalInput(d.scheduled_start),
      end: isoToLocalInput(d.scheduled_end),
      technician_id: d.technician_id ?? '',
      lunch_minutes: d.lunch_minutes ?? 0,
    });
  }

  function cancelEditDay() {
    setEditingDayId(null);
  }

  async function saveEditDay(dayId) {
    if (!editDayForm.start) return;
    setSavingEditDay(true);
    const payload = {
      scheduled_start: localInputToIso(editDayForm.start),
      scheduled_end: editDayForm.end ? localInputToIso(editDayForm.end) : null,
      technician_id: editDayForm.technician_id || null,
      lunch_minutes: editDayForm.lunch_minutes,
    };
    const { data } = await supabase.from('job_schedule_days').update(payload).eq('id', dayId).select('*, technicians(name)').single();
    if (data) setScheduleDays(prev => prev.map(d => d.id === dayId ? data : d).sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start)));
    setEditingDayId(null);
    setSavingEditDay(false);
  }

  // Line items state
  const [lineItems, setLineItems] = useState(items);
  const [addingLine, setAddingLine] = useState(false);
  const [newLine, setNewLine] = useState({ type: 'labor', description: '', quantity: 1, unit_price: '', msrp: '', supplier_price: '', exempt: false, area: '', vendor: '', photoFile: null, photoPreview: null });
  const [catalogItems, setCatalogItems] = useState([]);
  const [showCableCalc, setShowCableCalc] = useState(false);

  useEffect(() => {
    supabase.from('catalog_items').select('*').order('item_code').then(({ data }) => setCatalogItems(data ?? []));
  }, []);

  const areaOptions = [...new Set(lineItems.map(i => i.area).filter(Boolean))];
  const vendorOptions = [...new Set(catalogItems.map(i => i.vendor).filter(Boolean))];

  function handleLineDescriptionSelect(value) {
    const match = catalogItems.find(c => `${c.item_code} — ${c.description}` === value);
    if (match) {
      setNewLine(l => ({ ...l, type: match.type, description: match.description, unit_price: match.price ?? '', msrp: match.msrp ?? '', supplier_price: match.supplier_price ?? '', vendor: l.vendor || match.vendor || '' }));
    } else {
      setNewLine(l => ({ ...l, description: value }));
    }
  }

  function addPrefilledLineItem(item) {
    setNewLine(l => ({ ...l, type: 'product', ...item }));
    setAddingLine(true);
  }
  const [savingLine, setSavingLine] = useState(false);
  const [editingLineId, setEditingLineId] = useState(null);
  const [editLineForm, setEditLineForm] = useState({});

  function startEditLine(item) {
    setEditingLineId(item.id);
    setEditLineForm({
      type: item.type,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      msrp: item.msrp ?? '',
      supplier_price: item.supplier_price ?? '',
      exempt: !!item.exempt_reason,
      area: item.area ?? '',
      vendor: item.vendor ?? '',
      photoFile: null,
      photoPreview: item.photo_signed_url ?? null,
    });
  }

  function handleEditLinePhoto(file) {
    if (!file) return;
    setEditLineForm(f => ({ ...f, photoFile: file, photoPreview: URL.createObjectURL(file) }));
  }

  function handleNewLinePhoto(file) {
    if (!file) return;
    setNewLine(l => ({ ...l, photoFile: file, photoPreview: URL.createObjectURL(file) }));
  }

  async function saveEditLine(id) {
    setSavingLine(true);
    let photoPath;
    let photoSignedUrl;
    if (editLineForm.photoFile) {
      const ext = editLineForm.photoFile.name.split('.').pop();
      const path = `${job.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, editLineForm.photoFile);
      if (!upErr) {
        photoPath = path;
        const { data: signed } = await supabase.storage.from('Job-photos').createSignedUrl(path, 3600);
        photoSignedUrl = signed?.signedUrl ?? null;
      }
    }
    await supabase.from('job_line_items').update({
      type: editLineForm.type,
      description: editLineForm.description.trim(),
      quantity: parseFloat(editLineForm.quantity) || 1,
      unit_price: parseFloat(editLineForm.unit_price) || 0,
      msrp: editLineForm.msrp !== '' ? parseFloat(editLineForm.msrp) : null,
      supplier_price: editLineForm.supplier_price !== '' ? parseFloat(editLineForm.supplier_price) : null,
      exempt_reason: editLineForm.exempt ? 'Exento' : null,
      area: editLineForm.area || null,
      vendor: editLineForm.vendor || null,
      ...(photoPath !== undefined ? { photo_url: photoPath } : {}),
    }).eq('id', id);
    setLineItems(prev => prev.map(i => i.id === id ? {
      ...i,
      type: editLineForm.type,
      description: editLineForm.description.trim(),
      quantity: parseFloat(editLineForm.quantity) || 1,
      unit_price: parseFloat(editLineForm.unit_price) || 0,
      msrp: editLineForm.msrp !== '' ? parseFloat(editLineForm.msrp) : null,
      supplier_price: editLineForm.supplier_price !== '' ? parseFloat(editLineForm.supplier_price) : null,
      exempt_reason: editLineForm.exempt ? 'Exento' : null,
      area: editLineForm.area || null,
      vendor: editLineForm.vendor || null,
      ...(photoPath !== undefined ? { photo_url: photoPath, photo_signed_url: photoSignedUrl } : {}),
    } : i));
    setEditingLineId(null);
    setSavingLine(false);
  }

  async function addLineItem() {
    if (!newLine.description.trim()) return;
    setSavingLine(true);
    let photoPath = null;
    if (newLine.photoFile) {
      const ext = newLine.photoFile.name.split('.').pop();
      const path = `${job.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, newLine.photoFile);
      if (!upErr) photoPath = path;
    }
    const { data } = await supabase.from('job_line_items').insert([{
      job_id: job.id,
      type: newLine.type,
      description: newLine.description.trim(),
      quantity: parseFloat(newLine.quantity) || 1,
      unit_price: parseFloat(newLine.unit_price) || 0,
      msrp: newLine.msrp !== '' ? parseFloat(newLine.msrp) : null,
      supplier_price: newLine.supplier_price !== '' ? parseFloat(newLine.supplier_price) : null,
      exempt_reason: newLine.exempt ? 'Exento' : null,
      area: newLine.area || null,
      vendor: newLine.vendor || null,
      photo_url: photoPath,
      sort_order: lineItems.length,
    }]).select().single();
    if (data) setLineItems(prev => [...prev, { ...data, photo_signed_url: newLine.photoPreview }]);
    setNewLine({ type: 'labor', description: '', quantity: 1, unit_price: '', msrp: '', supplier_price: '', exempt: false, area: '', vendor: '', photoFile: null, photoPreview: null });
    setAddingLine(false);
    setSavingLine(false);
  }

  async function deleteLineItem(itemId) {
    await supabase.from('job_line_items').delete().eq('id', itemId);
    setLineItems(prev => prev.filter(i => i.id !== itemId));
  }

  // Notes state
  const [notesList, setNotesList] = useState(notes);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [noteError, setNoteError] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const fileRef = useRef();
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [pendingPhotoPreviews, setPendingPhotoPreviews] = useState([]);

  // Expenses state — job-tied costs (material dañado, viaje extra, permisos, etc.)
  // that aren't already captured as a job_line_item / invoice line.
  const [expensesList, setExpensesList] = useState(initialExpenses);
  const [addingExpense, setAddingExpense] = useState(false);
  const [newExpense, setNewExpense] = useState({ category: 'materiales', description: '', vendor: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), photoFile: null, photoPreview: null });
  const [savingExpense, setSavingExpense] = useState(false);

  function handleExpensePhoto(file) {
    if (!file) return;
    setNewExpense(e => ({ ...e, photoFile: file, photoPreview: URL.createObjectURL(file) }));
  }

  async function addExpense() {
    if (!newExpense.description.trim() || !newExpense.amount) return;
    setSavingExpense(true);
    let receiptPath = null;
    if (newExpense.photoFile) {
      const ext = newExpense.photoFile.name.split('.').pop();
      const path = `${job.id}/expenses/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, newExpense.photoFile);
      if (!upErr) receiptPath = path;
    }
    const { data } = await supabase.from('expenses').insert([{
      job_id: job.id,
      category: newExpense.category,
      description: newExpense.description.trim(),
      vendor: newExpense.vendor.trim() || null,
      amount: parseFloat(newExpense.amount) || 0,
      expense_date: newExpense.expense_date,
      receipt_url: receiptPath,
    }]).select().single();
    if (data) setExpensesList(prev => [{ ...data, receipt_signed_url: newExpense.photoPreview }, ...prev]);
    setNewExpense({ category: 'materiales', description: '', vendor: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), photoFile: null, photoPreview: null });
    setAddingExpense(false);
    setSavingExpense(false);
  }

  async function deleteExpense(expenseId) {
    await supabase.from('expenses').delete().eq('id', expenseId);
    setExpensesList(prev => prev.filter(e => e.id !== expenseId));
  }

  const totalExpenses = expensesList.reduce((a, e) => a + Number(e.amount ?? 0), 0);

  // Lightbox state — { urls: [], index: 0, noteId }
  const [lightbox, setLightbox] = useState(null);
  const [annotatingIdx, setAnnotatingIdx] = useState(null);
  const [annotatingExisting, setAnnotatingExisting] = useState(null);

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

  async function updateBillTo(val) {
    setBillTo(val);
    await supabase.from('jobs').update({ bill_to: val }).eq('id', job.id);
    router.refresh();
  }

  async function deleteJob() {
    setDeleting(true);
    await supabase.from('job_line_items').delete().eq('job_id', job.id);
    await supabase.from('job_notes').delete().eq('job_id', job.id);
    await supabase.from('job_checklist_items').delete().eq('job_id', job.id);
    await supabase.from('expenses').delete().eq('job_id', job.id);
    await supabase.from('jobs').delete().eq('id', job.id);
    window.location.replace('/trabajos');
  }

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
    setNoteError('');

    const uploadedPaths = [];
    const failedNames = [];
    if (pendingPhotos.length > 0) {
      setUploadingPhoto(true);
      for (let i = 0; i < pendingPhotos.length; i++) {
        const file = pendingPhotos[i];
        const ext = file.name.split('.').pop();
        const path = `${job.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error } = await uploadFileWithProgress('Job-photos', path, file, pct => {
          setUploadProgress(prev => ({ ...prev, [i]: pct }));
        });
        if (!error) uploadedPaths.push(path);
        else failedNames.push(file.name);
      }
      setUploadingPhoto(false);
    }

    const { data: newNote } = await supabase.from('job_notes').insert([{
      job_id: job.id,
      note: noteText.trim() || null,
      photo_url: uploadedPaths[0] ?? null,
      photo_urls: uploadedPaths.length > 0 ? uploadedPaths : null,
    }]).select().single();

    if (newNote) {
      const signedUrls = await Promise.all(uploadedPaths.map(async p => {
        const { data } = await supabase.storage.from('Job-photos').createSignedUrl(p, 3600);
        return data?.signedUrl ?? null;
      }));
      setNotesList(prev => [{
        ...newNote,
        photo_urls: uploadedPaths.length > 0 ? signedUrls : null,
        photo_url: signedUrls[0] ?? null,
        raw_photo_urls: uploadedPaths.length > 0 ? uploadedPaths : null,
        raw_photo_url: uploadedPaths[0] ?? null,
      }, ...prev]);
    }
    if (failedNames.length > 0) {
      setNoteError(`No se pudo subir: ${failedNames.join(', ')}. La nota se guardó, intenta subir el archivo de nuevo.`);
    }
    setNoteText(''); setPendingPhotos([]); setPendingPhotoPreviews([]); setUploadProgress({}); setSavingNote(false);
  }

  function handleAnnotateSave(blob) {
    if (annotatingIdx === null) return;
    const file = new File([blob], pendingPhotos[annotatingIdx].name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
    const newUrl = URL.createObjectURL(blob);
    setPendingPhotos(prev => prev.map((f, i) => i === annotatingIdx ? file : f));
    setPendingPhotoPreviews(prev => prev.map((u, i) => i === annotatingIdx ? newUrl : u));
    setAnnotatingIdx(null);
  }

  async function handleAnnotateExistingSave(blob) {
    if (!annotatingExisting) return;
    const { noteId, path } = annotatingExisting;
    const { error } = await supabase.storage.from('Job-photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (!error) {
      const { data } = await supabase.storage.from('Job-photos').createSignedUrl(path, 3600);
      const signedUrl = data?.signedUrl ?? null;
      setNotesList(prev => prev.map(n => {
        if (n.id !== noteId) return n;
        if (annotatingExisting.isGallery) {
          const newUrls = [...n.photo_urls];
          newUrls[annotatingExisting.galleryIdx] = signedUrl;
          return { ...n, photo_urls: newUrls, photo_url: newUrls[0] };
        }
        return { ...n, photo_url: signedUrl };
      }));
    }
    setAnnotatingExisting(null);
  }

  async function deleteNote(noteId) {
    await supabase.from('job_notes').delete().eq('id', noteId);
    setNotesList(prev => prev.filter(n => n.id !== noteId));
  }

  async function toggleNotePin(noteId, pinned) {
    setNotesList(prev => prev.map(n => n.id === noteId ? { ...n, is_pinned: !pinned } : n));
    await supabase.from('job_notes').update({ is_pinned: !pinned }).eq('id', noteId);
  }

  async function saveNoteEdit(noteId) {
    const text = editingNoteText.trim() || null;
    await supabase.from('job_notes').update({ note: text }).eq('id', noteId);
    setNotesList(prev => prev.map(n => n.id === noteId ? { ...n, note: text } : n));
    setEditingNoteId(null);
    setEditingNoteText('');
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

  const TAX_RATES = { final_product: 0.115, final_labor: 0.115, b2b_product: 0.115, b2b_labor: 0.04 };
  const liveTotals = (() => {
    let subProd = 0, taxProd = 0, subLabor = 0, taxLabor = 0;
    lineItems.forEach(it => {
      const base = Number(it.quantity) * Number(it.unit_price);
      const rate = it.exempt_reason ? 0 : (TAX_RATES[`${clientType}_${it.type}`] ?? 0.115);
      if (it.type === 'product') { subProd += base; taxProd += base * rate; }
      else { subLabor += base; taxLabor += base * rate; }
    });
    return { subProd, taxProd, subLabor, taxLabor, total: subProd + taxProd + subLabor + taxLabor };
  })();

  const MARGIN_ALERT_THRESHOLD = 20; // margen % por debajo del cual se resalta el trabajo

  const profitability = (() => {
    const facturado = invoices.reduce((a, i) => a + Number(i.total ?? 0), 0);
    const invoiceIds = new Set(invoices.map(i => i.id));
    const cobrado = payments.filter(p => invoiceIds.has(p.invoice_id)).reduce((a, p) => a + Number(p.amount ?? 0), 0);
    const pendiente = Math.max(facturado - cobrado, 0);

    const materialesCosto = lineItems.reduce((a, it) => {
      if (it.supplier_price == null) return a;
      return a + Number(it.quantity ?? 0) * Number(it.supplier_price ?? 0);
    }, 0);

    const techRateById = {};
    technicians.forEach(t => { techRateById[t.id] = Number(t.hourly_rate ?? 0); });
    const hoursByTech = {};
    timeEntries.forEach(e => {
      const hrs = (new Date(e.clocked_out_at) - new Date(e.clocked_in_at)) / 3600000 - (e.lunch_minutes ?? 0) / 60;
      if (hrs <= 0) return;
      hoursByTech[e.technician_id] = (hoursByTech[e.technician_id] ?? 0) + hrs;
    });
    const laborRows = Object.entries(hoursByTech).map(([techId, hours]) => {
      const tech = technicians.find(t => t.id === techId);
      const rate = techRateById[techId] ?? 0;
      return { techId, name: tech?.name ?? 'Técnico', hours, rate, cost: hours * rate };
    }).sort((a, b) => b.cost - a.cost);
    const manoDeObraCosto = laborRows.reduce((a, r) => a + r.cost, 0);
    const totalHoras = laborRows.reduce((a, r) => a + r.hours, 0);

    const gananciaNeta = cobrado - materialesCosto - manoDeObraCosto - totalExpenses;
    const margenPct = cobrado > 0 ? (gananciaNeta / cobrado) * 100 : null;

    return { facturado, cobrado, pendiente, materialesCosto, laborRows, manoDeObraCosto, totalHoras, gastos: totalExpenses, gananciaNeta, margenPct };
  })();

  function hoursBetween(start, end, lunchMinutes = 0) {
    if (!start || !end) return 0;
    const diff = new Date(end) - new Date(start);
    const hrs = diff > 0 ? diff / 3600000 : 0;
    return Math.max(hrs - (lunchMinutes ?? 0) / 60, 0);
  }
  function formatHours(totalHours) {
    const h = Math.floor(totalHours);
    const m = Math.round((totalHours - h) * 60);
    if (h > 0 && m > 0) return `${h}h ${m}min`;
    if (h > 0) return `${h}h`;
    return `${m}min`;
  }
  const scheduleDayGroups = (() => {
    const map = {};
    scheduleDays.forEach(d => {
      const key = new Date(d.scheduled_start).toLocaleDateString('en-CA');
      if (!map[key]) map[key] = [];
      map[key].push(d);
    });
    return Object.keys(map).sort().map(key => ({
      key,
      entries: map[key],
      totalHours: map[key].reduce((sum, d) => sum + hoursBetween(d.scheduled_start, d.scheduled_end, d.lunch_minutes), 0),
    }));
  })();
  const scheduleDaysTotalHours = scheduleDays.reduce((sum, d) => sum + hoursBetween(d.scheduled_start, d.scheduled_end, d.lunch_minutes), 0);
  const primaryScheduleHours = hoursBetween(job.scheduled_start, job.scheduled_end);
  const grandTotalHours = primaryScheduleHours + scheduleDaysTotalHours;

  const sortedNotesList = [...notesList].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));

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
      <div style={{ display: 'flex', borderBottom: '1.5px solid var(--border)', marginBottom: 20, background: 'var(--surface)', borderRadius: '12px 12px 0 0', padding: '0 8px' }}>
        <button style={tabStyle('info')} onClick={() => setTab('info')}>📋 Info</button>
        <button style={tabStyle('notes')} onClick={() => setTab('notes')}>
          📸 Notas & Fotos {notesList.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{notesList.length}</span>}
        </button>
        <button style={tabStyle('checklist')} onClick={() => setTab('checklist')}>
          ✅ Checklist {realCount > 0 && <span style={{ background: progress === 100 ? '#e6f4ee' : 'var(--bg)', color: progress === 100 ? '#1a7a4a' : 'var(--muted)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{completedCount}/{realCount}</span>}
        </button>
        <button style={tabStyle('rentabilidad')} onClick={() => setTab('rentabilidad')}>
          💰 Rentabilidad {profitability.margenPct != null && profitability.margenPct < MARGIN_ALERT_THRESHOLD && (
            <span style={{ background: 'var(--danger-tint)', color: 'var(--warn)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>⚠</span>
          )}
        </button>
      </div>

      {/* ─── INFO TAB ─── */}
      {tab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Cliente</p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <a href={`/clientes/${job.client_id}`} style={{ color: 'var(--amber)', fontSize: 13, fontWeight: 600 }}>Ver cliente →</a>
                  {!editingClient && (
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditingClient(true)}>✏️ Editar</button>
                  )}
                </div>
              </div>
              {editingClient ? (
                <div>
                  <input list="job-client-picker-datalist" value={clientPickerSearch} onChange={e => setClientPickerSearch(e.target.value)}
                    placeholder="Escribe para buscar cliente..." style={{ marginBottom: 8 }} />
                  <datalist id="job-client-picker-datalist">
                    {allClients.map(c => <option key={c.id} value={`${c.name}${c.client_type === 'b2b' ? ' (B2B)' : ''}`} />)}
                  </datalist>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" style={{ fontSize: 13, padding: '6px 14px' }} disabled={savingClient} onClick={() => {
                      const match = allClients.find(c => `${c.name}${c.client_type === 'b2b' ? ' (B2B)' : ''}` === clientPickerSearch);
                      saveClientChange(match?.id);
                    }}>{savingClient ? 'Guardando...' : 'Guardar'}</button>
                    <button className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 14px' }} onClick={() => { setEditingClient(false); setClientPickerSearch(''); }}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{job.clients?.name}</div>
                  <span className={`badge ${job.clients?.client_type === 'b2b' ? 'badge-blue' : 'badge-gray'}`} style={{ marginBottom: 12, display: 'inline-block' }}>
                    {job.clients?.client_type === 'b2b' ? 'B2B' : 'Consumidor final'}
                  </span>
                  {(job.clients?.phone || job.clients?.email) && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                      {job.clients?.phone && <a href={`tel:${job.clients.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#1a7a4a', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>📞 {job.clients.phone}</a>}
                      {job.clients?.email && <a href={`mailto:${job.clients.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--navy)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>✉️ {job.clients.email}</a>}
                    </div>
                  )}
                </>
              )}
              {job.clients?.company && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>FACTURAR A</p>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input type="radio" name="bill_to" checked={billTo === 'person'} onChange={() => updateBillTo('person')} />
                      {job.clients.name}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input type="radio" name="bill_to" checked={billTo === 'company'} onChange={() => updateBillTo('company')} />
                      {job.clients.company}
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>👤 Contacto encargado</p>
                {!editingContact && (
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => {
                    setContactForm({ contact_name: job.contact_name ?? '', contact_phone: job.contact_phone ?? '', contact_email: job.contact_email ?? '' });
                    setContactSearch('');
                    setEditingContact(true);
                  }}>✏️ Editar</button>
                )}
              </div>
              {editingContact ? (
                <div>
                  {clientContacts.length > 0 && (
                    <div className="form-group" style={{ marginBottom: 10 }}>
                      <label>Buscar contacto del cliente</label>
                      <input list="job-contact-datalist" value={contactSearch} onChange={e => handleContactSearchChange(e.target.value)} placeholder="Escribe para buscar..." />
                      <datalist id="job-contact-datalist">
                        {clientContacts.map(c => <option key={c.id} value={contactLabel(c)} />)}
                      </datalist>
                    </div>
                  )}
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label>Nombre</label>
                    <input value={contactForm.contact_name} onChange={e => setContactForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Nombre del contacto" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label>Teléfono</label>
                    <input value={contactForm.contact_phone} onChange={e => setContactForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="787-000-0000" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label>Email</label>
                    <input type="email" value={contactForm.contact_email} onChange={e => setContactForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="contacto@email.com" />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-primary" onClick={saveContact} disabled={savingContact}>{savingContact ? 'Guardando...' : '💾 Guardar'}</button>
                    <button className="btn btn-ghost" onClick={() => setEditingContact(false)}>Cancelar</button>
                  </div>
                </div>
              ) : (job.contact_name || job.contact_phone || job.contact_email) ? (
                <div>
                  {job.contact_name && <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{job.contact_name}</div>}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {job.contact_phone && <a href={`tel:${job.contact_phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#1a7a4a', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>📞 {job.contact_phone}</a>}
                    {job.contact_email && <a href={`mailto:${job.contact_email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--navy)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>✉️ {job.contact_email}</a>}
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sin contacto asignado.</p>
              )}
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>📍 Propiedad</p>
                {!editingProperty && (
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => {
                    setPropertyForm({ property_id: job.property_id ?? '', property_name: job.property_name ?? '', street: job.street ?? '', city: job.city ?? '', state: job.state ?? 'PR', zip: job.zip ?? '' });
                    setPropertySearch('');
                    setEditingProperty(true);
                  }}>✏️ Editar</button>
                )}
              </div>
              {editingProperty ? (
                <div>
                  {clientProperties.length > 0 && (
                    <div className="form-group" style={{ marginBottom: 10 }}>
                      <label>Buscar propiedad del cliente</label>
                      <input list="job-property-datalist" value={propertySearch} onChange={e => handlePropertySearchChange(e.target.value)} placeholder="Escribe para buscar..." />
                      <datalist id="job-property-datalist">
                        {clientProperties.map(p => <option key={p.id} value={propertyLabel(p)} />)}
                      </datalist>
                    </div>
                  )}
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label>Nombre de la propiedad</label>
                    <input value={propertyForm.property_name} onChange={e => setPropertyForm(f => ({ ...f, property_name: e.target.value }))} placeholder="Ej: Oficina Principal" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label>Calle (puedes pegar un link de Google Maps, Apple Maps o Waze aquí)</label>
                    <input value={propertyForm.street} onChange={e => setPropertyForm(f => ({ ...f, street: e.target.value }))} placeholder="Calle y número" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 10, marginBottom: 10 }}>
                    <div className="form-group">
                      <label>Ciudad</label>
                      <input value={propertyForm.city} onChange={e => setPropertyForm(f => ({ ...f, city: e.target.value }))} placeholder="San Juan" />
                    </div>
                    <div className="form-group">
                      <label>Estado</label>
                      <input value={propertyForm.state} onChange={e => setPropertyForm(f => ({ ...f, state: e.target.value }))} placeholder="PR" />
                    </div>
                    <div className="form-group">
                      <label>Zip</label>
                      <input value={propertyForm.zip} onChange={e => setPropertyForm(f => ({ ...f, zip: e.target.value }))} placeholder="00901" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-primary" onClick={saveProperty} disabled={savingProperty}>{savingProperty ? 'Guardando...' : '💾 Guardar'}</button>
                    <button className="btn btn-ghost" onClick={() => setEditingProperty(false)}>Cancelar</button>
                  </div>
                </div>
              ) : (job.street || job.city || job.property_name) ? (
                <div>
                  {job.property_name && <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{job.property_name}</div>}
                  {job.street && <div style={{ fontSize: 14, color: 'var(--muted)' }}>{job.street}</div>}
                  {job.city && <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 10 }}>{job.city}{job.state ? `, ${job.state}` : ''}{job.zip ? ` ${job.zip}` : ''}</div>}
                  {(job.street || job.city) && (() => {
                    const links = buildMapsLinks(job.street, job.city, job.state, job.zip);
                    if (links.direct) {
                      return (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <a href={links.direct} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🗺️ Abrir ubicación</a>
                        </div>
                      );
                    }
                    return (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <a href={links.google} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🗺️ Google Maps</a>
                        <a href={links.apple} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#000', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🍎 Apple Maps</a>
                        <a href={links.waze} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#33CCFF', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🚗 Waze</a>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sin propiedad asignada.</p>
              )}
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Detalles</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!editingDetails && (
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditingDetails(true)}>✏️ Título/Desc.</button>
                  )}
                  {!editingNumber && (
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditingNumber(true)}>✏️ # Job</button>
                  )}
                  {!editingSchedule && (
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditingSchedule(true)}>✏️ Editar fechas</button>
                  )}
                </div>
              </div>
              {editingDetails && (
                <div style={{ marginBottom: 12, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label>Título del trabajo</label>
                    <input value={titleForm} onChange={e => setTitleForm(e.target.value)} placeholder="Título del trabajo" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label>Descripción</label>
                    <textarea value={descForm} onChange={e => setDescForm(e.target.value)} placeholder="Descripción del trabajo..." rows={3} />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-primary" onClick={saveDetails} disabled={savingDetails}>{savingDetails ? 'Guardando...' : '💾 Guardar'}</button>
                    <button className="btn btn-ghost" onClick={() => { setEditingDetails(false); setTitleForm(job.title ?? ''); setDescForm(job.description ?? ''); }}>Cancelar</button>
                  </div>
                </div>
              )}
              {editingNumber && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
                  <input value={jobNumber} onChange={e => setJobNumber(e.target.value)} placeholder="JOB-1001" style={{ flex: 1, padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'monospace' }} />
                  <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={saveJobNumber} disabled={savingNumber}>{savingNumber ? '...' : '💾'}</button>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setEditingNumber(false)}>✕</button>
                </div>
              )}
              {job.description && <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 12 }}>{job.description}</p>}
              {editingSchedule ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div className="form-group">
                      <label>Inicio</label>
                      <input type="datetime-local" value={schedStart} onChange={e => setSchedStart(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Fin</label>
                      <input type="datetime-local" value={schedEnd} onChange={e => setSchedEnd(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-primary" onClick={saveSchedule} disabled={savingSchedule}>
                      {savingSchedule ? 'Guardando...' : '💾 Guardar'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setEditingSchedule(false)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {job.scheduled_start && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Inicio</div>
                        <div style={{ fontSize: 14 }} suppressHydrationWarning>{new Date(job.scheduled_start).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    )}
                    {job.scheduled_end && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Fin</div>
                        <div style={{ fontSize: 14 }} suppressHydrationWarning>{new Date(job.scheduled_end).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    )}
                    {!job.scheduled_start && !job.scheduled_end && (
                      <p style={{ color: 'var(--muted)', fontSize: 13, gridColumn: '1/-1' }}>Sin fecha programada.</p>
                    )}
                  </div>
                  {job.scheduled_start && job.scheduled_end && (
                    <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', borderRadius: 8, padding: '6px 12px' }}>
                      <span style={{ fontSize: 13 }}>⏱</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{formatHours(primaryScheduleHours)} de trabajo</span>
                    </div>
                  )}
                  {scheduleDays.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', borderRadius: 8, padding: '6px 12px' }}>
                        <span style={{ fontSize: 13 }}>📅</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{scheduleDayGroups.length} {scheduleDayGroups.length === 1 ? 'día adicional' : 'días adicionales'}</span>
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', borderRadius: 8, padding: '6px 12px' }}>
                        <span style={{ fontSize: 13 }}>⏱</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{formatHours(grandTotalHours)} en total</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {job.notes && (
                <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 13, color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--navy)' }}>Notas:</strong> {job.notes}
                </div>
              )}
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Días de trabajo</p>
                {!addingDay && (
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setAddingDay(true)}>+ Añadir día</button>
                )}
              </div>

              {scheduleDays.length === 0 && !addingDay && (
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sin días adicionales. Usa "+ Añadir día" para agendar más visitas a este trabajo.</p>
              )}

              {scheduleDays.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: addingDay ? 14 : 0 }}>
                  {scheduleDayGroups.map(group => (
                    <div key={group.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }} suppressHydrationWarning>
                          {new Date(group.entries[0].scheduled_start).toLocaleDateString('es-PR', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>{formatHours(group.totalHours)} total</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {group.entries.map(d => (
                          editingDayId === d.id ? (
                            <div key={d.id} style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                                <div className="form-group">
                                  <label>Inicio</label>
                                  <input type="datetime-local" value={editDayForm.start} onChange={e => setEditDayForm(f => ({ ...f, start: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                  <label>Fin</label>
                                  <input type="datetime-local" value={editDayForm.end} onChange={e => setEditDayForm(f => ({ ...f, end: e.target.value }))} />
                                </div>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                <div className="form-group">
                                  <label>Técnico</label>
                                  <select value={editDayForm.technician_id ?? ''} onChange={e => setEditDayForm(f => ({ ...f, technician_id: e.target.value }))}>
                                    <option value="">— Sin asignar —</option>
                                    {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                  </select>
                                </div>
                                <div className="form-group">
                                  <label>Almuerzo</label>
                                  <select value={editDayForm.lunch_minutes} onChange={e => setEditDayForm(f => ({ ...f, lunch_minutes: parseInt(e.target.value) }))}>
                                    <option value={0}>Sin almuerzo</option>
                                    <option value={30}>30 min</option>
                                    <option value={45}>45 min</option>
                                    <option value={60}>60 min</option>
                                  </select>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 10 }}>
                                <button className="btn btn-primary" onClick={() => saveEditDay(d.id)} disabled={savingEditDay || !editDayForm.start}>{savingEditDay ? 'Guardando...' : '💾 Guardar'}</button>
                                <button className="btn btn-ghost" onClick={cancelEditDay}>Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600 }} suppressHydrationWarning>
                                  {new Date(d.scheduled_start).toLocaleString('es-PR', { hour: '2-digit', minute: '2-digit' })}
                                  {d.scheduled_end && ` – ${new Date(d.scheduled_end).toLocaleString('es-PR', { hour: '2-digit', minute: '2-digit' })}`}
                                  {d.scheduled_end && <span style={{ color: 'var(--muted)', fontWeight: 500 }}> ({formatHours(hoursBetween(d.scheduled_start, d.scheduled_end, d.lunch_minutes))})</span>}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{d.technicians?.name ?? '— Sin asignar —'}</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <select value={d.lunch_minutes ?? 0} onChange={e => updateDayLunch(d.id, parseInt(e.target.value))}
                                  style={{ fontSize: 12, padding: '4px 6px', border: '1.5px solid var(--border)', borderRadius: 6, color: 'var(--muted)' }}>
                                  <option value={0}>🍽️ Sin almuerzo</option>
                                  <option value={30}>🍽️ 30 min</option>
                                  <option value={45}>🍽️ 45 min</option>
                                  <option value={60}>🍽️ 60 min</option>
                                </select>
                                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => startEditDay(d)}>✏️</button>
                                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px', color: 'var(--warn)' }} onClick={() => removeScheduleDay(d.id)}>🗑</button>
                              </div>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {addingDay && (
                <div style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                    <div className="form-group">
                      <label>Inicio</label>
                      <input type="datetime-local" value={newDay.start} onChange={e => setNewDay(d => ({ ...d, start: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>Fin</label>
                      <input type="datetime-local" value={newDay.end} onChange={e => setNewDay(d => ({ ...d, end: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label>Almuerzo</label>
                    <select value={newDay.lunch_minutes} onChange={e => setNewDay(d => ({ ...d, lunch_minutes: parseInt(e.target.value) }))}>
                      <option value={0}>Sin almuerzo</option>
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>60 min</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label>Técnicos (puedes escoger más de uno)</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {technicians.map(t => {
                        const checked = newDay.technician_ids.includes(t.id);
                        return (
                          <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: checked ? 'var(--navy)' : '#fff', color: checked ? '#fff' : 'var(--navy)', border: '1.5px solid var(--border)', borderRadius: 20, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleNewDayTechnician(t.id)} style={{ margin: 0 }} />
                            {t.name}
                          </label>
                        );
                      })}
                      {technicians.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 12 }}>No hay técnicos registrados.</p>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-primary" onClick={addScheduleDay} disabled={savingDay || !newDay.start}>{savingDay ? 'Guardando...' : '💾 Guardar'}</button>
                    <button className="btn btn-ghost" onClick={() => { setAddingDay(false); setNewDay({ start: '', end: '', technician_ids: [] }); }}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Líneas de trabajo</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => exportPurchaseListCSV(lineItems, job.job_number)}>📦 Lista de compra</button>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setShowCableCalc(true)}>🧮 Calcular cable/tubo</button>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setAddingLine(true)}>+ Agregar línea</button>
                </div>
              </div>
              {!lineItems?.length ? <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: addingLine ? 14 : 0 }}>Sin líneas.</p> : (
                lineItems.map(it => (
                  editingLineId === it.id ? (
                    <LineItemRow
                      key={it.id}
                      type={editLineForm.type}
                      onTypeChange={v => setEditLineForm(f => ({ ...f, type: v }))}
                      description={editLineForm.description}
                      onDescriptionChange={value => {
                        const match = catalogItems.find(c => `${c.item_code} — ${c.description}` === value);
                        if (match) setEditLineForm(f => ({ ...f, type: match.type, description: match.description, unit_price: match.price ?? '', msrp: match.msrp ?? '', supplier_price: match.supplier_price ?? '' }));
                        else setEditLineForm(f => ({ ...f, description: value }));
                      }}
                      catalogOptions={catalogItems.filter(c => c.type === editLineForm.type)}
                      datalistId="job-catalog-edit"
                      quantity={editLineForm.quantity}
                      onQuantityChange={v => setEditLineForm(f => ({ ...f, quantity: v }))}
                      msrp={editLineForm.msrp}
                      onMsrpChange={v => setEditLineForm(f => ({ ...f, msrp: v }))}
                      unitPrice={editLineForm.unit_price}
                      onUnitPriceChange={v => setEditLineForm(f => ({ ...f, unit_price: v }))}
                      supplierPrice={editLineForm.supplier_price}
                      onSupplierPriceChange={v => setEditLineForm(f => ({ ...f, supplier_price: v }))}
                      exempt={editLineForm.exempt}
                      onExemptChange={v => setEditLineForm(f => ({ ...f, exempt: v }))}
                      area={editLineForm.area}
                      onAreaChange={v => setEditLineForm(f => ({ ...f, area: v }))}
                      areaOptions={areaOptions}
                      vendor={editLineForm.vendor}
                      onVendorChange={v => setEditLineForm(f => ({ ...f, vendor: v }))}
                      vendorOptions={vendorOptions}
                      photoUrl={editLineForm.photoPreview}
                      onPhotoSelect={handleEditLinePhoto}
                      fmt={fmt}
                      actions={
                        <>
                          <button onClick={() => saveEditLine(it.id)} disabled={savingLine} className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 11 }}>💾</button>
                          <button onClick={() => setEditingLineId(null)} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }}>✕</button>
                        </>
                      }
                    />
                  ) : (
                    <LineItemRow
                      key={it.id}
                      viewMode
                      type={it.type}
                      description={it.description}
                      quantity={it.quantity}
                      msrp={it.msrp}
                      unitPrice={it.unit_price}
                      supplierPrice={it.supplier_price}
                      exempt={!!it.exempt_reason}
                      photoUrl={it.photo_signed_url}
                      fmt={fmt}
                      actions={
                        <>
                          <button onClick={() => startEditLine(it)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, padding: '2px 6px' }}>✏️</button>
                          <button onClick={() => deleteLineItem(it.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: '2px 6px' }}>×</button>
                        </>
                      }
                    />
                  )
                ))
              )}
              {addingLine && (
                <LineItemRow
                  type={newLine.type}
                  onTypeChange={v => setNewLine(l => ({ ...l, type: v }))}
                  description={newLine.description}
                  onDescriptionChange={handleLineDescriptionSelect}
                  catalogOptions={catalogItems.filter(c => c.type === newLine.type)}
                  datalistId="job-catalog"
                  quantity={newLine.quantity}
                  onQuantityChange={v => setNewLine(l => ({ ...l, quantity: v }))}
                  msrp={newLine.msrp}
                  onMsrpChange={v => setNewLine(l => ({ ...l, msrp: v }))}
                  unitPrice={newLine.unit_price}
                  onUnitPriceChange={v => setNewLine(l => ({ ...l, unit_price: v }))}
                  supplierPrice={newLine.supplier_price}
                  onSupplierPriceChange={v => setNewLine(l => ({ ...l, supplier_price: v }))}
                  exempt={newLine.exempt}
                  onExemptChange={v => setNewLine(l => ({ ...l, exempt: v }))}
                  area={newLine.area}
                  onAreaChange={v => setNewLine(l => ({ ...l, area: v }))}
                  areaOptions={areaOptions}
                  vendor={newLine.vendor}
                  onVendorChange={v => setNewLine(l => ({ ...l, vendor: v }))}
                  vendorOptions={vendorOptions}
                  photoUrl={newLine.photoPreview}
                  onPhotoSelect={handleNewLinePhoto}
                  fmt={fmt}
                  actions={
                    <button onClick={addLineItem} disabled={savingLine} style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                      {savingLine ? '...' : '✓'}
                    </button>
                  }
                />
              )}
              {addingLine && (
                <button onClick={() => setAddingLine(false)} style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
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
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Técnicos asignados</p>
              {assignedTechs.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>Sin técnicos asignados.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {assignedTechs.map(at => (
                    <div key={at.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{at.technicians?.name}</span>
                      <button onClick={() => removeTechnician(at.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warn)', fontSize: 14 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={addingTech} onChange={e => setAddingTech(e.target.value)} style={{ flex: 1, padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
                  <option value="">— Agregar técnico —</option>
                  {technicians.filter(t => !assignedTechs.some(at => at.technician_id === t.id)).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button onClick={() => addTechnician(addingTech)} disabled={!addingTech || savingTech} className="btn btn-primary" style={{ fontSize: 13, padding: '8px 14px' }}>
                  {savingTech ? '...' : '+'}
                </button>
              </div>
            </div>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Resumen IVU</p>
              {clientType === 'b2b' && <div style={{ background: 'var(--info-tint)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--info)', fontWeight: 600 }}>Cliente B2B — Labor al 4%</div>}
              {[
                { label: 'Subtotal productos', value: liveTotals.subProd },
                { label: 'IVU productos (11.5%)', value: liveTotals.taxProd },
                { label: 'Subtotal labor', value: liveTotals.subLabor },
                { label: `IVU labor (${clientType === 'b2b' ? '4%' : '11.5%'})`, value: liveTotals.taxLabor },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)' }}>{r.label}</span><span>{fmt(r.value)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 18, fontWeight: 900, color: 'var(--navy)' }}>
                <span>Total</span><span>{fmt(liveTotals.total)}</span>
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
              {pendingPhotoPreviews.length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  {pendingPhotoPreviews.map((preview, idx) => (
                    <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                      {pendingPhotos[idx]?.type?.startsWith('video') ? (
                        <video src={preview} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10, background: '#000' }} />
                      ) : (
                        <>
                          <img src={preview} alt="preview" onClick={() => setAnnotatingIdx(idx)} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10, cursor: 'pointer' }} />
                          <button type="button" onClick={() => setAnnotatingIdx(idx)}
                            style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✏️ Marcar</button>
                        </>
                      )}
                      {uploadingPhoto && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', borderRadius: '0 0 10px 10px', padding: '4px 6px' }}>
                          <div style={{ background: 'rgba(255,255,255,0.3)', borderRadius: 20, height: 5, overflow: 'hidden' }}>
                            <div style={{ background: 'var(--amber)', height: '100%', width: `${uploadProgress[idx] ?? 0}%`, transition: 'width 0.2s' }} />
                          </div>
                          <div style={{ color: '#fff', fontSize: 10, fontWeight: 700, textAlign: 'center', marginTop: 2 }}>{uploadProgress[idx] ?? 0}%</div>
                        </div>
                      )}
                      {!uploadingPhoto && (
                        <button type="button" onClick={() => {
                          setPendingPhotos(prev => prev.filter((_, i) => i !== idx));
                          setPendingPhotoPreviews(prev => prev.filter((_, i) => i !== idx));
                        }}
                          style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', fontSize: 14 }}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {noteError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
                  ⚠️ {noteError}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*,video/*,application/pdf" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>📷 Foto / Video{pendingPhotos.length > 0 ? ` (${pendingPhotos.length})` : ''}</button>
                <button type="submit" className="btn btn-primary" disabled={savingNote || uploadingPhoto} style={{ flex: 1, justifyContent: 'center' }}>
                  {uploadingPhoto ? 'Subiendo...' : savingNote ? 'Guardando...' : '💾 Guardar'}
                </button>
              </div>
            </form>
          </div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>
                💸 Gastos del trabajo {expensesList.length > 0 && <span style={{ color: 'var(--muted)', fontWeight: 600 }}>— {fmt(totalExpenses)}</span>}
              </p>
              {!addingExpense && (
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setAddingExpense(true)}>+ Agregar gasto</button>
              )}
            </div>

            {addingExpense && (
              <div style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 8, marginBottom: expensesList.length > 0 ? 14 : 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div className="form-group">
                    <label>Categoría</label>
                    <select value={newExpense.category} onChange={e => setNewExpense(f => ({ ...f, category: e.target.value }))}>
                      {expenseCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Fecha</label>
                    <input type="date" value={newExpense.expense_date} onChange={e => setNewExpense(f => ({ ...f, expense_date: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label>Descripción</label>
                  <input value={newExpense.description} onChange={e => setNewExpense(f => ({ ...f, description: e.target.value }))} placeholder="Ej: Cable THHN 12AWG, gasolina, permiso..." />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div className="form-group">
                    <label>Suplidor (opcional)</label>
                    <input value={newExpense.vendor} onChange={e => setNewExpense(f => ({ ...f, vendor: e.target.value }))} placeholder="Ej: Home Depot" />
                  </div>
                  <div className="form-group">
                    <label>Monto</label>
                    <input type="number" step="0.01" value={newExpense.amount} onChange={e => setNewExpense(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                  </div>
                </div>
                {newExpense.photoPreview && (
                  <img src={newExpense.photoPreview} alt="recibo" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, marginBottom: 10 }} />
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                    📷 Recibo
                    <input type="file" accept="image/*" onChange={e => handleExpensePhoto(e.target.files?.[0])} style={{ display: 'none' }} />
                  </label>
                  <button className="btn btn-primary" onClick={addExpense} disabled={savingExpense || !newExpense.description.trim() || !newExpense.amount}>
                    {savingExpense ? 'Guardando...' : '💾 Guardar'}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setAddingExpense(false)}>Cancelar</button>
                </div>
              </div>
            )}

            {expensesList.length === 0 && !addingExpense ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sin gastos registrados para este trabajo.</p>
            ) : expensesList.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {expensesList.map(e => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {e.receipt_signed_url && (
                        <img src={e.receipt_signed_url} alt="recibo" onClick={() => setLightbox({ urls: [e.receipt_signed_url], index: 0, noteId: null })} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in' }} />
                      )}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{e.description}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {expenseCategories.find(c => c.value === e.category)?.label ?? e.category}{e.vendor ? ` · ${e.vendor}` : ''} · {e.expense_date}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{fmt(e.amount)}</span>
                      <button onClick={() => deleteExpense(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {sortedNotesList.length === 0 ? (
            <div className="empty"><p>No hay notas aún.</p></div>
          ) : sortedNotesList.map(n => (
            <div key={n.id} className="card" style={{ marginBottom: 12, ...(n.is_pinned ? { border: '1.5px solid var(--amber)', background: '#fffaf0' } : {}) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: n.photo_url || n.note ? 10 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }} suppressHydrationWarning>
                  {n.is_pinned && <span title="Pineada">📌</span>}
                  {new Date(n.created_at).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => toggleNotePin(n.id, n.is_pinned)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: n.is_pinned ? 'var(--amber)' : 'var(--muted)', fontSize: 15 }} title={n.is_pinned ? 'Despinear' : 'Pinear'}>
                    📌
                  </button>
                  {editingNoteId !== n.id && (
                    <button onClick={() => { setEditingNoteId(n.id); setEditingNoteText(n.note ?? ''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 15 }}>✏️</button>
                  )}
                  <button onClick={() => deleteNote(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>🗑</button>
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
                        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Ver PDF</span>
                      </a>
                    );
                    return isVideo ? (
                      <video key={idx} src={url} controls style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 8, background: '#000' }} />
                    ) : (
                      <img key={idx} src={url} alt="job photo" onClick={() => setLightbox({ urls: n.photo_urls, index: idx, noteId: n.id })}
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
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>Ver documento PDF</span>
                  </a>
                );
                return isVideo ? (
                  <video src={n.photo_url} controls style={{ width: '100%', maxHeight: 300, borderRadius: 10, marginBottom: n.note ? 10 : 0, background: '#000' }} />
                ) : (
                  <img src={n.photo_url} alt="job photo" onClick={() => setLightbox({ urls: [n.photo_url], index: 0, noteId: n.id })}
                    style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 10, marginBottom: n.note ? 10 : 0, cursor: 'zoom-in' }} />
                );
              })()}
              {editingNoteId === n.id ? (
                <div>
                  <textarea autoFocus value={editingNoteText} onChange={e => setEditingNoteText(e.target.value)} rows={3}
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 8 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" style={{ fontSize: 13, padding: '5px 12px' }} onClick={() => saveNoteEdit(n.id)}>Guardar</button>
                    <button className="btn btn-ghost" style={{ fontSize: 13, padding: '5px 12px' }} onClick={() => { setEditingNoteId(null); setEditingNoteText(''); }}>Cancelar</button>
                  </div>
                </div>
              ) : n.note && <p style={{ fontSize: 14, color: 'var(--text)', margin: 0 }}>{n.note}</p>}
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
                            <div style={{ position: 'absolute', right: 0, top: 28, background: 'var(--surface)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: '1px solid var(--border)', zIndex: 99, minWidth: 160, overflow: 'hidden' }}>
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
                        <div style={{ position: 'absolute', right: 0, top: 28, background: 'var(--surface)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: '1px solid var(--border)', zIndex: 99, minWidth: 160, overflow: 'hidden' }}>
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
                      style={{ width: 24, height: 24, borderRadius: '50%', border: item.completed ? 'none' : '2px solid #ccc', background: item.completed ? '#1a7a4a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginTop: 1 }}>
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

      {/* ─── RENTABILIDAD TAB ─── */}
      {tab === 'rentabilidad' && (
        <div style={{ maxWidth: 760 }}>
          {profitability.margenPct != null && profitability.margenPct < MARGIN_ALERT_THRESHOLD && (
            <div style={{ background: 'var(--danger-tint)', color: 'var(--warn)', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
              ⚠ Margen bajo ({profitability.margenPct.toFixed(0)}%) — por debajo del {MARGIN_ALERT_THRESHOLD}% recomendado.
            </div>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Facturación</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Facturado</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>{fmt(profitability.facturado)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Cobrado</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ok)' }}>{fmt(profitability.cobrado)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Pendiente</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--amber)' }}>{fmt(profitability.pendiente)}</div>
              </div>
            </div>
            {invoices.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Este trabajo aún no tiene facturas.</div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Costos</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Materiales</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--warn)' }}>{fmt(profitability.materialesCosto)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Mano de obra ({formatHours(profitability.totalHoras)})</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--warn)' }}>{fmt(profitability.manoDeObraCosto)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Gastos</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--warn)' }}>{fmt(profitability.gastos)}</div>
              </div>
            </div>
          </div>

          {profitability.laborRows.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Mano de obra por técnico</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                    <th style={{ paddingBottom: 8 }}>Técnico</th>
                    <th style={{ paddingBottom: 8 }}>Horas</th>
                    <th style={{ paddingBottom: 8 }}>Tarifa/hr</th>
                    <th style={{ paddingBottom: 8, textAlign: 'right' }}>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {profitability.laborRows.map(r => (
                    <tr key={r.techId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 0' }}>{r.name}</td>
                      <td style={{ padding: '8px 0' }}>{formatHours(r.hours)}</td>
                      <td style={{ padding: '8px 0' }}>{fmt(r.rate)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700 }}>{fmt(r.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card" style={{ background: 'var(--bg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Ganancia neta (sobre lo cobrado)</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: profitability.gananciaNeta >= 0 ? 'var(--ok)' : 'var(--warn)' }}>
                {fmt(profitability.gananciaNeta)} {profitability.margenPct != null ? `(${profitability.margenPct.toFixed(0)}%)` : ''}
              </div>
            </div>
          </div>
        </div>
      )}

      {annotatingIdx !== null && pendingPhotoPreviews[annotatingIdx] && (
        <PhotoAnnotator
          imageUrl={pendingPhotoPreviews[annotatingIdx]}
          onSave={handleAnnotateSave}
          onCancel={() => setAnnotatingIdx(null)}
        />
      )}

      {annotatingExisting && (
        <PhotoAnnotator
          imageUrl={annotatingExisting.url}
          onSave={handleAnnotateExistingSave}
          onCancel={() => setAnnotatingExisting(null)}
        />
      )}

      {/* Lightbox with carousel */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, cursor: 'zoom-out' }}>
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 28, borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>×</button>

          {lightbox.noteId && (
            <button onClick={e => {
              e.stopPropagation();
              const note = notesList.find(n => n.id === lightbox.noteId);
              const isGallery = note.raw_photo_urls && note.raw_photo_urls.length > 1;
              setAnnotatingExisting({
                noteId: lightbox.noteId,
                url: lightbox.urls[lightbox.index],
                path: isGallery ? note.raw_photo_urls[lightbox.index] : note.raw_photo_url,
                isGallery,
                galleryIdx: lightbox.index,
              });
            }}
              style={{ position: 'absolute', top: 20, left: 24, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, borderRadius: 20, padding: '10px 18px', cursor: 'pointer', zIndex: 2 }}>✏️ Editar</button>
          )}

          {lightbox.urls.length > 1 && (
            <div style={{ position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)', color: '#fff', fontSize: 14, fontWeight: 600, background: 'rgba(255,255,255,0.15)', padding: '4px 14px', borderRadius: 20 }}>
              {lightbox.index + 1} / {lightbox.urls.length}
            </div>
          )}

          {lightbox.urls.length > 1 && lightbox.index > 0 && (
            <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: l.index - 1 })); }}
              style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 26, borderRadius: '50%', width: 48, height: 48, cursor: 'pointer', zIndex: 2 }}>‹</button>
          )}

          <img src={lightbox.urls[lightbox.index]} alt="full" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} />

          {lightbox.urls.length > 1 && lightbox.index < lightbox.urls.length - 1 && (
            <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: l.index + 1 })); }}
              style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 26, borderRadius: '50%', width: 48, height: 48, cursor: 'pointer', zIndex: 2 }}>›</button>
          )}
        </div>
      )}

      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar trabajo?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Esta acción es permanente.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteJob} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger-tint)', color: 'var(--warn)', border: 'none' }}>
                {deleting ? 'Eliminando...' : '🗑 Sí, eliminar'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showCableCalc && (
        <CableCalculator
          areaOptions={areaOptions}
          vendorOptions={vendorOptions}
          onAdd={item => { addPrefilledLineItem(item); setShowCableCalc(false); }}
          onClose={() => setShowCableCalc(false)}
        />
      )}
    </div>
  );
}
