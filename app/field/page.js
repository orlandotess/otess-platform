'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import PhotoAnnotator from '../PhotoAnnotator';
import { buildMapsLinks, pickMapsLink } from '../../lib/mapsLinks';
import { normalizeName } from '../../lib/normalizeName';
import { uploadFileWithProgress } from '../../lib/uploadWithProgress';

const ORANGE = '#E05C2A';
const AMBER = '#e0972c';
const BG = '#EAEEF2';
// Same status color/icon language as the office Sidebar/badges — a technician and an
// office user should see the exact same color for "atrasado", "programado", etc.
const ICON_PATHS = {
  home: <><path d="M4 11 L12 4 L20 11"/><path d="M6 10 V20 h5 v-6 h2 v6 h5 V10"/></>,
  jobs: <><rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2.5" width="6" height="3" rx="1"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></>,
  time: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5 v4.5 l3 2"/></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></>,
  projects: <><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></>,
  clientes: <><circle cx="9" cy="8" r="3.2"/><path d="M3 20 a 6 6 0 0 1 12 0"/><circle cx="17.5" cy="8.5" r="2.3"/><path d="M15.5 13.7 a 5.2 5.2 0 0 1 5.5 5.3"/></>,
};
function FieldIcon({ name }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name] || null}
    </svg>
  );
}
const JOB_FIELDS = 'id, title, status, scheduled_start, scheduled_end, street, city, state, zip, property_name, contact_name, contact_phone, contact_email, clients(name, phone, email)';
const EXPENSE_CATEGORIES = [
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
function blankExpenseForm() {
  return { category: 'materiales', description: '', vendor: '', amount: '', expense_date: new Date().toISOString().slice(0, 10) };
}


// Extra non-consecutive work days (job_schedule_days) can carry their own technician
// and date, independent of the job's main scheduled_start/technician_id assignment.
async function fetchScheduleDayJobs(techId) {
  const { data } = await supabase
    .from('job_schedule_days')
    .select(`id, scheduled_start, scheduled_end, jobs(${JOB_FIELDS})`)
    .eq('technician_id', techId);
  return (data ?? [])
    .filter(d => d.jobs)
    .map(d => ({ ...d.jobs, scheduled_start: d.scheduled_start, scheduled_end: d.scheduled_end, _scheduleDayId: d.id }));
}

export default function FieldApp() {
  const [tab, setTab] = useState('home');
  const [jobs, setJobs] = useState([]);
  const [jobFilter, setJobFilter] = useState('today');
  const [jobSearch, setJobSearch] = useState('');
  const [clockedIn, setClockedIn] = useState(false);
  const [activeEntry, setActiveEntry] = useState(null);
  const [timeEntries, setTimeEntries] = useState([]);
  const [techId, setTechId] = useState(null);
  const [techName, setTechName] = useState('OTESS');
  const [profileId, setProfileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [showFab, setShowFab] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showJobClock, setShowJobClock] = useState(false);
  const [showJobNote, setShowJobNote] = useState(false);
  const [showJobPhoto, setShowJobPhoto] = useState(false);
  const [fabSelectedJob, setFabSelectedJob] = useState(null);
  const [fabNoteText, setFabNoteText] = useState('');
  const [savingFabNote, setSavingFabNote] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [fabUploadProgress, setFabUploadProgress] = useState(0);
  const [photoError, setPhotoError] = useState('');
  const [photoSuccess, setPhotoSuccess] = useState('');
  const [allJobs, setAllJobs] = useState([]);
  const fileRef = useRef();

  // General/job expense (FAB) — job optional, blank job = gasto general
  const [showJobExpense, setShowJobExpense] = useState(false);
  const [expenseJob, setExpenseJob] = useState(undefined); // undefined = choosing target, null = general, job = job-tied
  const [expenseForm, setExpenseForm] = useState(blankExpenseForm());
  const [expensePhotoFile, setExpensePhotoFile] = useState(null);
  const [expensePhotoPreview, setExpensePhotoPreview] = useState(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseSuccess, setExpenseSuccess] = useState('');
  const fileRef3 = useRef();

  // Manual weekly timesheet (feeds payroll via time_entries)
  const [weekDayForms, setWeekDayForms] = useState({});
  const [savingDay, setSavingDay] = useState(null);
  const [dayFormStatus, setDayFormStatus] = useState({}); // { [dayKey]: 'saved' | 'error' }

  // Inline edit for an individual clock entry (fix a mistaken clock in/out)
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editEntryIn, setEditEntryIn] = useState('');
  const [editEntryOut, setEditEntryOut] = useState('');
  const [savingEntry, setSavingEntry] = useState(false);

  // Job detail state
  const [detailJob, setDetailJob] = useState(null);
  const [detailTab, setDetailTab] = useState('info');
  const [detailNotes, setDetailNotes] = useState([]);
  const [detailChecklist, setDetailChecklist] = useState([]);
  const [detailNoteText, setDetailNoteText] = useState('');
  const [detailPhotos, setDetailPhotos] = useState([]);
  const [detailPhotoPreviews, setDetailPhotoPreviews] = useState([]);
  const [savingDetailNote, setSavingDetailNote] = useState(false);
  const [detailUploadProgress, setDetailUploadProgress] = useState({});
  const [detailNoteError, setDetailNoteError] = useState('');
  const [editingDetailNoteId, setEditingDetailNoteId] = useState(null);
  const [editingDetailNoteText, setEditingDetailNoteText] = useState('');
  const [newCheckItem, setNewCheckItem] = useState('');
  const [detailExpenses, setDetailExpenses] = useState([]);
  const [showDetailExpenseForm, setShowDetailExpenseForm] = useState(false);
  const [detailExpenseForm, setDetailExpenseForm] = useState(blankExpenseForm());
  const [detailExpensePhotoFile, setDetailExpensePhotoFile] = useState(null);
  const [detailExpensePhotoPreview, setDetailExpensePhotoPreview] = useState(null);
  const [savingDetailExpense, setSavingDetailExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editExpenseForm, setEditExpenseForm] = useState(blankExpenseForm());
  const [savingExpenseEdit, setSavingExpenseEdit] = useState(false);
  const fileRef4 = useRef();
  const [lightbox, setLightbox] = useState(null); // { urls: [], index: 0 }
  const [annotatingIdx, setAnnotatingIdx] = useState(null);
  const [annotatingExisting, setAnnotatingExisting] = useState(null); // { noteId, url, path, isGallery, galleryIdx }
  const fileRef2 = useRef();

  // Calendar state
  const [calendarJobs, setCalendarJobs] = useState([]);
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(new Date());
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  // Clientes state
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [searchingClients, setSearchingClients] = useState(false);
  const [clientDetail, setClientDetail] = useState(null);
  const [clientDetailJobs, setClientDetailJobs] = useState([]);
  const [clientDetailProperties, setClientDetailProperties] = useState([]);
  const [clientDetailContacts, setClientDetailContacts] = useState([]);
  const [loadingClientDetail, setLoadingClientDetail] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.replace('/login'); return; }
      setProfileId(session.user.id);
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', session.user.id).single();
      if (profile) setTechName(profile.name);
      const { data: allTechs } = await supabase.from('technicians').select('id, name');
      const target = normalizeName(profile?.name ?? 'OTESS');
      const tech = (allTechs ?? []).find(t => normalizeName(t.name) === target);
      if (tech) setTechId(tech.id);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!techId) return;
    supabase.from('time_entries').select('*').eq('technician_id', techId).is('clocked_out_at', null)
      .order('clocked_in_at', { ascending: false }).limit(1).single()
      .then(({ data }) => { if (data) { setClockedIn(true); setActiveEntry(data); } });
  }, [techId]);

  useEffect(() => {
    if (!clockedIn || !activeEntry) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(activeEntry.clocked_in_at)) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [clockedIn, activeEntry]);

  useEffect(() => { if (techId) loadJobs(); }, [jobFilter, techId]);

  useEffect(() => {
    if (!techId) return;
    Promise.all([
      supabase.from('job_technicians').select(`jobs(${JOB_FIELDS})`).eq('technician_id', techId),
      fetchScheduleDayJobs(techId),
    ]).then(([{ data }, scheduleDayJobs]) => {
      const direct = (data ?? []).map(row => row.jobs).filter(Boolean);
      const merged = [...direct];
      for (const j of scheduleDayJobs) if (!merged.some(m => m.id === j.id)) merged.push(j);
      const list = merged
        .filter(j => j.status === 'scheduled' || j.status === 'in_progress')
        .sort((a, b) => new Date(a.scheduled_start ?? 0) - new Date(b.scheduled_start ?? 0));
      setAllJobs(list.slice(0, 20));
    });
  }, [techId]);

  useEffect(() => {
    if (!techId) return;
    const weekStart = getPayrollWeekDays()[0];
    supabase.from('time_entries').select('*').eq('technician_id', techId)
      .gte('clocked_in_at', weekStart.toISOString()).order('clocked_in_at', { ascending: false })
      .then(({ data }) => setTimeEntries(data ?? []));
  }, [techId, clockedIn]);

  // Load this technician's assigned jobs for the calendar
  useEffect(() => {
    if (!techId || tab !== 'calendar') return;
    loadCalendarJobs();
  }, [techId, tab, calendarWeekOffset]);

  async function loadCalendarJobs() {
    setLoadingCalendar(true);
    const [{ data }, scheduleDayJobs] = await Promise.all([
      supabase.from('job_technicians').select(`jobs(${JOB_FIELDS})`).eq('technician_id', techId),
      fetchScheduleDayJobs(techId),
    ]);
    const jobsList = (data ?? []).map(row => row.jobs).filter(Boolean);
    setCalendarJobs([...jobsList, ...scheduleDayJobs]);
    setLoadingCalendar(false);
  }

  async function loadJobs() {
    setLoading(true);
    const [{ data }, scheduleDayJobs] = await Promise.all([
      supabase.from('job_technicians').select(`jobs(${JOB_FIELDS})`).eq('technician_id', techId),
      fetchScheduleDayJobs(techId),
    ]);
    let list = [...(data ?? []).map(row => row.jobs).filter(Boolean), ...scheduleDayJobs];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    if (jobFilter === 'today') list = list.filter(j => j.scheduled_start && new Date(j.scheduled_start) >= today && new Date(j.scheduled_start) < tomorrow);
    else if (jobFilter === 'upcoming') list = list.filter(j => j.scheduled_start && new Date(j.scheduled_start) >= tomorrow && j.status !== 'completed');
    else if (jobFilter === 'done') list = list.filter(j => j.status === 'completed');
    list.sort((a, b) => new Date(a.scheduled_start ?? 0) - new Date(b.scheduled_start ?? 0));
    setJobs(list.slice(0, 20));
    setLoading(false);
  }

  async function getSignedUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) {
      // Old format - extract path
      try {
        const url = new URL(path);
        const parts = url.pathname.split('/Job-photos/');
        if (parts[1]) {
          const { data } = await supabase.storage.from('Job-photos').createSignedUrl(parts[1], 3600);
          return data?.signedUrl ?? null;
        }
      } catch { return null; }
    }
    const { data } = await supabase.storage.from('Job-photos').createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }

  async function openJobDetail(job) {
    setDetailJob(job);
    setDetailTab('info');
    setDetailNotes([]);
    setDetailChecklist([]);
    setDetailExpenses([]);
    setShowDetailExpenseForm(false);
    const [{ data: notes }, { data: checklist }, { data: jobExpenses }] = await Promise.all([
      supabase.from('job_notes').select('*').eq('job_id', job.id).order('created_at', { ascending: false }),
      supabase.from('job_checklist_items').select('*').eq('job_id', job.id).order('sort_order'),
      supabase.from('expenses').select('*').eq('job_id', job.id).order('expense_date', { ascending: false }),
    ]);
    setDetailExpenses(jobExpenses ?? []);
    // Generate signed URLs for photos
    const notesWithUrls = await Promise.all((notes ?? []).map(async n => {
      if (n.photo_urls && n.photo_urls.length > 0) {
        const signedUrls = await Promise.all(n.photo_urls.map(p => getSignedUrl(p)));
        return { ...n, photo_urls: signedUrls, photo_url: signedUrls[0] ?? null, raw_photo_urls: n.photo_urls, raw_photo_url: n.photo_url };
      }
      if (!n.photo_url) return n;
      const signedUrl = await getSignedUrl(n.photo_url);
      return { ...n, photo_url: signedUrl, raw_photo_url: n.photo_url };
    }));
    setDetailNotes(notesWithUrls);
    setDetailChecklist(checklist ?? []);
  }

  async function handleClockIn(jobId) {
    if (!techId) return;
    const { data } = await supabase.from('time_entries')
      .insert([{ technician_id: techId, job_id: jobId || null, clocked_in_at: new Date().toISOString() }])
      .select().single();
    if (data) { setClockedIn(true); setActiveEntry(data); setElapsed(0); }
    setShowFab(false); setShowJobClock(false);
  }

  async function handleClockOut() {
    if (!activeEntry) return;
    await supabase.from('time_entries').update({ clocked_out_at: new Date().toISOString() }).eq('id', activeEntry.id);
    setClockedIn(false); setActiveEntry(null); setElapsed(0);
  }

  // Payroll week runs Wed–Tue (matches /admin/timesheet and /accounting/payroll)
  function getPayrollWeekDays(offset = 0) {
    const n = new Date();
    const daysSinceWed = (n.getDay() + 4) % 7;
    const weekStart = new Date(n);
    weekStart.setDate(n.getDate() - daysSinceWed + offset * 7);
    weekStart.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
  }
  const dayKey = d => d.toISOString().slice(0, 10);
  function to12h(date) {
    let h = date.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return { hour: String(h), minute: String(date.getMinutes()).padStart(2, '0'), ampm };
  }
  function blankDayForm() {
    return { id: null, entryHour: '', entryMinute: '', entryAmPm: 'AM', exitHour: '', exitMinute: '', exitAmPm: 'PM', lunch: false, notes: '' };
  }

  async function loadWeekDayForms() {
    if (!techId) return;
    const days = getPayrollWeekDays();
    const start = days[0];
    const end = new Date(days[6]); end.setHours(23, 59, 59, 999);
    const { data } = await supabase.from('time_entries').select('*')
      .eq('technician_id', techId)
      .gte('clocked_in_at', start.toISOString())
      .lte('clocked_in_at', end.toISOString())
      .order('clocked_in_at');
    const forms = {};
    days.forEach(d => {
      const key = dayKey(d);
      const entry = (data ?? []).find(e => e.clocked_in_at.slice(0, 10) === key);
      if (!entry) { forms[key] = blankDayForm(); return; }
      const inT = to12h(new Date(entry.clocked_in_at));
      const outT = entry.clocked_out_at ? to12h(new Date(entry.clocked_out_at)) : null;
      forms[key] = {
        id: entry.id,
        entryHour: inT.hour, entryMinute: inT.minute, entryAmPm: inT.ampm,
        exitHour: outT?.hour ?? '', exitMinute: outT?.minute ?? '', exitAmPm: outT?.ampm ?? 'PM',
        lunch: (entry.lunch_minutes ?? 0) > 0,
        notes: entry.notes ?? '',
      };
    });
    setWeekDayForms(forms);
  }

  useEffect(() => { if (techId && tab === 'time') loadWeekDayForms(); }, [techId, tab]);

  function updateDayForm(key, patch) {
    setWeekDayForms(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function saveDayForm(dateObj) {
    const key = dayKey(dateObj);
    const form = weekDayForms[key];
    if (!form?.entryHour || !form?.exitHour) return;
    setSavingDay(key);
    setDayFormStatus(prev => ({ ...prev, [key]: null }));
    const to24 = (hour, ampm) => { let h = parseInt(hour, 10) % 12; if (ampm === 'PM') h += 12; return h; };
    const clockedIn = new Date(dateObj);
    clockedIn.setHours(to24(form.entryHour, form.entryAmPm), parseInt(form.entryMinute, 10) || 0, 0, 0);
    const clockedOut = new Date(dateObj);
    clockedOut.setHours(to24(form.exitHour, form.exitAmPm), parseInt(form.exitMinute, 10) || 0, 0, 0);
    const payload = {
      technician_id: techId,
      clocked_in_at: clockedIn.toISOString(),
      clocked_out_at: clockedOut.toISOString(),
      lunch_minutes: form.lunch ? 60 : 0,
      notes: form.notes.trim() || null,
    };
    let saveError = null;
    if (form.id) {
      const { error } = await supabase.from('time_entries').update(payload).eq('id', form.id);
      saveError = error;
    } else {
      const { data, error } = await supabase.from('time_entries').insert([payload]).select().single();
      saveError = error;
      if (data) updateDayForm(key, { id: data.id });
    }
    setSavingDay(null);
    if (saveError) {
      setDayFormStatus(prev => ({ ...prev, [key]: 'error' }));
      return;
    }
    setDayFormStatus(prev => ({ ...prev, [key]: 'saved' }));
    setTimeout(() => setDayFormStatus(prev => (prev[key] === 'saved' ? { ...prev, [key]: null } : prev)), 3000);
    // Refresh the week summary card above so hours reflect the saved entry
    const weekStart = getPayrollWeekDays()[0];
    const { data: refreshed } = await supabase.from('time_entries').select('*').eq('technician_id', techId)
      .gte('clocked_in_at', weekStart.toISOString()).order('clocked_in_at', { ascending: false });
    setTimeEntries(refreshed ?? []);
  }

  function startEditEntry(entry) {
    setEditingEntryId(entry.id);
    setEditEntryIn(new Date(entry.clocked_in_at).toTimeString().slice(0, 5));
    setEditEntryOut(entry.clocked_out_at ? new Date(entry.clocked_out_at).toTimeString().slice(0, 5) : '');
  }

  async function saveEntryEdit(entry) {
    if (!editEntryIn) return;
    setSavingEntry(true);
    const baseDate = entry.clocked_in_at.slice(0, 10);
    const newIn = new Date(baseDate + 'T' + editEntryIn + ':00');
    const newOut = editEntryOut ? new Date(baseDate + 'T' + editEntryOut + ':00') : null;
    await supabase.from('time_entries').update({
      clocked_in_at: newIn.toISOString(),
      clocked_out_at: newOut ? newOut.toISOString() : null,
    }).eq('id', entry.id);

    const weekStart = getPayrollWeekDays()[0];
    const { data: refreshed } = await supabase.from('time_entries').select('*').eq('technician_id', techId)
      .gte('clocked_in_at', weekStart.toISOString()).order('clocked_in_at', { ascending: false });
    setTimeEntries(refreshed ?? []);
    setSelectedDay(sd => sd ? { ...sd, entries: (refreshed ?? []).filter(e => e.clocked_in_at.slice(0, 10) === baseDate) } : sd);
    setEditingEntryId(null);
    setSavingEntry(false);
  }

  async function deleteEntry(entry) {
    if (!confirm('¿Eliminar esta entrada de horario?')) return;
    await supabase.from('time_entries').delete().eq('id', entry.id);
    const baseDate = entry.clocked_in_at.slice(0, 10);
    const weekStart = getPayrollWeekDays()[0];
    const { data: refreshed } = await supabase.from('time_entries').select('*').eq('technician_id', techId)
      .gte('clocked_in_at', weekStart.toISOString()).order('clocked_in_at', { ascending: false });
    setTimeEntries(refreshed ?? []);
    setSelectedDay(sd => sd ? { ...sd, entries: (refreshed ?? []).filter(e => e.clocked_in_at.slice(0, 10) === baseDate) } : sd);
    if (activeEntry?.id === entry.id) { setClockedIn(false); setActiveEntry(null); setElapsed(0); }
  }

  async function saveFabNote(e) {
    e.preventDefault();
    if (!fabSelectedJob || !fabNoteText.trim()) return;
    setSavingFabNote(true);
    await supabase.from('job_notes').insert([{ job_id: fabSelectedJob.id, note: fabNoteText.trim(), created_by: profileId }]);
    setSavingFabNote(false); setFabNoteText(''); setShowJobNote(false); setShowFab(false); setFabSelectedJob(null);
  }

  async function uploadFabPhoto(e) {
    const file = e.target.files?.[0];
    if (!file || !fabSelectedJob) return;
    setUploadingPhoto(true);
    setPhotoError('');
    setFabUploadProgress(0);
    const ext = file.name.split('.').pop();
    const path = fabSelectedJob.id + '/' + Date.now() + '.' + ext;
    const { error } = await uploadFileWithProgress('Job-photos', path, file, setFabUploadProgress);
    setUploadingPhoto(false);
    if (!error) {
      await supabase.from('job_notes').insert([{ job_id: fabSelectedJob.id, photo_url: path, created_by: profileId }]);
      setPhotoSuccess('Foto subida');
      setTimeout(() => { setPhotoSuccess(''); setShowJobPhoto(false); setShowFab(false); setFabSelectedJob(null); }, 2000);
    } else {
      setPhotoError('No se pudo subir el archivo. Verifica tu conexión e intenta de nuevo.');
    }
  }

  function closeExpenseModal() {
    setShowJobExpense(false);
    setExpenseJob(undefined);
    setExpenseSuccess('');
    setExpenseForm(blankExpenseForm());
    setExpensePhotoFile(null);
    setExpensePhotoPreview(null);
  }

  function handleExpensePhotoSelect(file) {
    if (!file) return;
    setExpensePhotoFile(file);
    setExpensePhotoPreview(URL.createObjectURL(file));
  }

  async function saveExpense(e) {
    e.preventDefault();
    if (!expenseForm.description.trim() || !expenseForm.amount) return;
    setSavingExpense(true);
    let receiptPath = null;
    if (expensePhotoFile) {
      const ext = expensePhotoFile.name.split('.').pop();
      const path = expenseJob ? `${expenseJob.id}/expenses/${Date.now()}.${ext}` : `general/expenses/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, expensePhotoFile);
      if (!upErr) receiptPath = path;
    }
    await supabase.from('expenses').insert([{
      job_id: expenseJob ? expenseJob.id : null,
      category: expenseForm.category,
      description: expenseForm.description.trim(),
      vendor: expenseForm.vendor.trim() || null,
      amount: parseFloat(expenseForm.amount) || 0,
      expense_date: expenseForm.expense_date,
      receipt_url: receiptPath,
    }]);
    setSavingExpense(false);
    setExpenseSuccess('Gasto guardado');
    setTimeout(closeExpenseModal, 1200);
  }

  function handleDetailExpensePhoto(file) {
    if (!file) return;
    setDetailExpensePhotoFile(file);
    setDetailExpensePhotoPreview(URL.createObjectURL(file));
  }

  async function addDetailExpense(e) {
    e.preventDefault();
    if (!detailExpenseForm.description.trim() || !detailExpenseForm.amount) return;
    setSavingDetailExpense(true);
    let receiptPath = null;
    if (detailExpensePhotoFile) {
      const ext = detailExpensePhotoFile.name.split('.').pop();
      const path = `${detailJob.id}/expenses/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, detailExpensePhotoFile);
      if (!upErr) receiptPath = path;
    }
    const { data } = await supabase.from('expenses').insert([{
      job_id: detailJob.id,
      category: detailExpenseForm.category,
      description: detailExpenseForm.description.trim(),
      vendor: detailExpenseForm.vendor.trim() || null,
      amount: parseFloat(detailExpenseForm.amount) || 0,
      expense_date: detailExpenseForm.expense_date,
      receipt_url: receiptPath,
    }]).select().single();
    if (data) setDetailExpenses(prev => [data, ...prev]);
    setDetailExpenseForm(blankExpenseForm());
    setDetailExpensePhotoFile(null);
    setDetailExpensePhotoPreview(null);
    setShowDetailExpenseForm(false);
    setSavingDetailExpense(false);
  }

  function startEditExpense(exp) {
    setEditingExpenseId(exp.id);
    setEditExpenseForm({
      category: exp.category,
      description: exp.description ?? '',
      vendor: exp.vendor ?? '',
      amount: String(exp.amount ?? ''),
      expense_date: exp.expense_date,
    });
  }

  function cancelEditExpense() {
    setEditingExpenseId(null);
    setEditExpenseForm(blankExpenseForm());
  }

  async function saveExpenseEdit() {
    if (!editExpenseForm.description.trim() || !editExpenseForm.amount) return;
    setSavingExpenseEdit(true);
    const { data } = await supabase.from('expenses').update({
      category: editExpenseForm.category,
      description: editExpenseForm.description.trim(),
      vendor: editExpenseForm.vendor.trim() || null,
      amount: parseFloat(editExpenseForm.amount) || 0,
      expense_date: editExpenseForm.expense_date,
    }).eq('id', editingExpenseId).select().single();
    if (data) setDetailExpenses(prev => prev.map(x => x.id === data.id ? data : x));
    setSavingExpenseEdit(false);
    cancelEditExpense();
  }

  async function deleteDetailExpense(id) {
    if (!confirm('¿Eliminar este gasto?')) return;
    await supabase.from('expenses').delete().eq('id', id);
    setDetailExpenses(prev => prev.filter(x => x.id !== id));
  }

  async function saveDetailNote(e) {
    e.preventDefault();
    if (!detailNoteText.trim() && detailPhotos.length === 0) return;
    setSavingDetailNote(true);
    setDetailNoteError('');

    const uploadedPaths = [];
    const failedNames = [];
    for (let i = 0; i < detailPhotos.length; i++) {
      const file = detailPhotos[i];
      const ext = file.name.split('.').pop();
      const path = detailJob.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.' + ext;
      const { error } = await uploadFileWithProgress('Job-photos', path, file, pct => {
        setDetailUploadProgress(prev => ({ ...prev, [i]: pct }));
      });
      if (!error) uploadedPaths.push(path);
      else failedNames.push(file.name);
    }

    const { data: note } = await supabase.from('job_notes').insert([{
      job_id: detailJob.id,
      note: detailNoteText.trim() || null,
      photo_url: uploadedPaths[0] ?? null,
      photo_urls: uploadedPaths.length > 0 ? uploadedPaths : null,
      created_by: profileId,
    }]).select().single();

    if (note) {
      const signedUrls = await Promise.all(uploadedPaths.map(p => getSignedUrl(p)));
      setDetailNotes(prev => [{
        ...note,
        photo_urls: uploadedPaths.length > 0 ? signedUrls : null,
        photo_url: signedUrls[0] ?? null,
        raw_photo_urls: uploadedPaths.length > 0 ? uploadedPaths : null,
        raw_photo_url: uploadedPaths[0] ?? null,
      }, ...prev]);
    }
    if (failedNames.length > 0) {
      setDetailNoteError(`No se pudo subir: ${failedNames.join(', ')}. La nota se guardó, intenta subir el archivo de nuevo.`);
    }

    setDetailNoteText(''); setDetailPhotos([]); setDetailPhotoPreviews([]); setDetailUploadProgress({}); setSavingDetailNote(false);
  }

  async function saveDetailNoteEdit(noteId) {
    const text = editingDetailNoteText.trim() || null;
    const { error } = await supabase.from('job_notes').update({ note: text }).eq('id', noteId);
    if (!error) setDetailNotes(prev => prev.map(n => n.id === noteId ? { ...n, note: text } : n));
    setEditingDetailNoteId(null);
    setEditingDetailNoteText('');
  }

  function handleAnnotateSave(blob) {
    if (annotatingIdx === null) return;
    const file = new File([blob], detailPhotos[annotatingIdx].name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
    const newUrl = URL.createObjectURL(blob);
    setDetailPhotos(prev => prev.map((f, i) => i === annotatingIdx ? file : f));
    setDetailPhotoPreviews(prev => prev.map((u, i) => i === annotatingIdx ? newUrl : u));
    setAnnotatingIdx(null);
  }

  async function handleAnnotateExistingSave(blob) {
    if (!annotatingExisting) return;
    const { noteId, path } = annotatingExisting;
    const { error } = await supabase.storage.from('Job-photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (!error) {
      const signedUrl = await getSignedUrl(path);
      setDetailNotes(prev => prev.map(n => {
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

  async function toggleCheckItem(item) {
    const completed = !item.completed;
    await supabase.from('job_checklist_items').update({ completed, completed_at: completed ? new Date().toISOString() : null }).eq('id', item.id);
    setDetailChecklist(prev => prev.map(i => i.id === item.id ? { ...i, completed } : i));
  }

  async function addCheckItem(e) {
    e.preventDefault();
    if (!newCheckItem.trim()) return;
    const { data } = await supabase.from('job_checklist_items').insert([{
      job_id: detailJob.id, description: newCheckItem.trim(), sort_order: detailChecklist.length,
    }]).select().single();
    if (data) setDetailChecklist(prev => [...prev, data]);
    setNewCheckItem('');
  }

  // Clientes search (shows full list by default, filters as you type)
  useEffect(() => {
    if (tab !== 'clientes') return;
    const term = clientSearch.trim();
    setSearchingClients(true);
    const handle = setTimeout(async () => {
      let q = supabase.from('clients').select('id, name, company, phone, email, client_type').order('name');
      q = term ? q.or(`name.ilike.%${term}%,company.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`).limit(30) : q.limit(50);
      const { data } = await q;
      setClientResults(data ?? []);
      setSearchingClients(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [clientSearch, tab]);

  async function openClientDetail(client) {
    setClientDetail(client);
    setLoadingClientDetail(true);
    setClientDetailJobs([]);
    setClientDetailProperties([]);
    setClientDetailContacts([]);
    const [{ data: cJobs }, { data: cProps }, { data: cContacts }] = await Promise.all([
      supabase.from('jobs').select('id, title, status, scheduled_start').eq('client_id', client.id).order('scheduled_start', { ascending: false }),
      supabase.from('client_properties').select('*').eq('client_id', client.id).order('is_primary', { ascending: false }),
      supabase.from('client_contacts').select('*').eq('client_id', client.id).order('is_primary', { ascending: false }),
    ]);
    setClientDetailJobs(cJobs ?? []);
    setClientDetailProperties(cProps ?? []);
    setClientDetailContacts(cContacts ?? []);
    setLoadingClientDetail(false);
  }

  const fmtE = s => String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  const fmtH = es => (es.reduce((a, e) => a + (e.clocked_out_at ? (new Date(e.clocked_out_at) - new Date(e.clocked_in_at)) / 3600000 - (e.lunch_minutes ?? 0) / 60 : 0), 0)).toFixed(1) + 'h';
  const now = new Date();
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const SC = { estimate: '#5b6473', scheduled: '#2a4cb5', in_progress: AMBER, completed: '#1a7a4a', cancelled: '#b52a2a' };
  const SL = { estimate: 'Estimate', scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Done', cancelled: 'Cancelled' };
  const DSH = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
  const WD = DSH.map((_, i) => { const d = new Date(now); const off = now.getDay() === 0 ? -4 : now.getDay() >= 3 ? now.getDay() - 3 : now.getDay() + 4; d.setDate(now.getDate() - off + i); return d.getDate(); });
  const card = { margin: '0 14px 12px', background: '#fff', borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
  const navBtn = a => ({ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '10px 0 6px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 600, color: a ? ORANGE : '#aaa' });
  const ftab = a => ({ padding: '8px 16px', borderRadius: 50, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: a ? 'none' : '1.5px solid #dde1e7', background: a ? '#1a1a1a' : '#fff', color: a ? '#fff' : '#333' });
  const fmi = c => ({ background: c || ORANGE, color: '#fff', border: 'none', borderRadius: 50, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' });
  const NavI = ({ tab: t, icon, label }) => (
    <button style={navBtn(tab === t)} onClick={() => { setTab(t); setShowFab(false); }}>
      <FieldIcon name={icon} />{label}
    </button>
  );
  const JobRow = ({ j, onClick }) => {
    const location = [j.property_name, j.city].filter(Boolean).join(' — ');
    const hasAddress = j.street || j.city;
    return (
      <div onClick={onClick} style={{ padding: '12px 0', borderBottom: '1px solid #eee', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{j.title}</div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{j.clients?.name}</div>
          {location && (
            hasAddress ? (
              <a
                href={pickMapsLink(j.street, j.city, j.state, j.zip)}
                target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ display: 'block', fontSize: 12, color: ORANGE, marginTop: 3, fontWeight: 600, textDecoration: 'underline' }}>
                📍 {location}
              </a>
            ) : (
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 3 }}>📍 {location}</div>
            )
          )}
          {j.scheduled_start && <div style={{ fontSize: 12, color: '#aaa', marginTop: 3 }}>📅 {new Date(j.scheduled_start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: SC[j.status], background: SC[j.status] + '18', padding: '4px 10px', borderRadius: 20, marginLeft: 10, whiteSpace: 'nowrap' }}>{SL[j.status]}</span>
      </div>
    );
  };

  const fmtMoney = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const totalDetailExpenses = detailExpenses.reduce((a, e) => a + Number(e.amount ?? 0), 0);
  const completedCount = detailChecklist.filter(i => i.completed).length;
  const progress = detailChecklist.length > 0 ? Math.round((completedCount / detailChecklist.length) * 100) : 0;

  // Calendar helpers: build the week (Sun-Sat) for the current offset
  function getWeekDays(offset) {
    const base = new Date();
    base.setDate(base.getDate() + offset * 7);
    const dayOfWeek = base.getDay(); // 0 = Sunday
    const sunday = new Date(base);
    sunday.setDate(base.getDate() - dayOfWeek);
    sunday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      return d;
    });
  }
  const weekDays = getWeekDays(calendarWeekOffset);
  const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  const jobsForSelectedDay = calendarJobs
    .filter(j => j.scheduled_start && sameDay(new Date(j.scheduled_start), calendarSelectedDate))
    .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));

  const jobDaysSet = new Set(calendarJobs.filter(j => j.scheduled_start).map(j => new Date(j.scheduled_start).toDateString()));

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: BG, fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif', display: 'flex', flexDirection: 'column', maxWidth: 430, margin: '0 auto' }}>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>

        {tab === 'home' && (
          <div>
            <div style={{ padding: '20px 20px 8px', display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{DAYS[now.getDay()].toUpperCase()}, {MON[now.getMonth()]} {now.getDate()}</span>
            </div>
            <div style={{ padding: '0 20px 20px' }}><div style={{ fontSize: 27, fontWeight: 700 }}>{greeting}, {techName}</div></div>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 40, height: 40, background: BG, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⏱</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{clockedIn ? 'Clocked in' : 'Not clocked in'}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{clockedIn ? fmtE(elapsed) : 'Tap to start your shift'}</div>
                </div>
                <button style={{ background: clockedIn ? '#1a7a4a' : ORANGE, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} onClick={clockedIn ? handleClockOut : () => handleClockIn()}>
                  {clockedIn ? 'Clock Out' : 'Clock In'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 20px 12px' }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>Today's schedule</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: ORANGE, cursor: 'pointer' }} onClick={() => setTab('jobs')}>View all</span>
            </div>
            <div style={card}>
              {jobs.length === 0
                ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#888' }}>No jobs scheduled today.</div>
                : jobs.slice(0, 3).map(j => <JobRow key={j.id} j={j} onClick={() => openJobDetail(j)} />)
              }
            </div>
          </div>
        )}

        {tab === 'jobs' && (
          <div>
            <div style={{ padding: '20px 20px 16px' }}>
              <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 14 }}>Jobs</div>
              <div style={{ background: '#fff', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 14 }}>
                <span>🔍</span>
                <input value={jobSearch} onChange={e => setJobSearch(e.target.value)} placeholder="Search jobs, customer or location..." style={{ border: 'none', background: 'none', fontSize: 15, outline: 'none', width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['today', 'upcoming', 'done', 'all'].map(f => (
                  <button key={f} style={ftab(jobFilter === f)} onClick={() => setJobFilter(f)}>
                    {f === 'today' ? 'Today' : f === 'upcoming' ? 'Upcoming' : f === 'done' ? 'Done' : 'All'}
                  </button>
                ))}
              </div>
            </div>
            <div style={card}>
              {(() => {
                const term = jobSearch.trim().toLowerCase();
                const visibleJobs = term
                  ? jobs.filter(j =>
                      (j.title ?? '').toLowerCase().includes(term) ||
                      (j.clients?.name ?? '').toLowerCase().includes(term) ||
                      (j.property_name ?? '').toLowerCase().includes(term) ||
                      (j.street ?? '').toLowerCase().includes(term) ||
                      (j.city ?? '').toLowerCase().includes(term))
                  : jobs;
                return loading ? <div style={{ textAlign: 'center', padding: '32px 0', color: '#888' }}>Loading...</div>
                  : visibleJobs.length === 0 ? <div style={{ textAlign: 'center', padding: '32px 0', color: '#888' }}>No jobs here.</div>
                    : visibleJobs.map((j, i) => <JobRow key={j._scheduleDayId ? `day-${j._scheduleDayId}` : `${j.id}-${i}`} j={j} onClick={() => openJobDetail(j)} />);
              })()}
            </div>
          </div>
        )}

        {tab === 'time' && (
          <div>
            <div style={{ padding: '20px 20px 8px', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>My Timesheet</div>
                <div style={{ fontSize: 12, color: '#888' }}>{MON[now.getMonth()]} {now.getDate()}, {now.getFullYear()}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: ORANGE }}>Pending</span>
            </div>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 40, height: 40, background: BG, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⏱</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{clockedIn ? 'Clocked in' : 'Not clocked in'}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{clockedIn ? fmtE(elapsed) : fmtH(timeEntries) + ' logged this week'}</div>
                </div>
                <button style={{ background: clockedIn ? '#1a7a4a' : '#f5ddd3', color: clockedIn ? '#fff' : '#c04a1a', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} onClick={clockedIn ? handleClockOut : () => handleClockIn()}>
                  {clockedIn ? 'Clock Out' : 'Clock In'}
                </button>
              </div>
            </div>
            <div style={{ ...card, display: 'flex', justifyContent: 'space-between' }}>
              {DSH.map((d, i) => {
                const dayDate = new Date(now);
                const off = now.getDay() === 0 ? -4 : now.getDay() >= 3 ? now.getDay() - 3 : now.getDay() + 4;
                dayDate.setDate(now.getDate() - off + i);
                const dayEntries = timeEntries.filter(e => {
                  const eDate = new Date(e.clocked_in_at);
                  return eDate.getDate() === dayDate.getDate() && eDate.getMonth() === dayDate.getMonth();
                });
                const dayHours = dayEntries.reduce((a, e) => a + (e.clocked_out_at
                  ? (new Date(e.clocked_out_at) - new Date(e.clocked_in_at)) / 3600000 - (e.lunch_minutes ?? 0) / 60
                  : (Date.now() - new Date(e.clocked_in_at)) / 3600000), 0).toFixed(1);
                const isToday = dayDate.getDate() === now.getDate() && dayDate.getMonth() === now.getMonth();
                const hasHours = parseFloat(dayHours) > 0;
                return (
                  <div key={d} onClick={() => setSelectedDay({ date: new Date(dayDate), entries: dayEntries })} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: hasHours ? 'pointer' : 'default', padding: '6px 4px', borderRadius: 10, background: selectedDay?.date.getDate() === dayDate.getDate() ? ORANGE + '18' : 'transparent' }}>
                    <div style={{ fontSize: 11, color: isToday ? ORANGE : '#888', fontWeight: isToday ? 700 : 400 }}>{d}</div>
                    <div style={{ fontSize: 12, color: hasHours ? '#16223d' : '#ccc', fontWeight: hasHours ? 700 : 400 }}>{hasHours ? dayHours + 'h' : '—'}</div>
                    <div style={{ fontSize: 12, color: isToday ? ORANGE : '#aaa', fontWeight: isToday ? 700 : 400 }}>{dayDate.getDate()}</div>
                  </div>
                );
              })}
            </div>
            {selectedDay && selectedDay.entries.length > 0 && (
              <div style={{ ...card, marginTop: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#16223d' }}>
                    {selectedDay.date.toLocaleDateString('es-PR', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </div>
                  <button onClick={() => setSelectedDay(null)} aria-label="Cerrar" style={{ background: '#f0f0f0', border: 'none', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#555', cursor: 'pointer' }}>✕</button>
                </div>
                {selectedDay.entries.map((e, i) => {
                  const inTime = new Date(e.clocked_in_at);
                  const outTime = e.clocked_out_at ? new Date(e.clocked_out_at) : null;
                  const dur = outTime ? ((outTime - inTime) / 3600000 - (e.lunch_minutes ?? 0) / 60).toFixed(2) : null;
                  const isEditing = editingEntryId === e.id;
                  if (isEditing) {
                    return (
                      <div key={e.id} style={{ padding: '10px 0', borderBottom: i < selectedDay.entries.length - 1 ? '1px solid #eee' : 'none' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Entrada</div>
                            <input type="time" value={editEntryIn} onChange={ev => setEditEntryIn(ev.target.value)}
                              style={{ padding: '6px 10px', border: '1.5px solid #dde1e7', borderRadius: 8, fontSize: 14 }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Salida</div>
                            <input type="time" value={editEntryOut} onChange={ev => setEditEntryOut(ev.target.value)}
                              style={{ padding: '6px 10px', border: '1.5px solid #dde1e7', borderRadius: 8, fontSize: 14 }} />
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
                            <button onClick={() => saveEntryEdit(e)} disabled={savingEntry || !editEntryIn}
                              style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                              {savingEntry ? '...' : 'Guardar'}
                            </button>
                            <button onClick={() => setEditingEntryId(null)}
                              style={{ background: '#f0f0f0', color: '#333', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < selectedDay.entries.length - 1 ? '1px solid #eee' : 'none' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {inTime.toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })}
                          {outTime ? ' → ' + outTime.toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' }) : ' → En progreso'}
                        </div>
                        {e.job_id && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>Con trabajo</div>}
                        {(e.lunch_minutes ?? 0) > 0 && <div style={{ fontSize: 11, color: ORANGE, marginTop: 2 }}>🍽️ Lunch -{(e.lunch_minutes / 60).toFixed(1)}h</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div style={{ fontWeight: 700, color: dur ? '#16223d' : ORANGE, fontSize: 14 }}>
                          {dur ? dur + 'h' : '⏱'}
                        </div>
                        <button onClick={() => startEditEntry(e)} style={{ background: 'none', border: 'none', fontSize: 15, cursor: 'pointer', padding: 4 }}>✏️</button>
                        <button onClick={() => deleteEntry(e)} style={{ background: 'none', border: 'none', fontSize: 15, cursor: 'pointer', padding: 4 }}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ color: '#888' }}>Hours this week</span>
                <span style={{ fontWeight: 700 }}>{fmtH(timeEntries)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ border: '1.5px solid #1abc9c', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#1abc9c', marginBottom: 6 }}>REGULAR</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: '#1abc9c' }}>{fmtH(timeEntries)}</div>
                </div>
                <div style={{ border: '1.5px solid #dde1e7', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', marginBottom: 6 }}>OVERTIME</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: '#ccc' }}>0.0h</div>
                </div>
              </div>
            </div>

            <div style={{ padding: '4px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>Editar mi horario semanal</span>
            </div>

            {getPayrollWeekDays().map(dateObj => {
              const key = dayKey(dateObj);
              const form = weekDayForms[key] ?? blankDayForm();
              const dayLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
              const dateLabel = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const saving = savingDay === key;
              return (
                <div key={key} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div><span style={{ fontWeight: 700, fontSize: 16 }}>{dayLabel}</span> <span style={{ color: '#888', fontSize: 13 }}>{dateLabel}</span></div>
                    <button onClick={() => saveDayForm(dateObj)} disabled={saving || !form.entryHour || !form.exitHour}
                      style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (!form.entryHour || !form.exitHour) ? 0.5 : 1 }}>
                      {saving ? '...' : '💾'}
                    </button>
                  </div>

                  {[['ENTRY', 'entry'], ['EXIT', 'exit']].map(([label, prefix]) => (
                    <div key={prefix} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="text" inputMode="numeric" maxLength={2} placeholder="--" value={form[prefix + 'Hour']}
                          onChange={e => updateDayForm(key, { [prefix + 'Hour']: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                          style={{ width: 46, textAlign: 'center', padding: '10px 0', border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 15, fontWeight: 600, outline: 'none' }} />
                        <span style={{ fontWeight: 700, color: '#888' }}>:</span>
                        <input type="text" inputMode="numeric" maxLength={2} placeholder="--" value={form[prefix + 'Minute']}
                          onChange={e => updateDayForm(key, { [prefix + 'Minute']: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                          style={{ width: 46, textAlign: 'center', padding: '10px 0', border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 15, fontWeight: 600, outline: 'none' }} />
                        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1.5px solid #dde1e7' }}>
                          {['AM', 'PM'].map(ap => (
                            <button key={ap} onClick={() => updateDayForm(key, { [prefix + 'AmPm']: ap })}
                              style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: form[prefix + 'AmPm'] === ap ? '#16223d' : '#fff', color: form[prefix + 'AmPm'] === ap ? '#fff' : '#888' }}>
                              {ap}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.06em', marginBottom: 6 }}>LUNCH</div>
                      <div onClick={() => updateDayForm(key, { lunch: !form.lunch })}
                        style={{ width: 44, height: 26, borderRadius: 50, background: form.lunch ? ORANGE : '#dde1e7', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: form.lunch ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                      </div>
                    </div>
                    <input value={form.notes} onChange={e => updateDayForm(key, { notes: e.target.value })} placeholder="Notes..."
                      style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #dde1e7', borderRadius: 50, fontSize: 13, outline: 'none' }} />
                  </div>
                  {dayFormStatus[key] === 'saved' && (
                    <div style={{ marginTop: 10, background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600 }}>
                      ✅ Guardado
                    </div>
                  )}
                  {dayFormStatus[key] === 'error' && (
                    <div style={{ marginTop: 10, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600 }}>
                      ⚠️ No se pudo guardar. Verifica tu conexión e intenta de nuevo.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'calendar' && (
          <div>
            <div style={{ padding: '20px 20px 12px' }}>
              <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Calendar</div>
              <div style={{ fontSize: 13, color: '#888' }}>{calendarSelectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
            </div>

            {/* Week navigation */}
            <div style={{ padding: '0 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => setCalendarWeekOffset(o => o - 1)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#888', cursor: 'pointer', padding: '4px 10px' }}>‹</button>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>
                {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <button onClick={() => setCalendarWeekOffset(o => o + 1)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#888', cursor: 'pointer', padding: '4px 10px' }}>›</button>
            </div>

            {/* Day strip */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 14px 16px' }}>
              {weekDays.map((d, i) => {
                const isSelected = sameDay(d, calendarSelectedDate);
                const isToday = sameDay(d, now);
                const hasJobs = jobDaysSet.has(d.toDateString());
                return (
                  <div key={i} onClick={() => setCalendarSelectedDate(d)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', flex: 1 }}>
                    <div style={{ fontSize: 11, color: isToday ? ORANGE : '#aaa', fontWeight: 600 }}>{WEEKDAY_LETTERS[i]}</div>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isSelected ? ORANGE : 'transparent', color: isSelected ? '#fff' : isToday ? ORANGE : '#333',
                      fontWeight: isSelected || isToday ? 700 : 500, fontSize: 14,
                    }}>
                      {d.getDate()}
                    </div>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: hasJobs ? ORANGE : 'transparent' }} />
                  </div>
                );
              })}
            </div>

            {/* Timeline for selected day */}
            <div style={card}>
              {loadingCalendar ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#888' }}>Cargando...</div>
              ) : jobsForSelectedDay.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>📅</div>
                  Sin trabajos asignados este día.
                </div>
              ) : (
                jobsForSelectedDay.map((j, i) => (
                  <div key={j._scheduleDayId ? `day-${j._scheduleDayId}` : `${j.id}-${i}`} onClick={() => openJobDetail(j)} style={{ display: 'flex', gap: 12, paddingBottom: i < jobsForSelectedDay.length - 1 ? 16 : 0, marginBottom: i < jobsForSelectedDay.length - 1 ? 16 : 0, borderBottom: i < jobsForSelectedDay.length - 1 ? '1px solid #eee' : 'none', cursor: 'pointer' }}>
                    <div style={{ width: 62, flexShrink: 0, fontSize: 13, fontWeight: 700, color: ORANGE }}>
                      {new Date(j.scheduled_start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{j.title}</div>
                      <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{j.clients?.name}</div>
                      {(j.street || j.city) && <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>📍 {[j.street, j.city].filter(Boolean).join(', ')}</div>}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: SC[j.status], background: SC[j.status] + '18', padding: '4px 8px', borderRadius: 20, height: 'fit-content', whiteSpace: 'nowrap' }}>{SL[j.status]}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'projects' && (
          <div>
            <div style={{ padding: '20px 20px 16px' }}><div style={{ fontSize: 26, fontWeight: 700 }}>Projects</div></div>
            {allJobs.length === 0
              ? <div style={{ ...card, textAlign: 'center', padding: '60px 20px', color: '#aaa' }}><div style={{ fontSize: 48, marginBottom: 12 }}>📋</div><div>No active projects</div></div>
              : allJobs.map(j => (
                <div key={j.id} style={{ ...card, cursor: 'pointer' }} onClick={() => openJobDetail(j)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{j.title}</div>
                      <div style={{ fontSize: 13, color: '#888' }}>{j.clients?.name}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: SC[j.status], background: SC[j.status] + '18', padding: '4px 10px', borderRadius: 20 }}>{SL[j.status]}</span>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {tab === 'clientes' && (
          <div>
            <div style={{ padding: '20px 20px 16px' }}>
              <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 14 }}>Clientes</div>
              <div style={{ background: '#fff', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <span>🔍</span>
                <input
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  placeholder="Buscar por nombre, teléfono, email..."
                  style={{ border: 'none', background: 'none', fontSize: 15, outline: 'none', width: '100%' }}
                />
              </div>
            </div>
            <div style={card}>
              {searchingClients ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#888' }}>Buscando...</div>
              ) : clientResults.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa' }}>No se encontraron clientes.</div>
              ) : (
                clientResults.map(c => (
                  <div key={c.id} onClick={() => openClientDetail(c)} style={{ padding: '12px 0', borderBottom: '1px solid #eee', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                      {c.company && <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{c.company}</div>}
                      {c.phone && <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>📞 {c.phone}</div>}
                    </div>
                    <span style={{ color: ORANGE, fontSize: 18 }}>→</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Client Detail Overlay */}
      {clientDetail && (
        <div style={{ position: 'fixed', inset: 0, background: BG, zIndex: 150, display: 'flex', flexDirection: 'column', maxWidth: 430, margin: '0 auto' }}>
          <div style={{ background: '#fff', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #dde1e7', flexShrink: 0 }}>
            <button onClick={() => setClientDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#333', padding: 0 }}>←</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clientDetail.name}</div>
              {clientDetail.company && <div style={{ fontSize: 12, color: '#888' }}>{clientDetail.company}</div>}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {loadingClientDetail ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#888' }}>Cargando...</div>
            ) : (
              <>
                {/* Contact card */}
                <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 10 }}>Contacto</div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: clientDetail.client_type === 'b2b' ? '#2a4cb5' : '#888', background: (clientDetail.client_type === 'b2b' ? '#2a4cb5' : '#888') + '18', padding: '4px 10px', borderRadius: 20, marginBottom: 10, display: 'inline-block' }}>
                    {clientDetail.client_type === 'b2b' ? 'B2B' : 'Consumidor final'}
                  </span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    {clientDetail.phone && <a href={`tel:${clientDetail.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#1a7a4a', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>📞 {clientDetail.phone}</a>}
                    {clientDetail.email && <a href={`mailto:${clientDetail.email}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#16223d', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>✉️ {clientDetail.email}</a>}
                  </div>
                </div>

                {/* Additional contacts */}
                {clientDetailContacts.length > 0 && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 10 }}>👤 Contactos adicionales</div>
                    {clientDetailContacts.map(ct => (
                      <div key={ct.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{ct.name}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                          {ct.phone && <a href={`tel:${ct.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#1a7a4a', color: '#fff', borderRadius: 8, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>📞 {ct.phone}</a>}
                          {ct.email && <a href={`mailto:${ct.email}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#16223d', color: '#fff', borderRadius: 8, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>✉️ {ct.email}</a>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Properties */}
                {clientDetailProperties.length > 0 && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 10 }}>📍 Propiedades</div>
                    {clientDetailProperties.map(p => (
                      <div key={p.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f0f0f0' }}>
                        {p.name && <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>}
                        {p.street && <div style={{ fontSize: 13, color: '#555' }}>{p.street}</div>}
                        {p.city && <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>{p.city}{p.state ? `, ${p.state}` : ''} {p.zip ?? ''}</div>}
                        {(p.street || p.city) && (() => {
                          const links = buildMapsLinks(p.street, p.city, p.state, p.zip);
                          return (
                            <a href={links.direct ?? links.google} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>🗺️ Ver en Maps</a>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                )}

                {/* Job history */}
                <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 10 }}>🔧 Historial de trabajos ({clientDetailJobs.length})</div>
                  {clientDetailJobs.length === 0 ? (
                    <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>Sin trabajos registrados.</div>
                  ) : (
                    clientDetailJobs.map((j, i) => (
                      <div key={j.id} onClick={() => { setClientDetail(null); openJobDetail(j); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < clientDetailJobs.length - 1 ? '1px solid #f0f0f0' : 'none', cursor: 'pointer' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{j.title}</div>
                          {j.scheduled_start && <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>{new Date(j.scheduled_start).toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: SC[j.status], background: SC[j.status] + '18', padding: '4px 8px', borderRadius: 20 }}>{SL[j.status]}</span>
                          <span style={{ color: ORANGE, fontSize: 14 }}>›</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Job Detail Overlay */}
      {detailJob && (
        <div style={{ position: 'fixed', inset: 0, background: BG, zIndex: 150, display: 'flex', flexDirection: 'column', maxWidth: 430, margin: '0 auto' }}>
          <div style={{ background: '#fff', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #dde1e7', flexShrink: 0 }}>
            <button onClick={() => setDetailJob(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#333', padding: 0 }}>←</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detailJob.title}</div>
              <div style={{ fontSize: 12, color: '#888' }}>{detailJob.clients?.name}</div>
            </div>
            <button onClick={() => handleClockIn(detailJob.id)} style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>⏱ Clock In</button>
          </div>

          <div style={{ background: '#fff', display: 'flex', borderBottom: '1px solid #dde1e7', flexShrink: 0 }}>
            {[['info', '📋 Info'], ['checklist', `✅ (${completedCount}/${detailChecklist.length})`], ['notes', `📸 (${detailNotes.length})`], ['gastos', `💸 ${detailExpenses.length > 0 ? fmtMoney(totalDetailExpenses) : ''}`]].map(([t, label]) => (
              <button key={t} onClick={() => setDetailTab(t)} style={{ flex: 1, padding: '12px 8px', background: 'none', border: 'none', borderBottom: detailTab === t ? '2px solid ' + ORANGE : '2px solid transparent', fontWeight: detailTab === t ? 700 : 500, color: detailTab === t ? ORANGE : '#888', cursor: 'pointer', fontSize: 13 }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>

            {/* INFO TAB */}
            {detailTab === 'info' && (
              <div>
                {/* Status */}
                <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 8 }}>Estado</div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: SC[detailJob.status], background: SC[detailJob.status] + '18', padding: '5px 12px', borderRadius: 20 }}>{SL[detailJob.status]}</span>
                </div>

                {/* Scheduled date */}
                {detailJob.scheduled_start && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 8 }}>Fecha programada</div>
                    <div style={{ fontSize: 14 }}>{new Date(detailJob.scheduled_start).toLocaleString('es-PR', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                )}

                {/* Cliente */}
                {detailJob.clients?.name && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 8 }}>Cliente</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{detailJob.clients.name}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {detailJob.clients?.phone && <a href={`tel:${detailJob.clients.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#1a7a4a', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>📞 {detailJob.clients.phone}</a>}
                      {detailJob.clients?.email && <a href={`mailto:${detailJob.clients.email}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#16223d', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>✉️ {detailJob.clients.email}</a>}
                    </div>
                  </div>
                )}

                {/* Contacto encargado */}
                {(detailJob.contact_name || detailJob.contact_phone || detailJob.contact_email) && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 8 }}>👤 Contacto encargado</div>
                    {detailJob.contact_name && <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{detailJob.contact_name}</div>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {detailJob.contact_phone && <a href={`tel:${detailJob.contact_phone}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#1a7a4a', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>📞 {detailJob.contact_phone}</a>}
                      {detailJob.contact_email && <a href={`mailto:${detailJob.contact_email}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#16223d', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>✉️ {detailJob.contact_email}</a>}
                    </div>
                  </div>
                )}

                {/* Propiedad */}
                {(detailJob.property_name || detailJob.street || detailJob.city) && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 8 }}>📍 Propiedad</div>
                    {detailJob.property_name && <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{detailJob.property_name}</div>}
                    {detailJob.street && <div style={{ fontSize: 14, color: '#555' }}>{detailJob.street}</div>}
                    {detailJob.city && <div style={{ fontSize: 14, color: '#555', marginBottom: 10 }}>{detailJob.city}{detailJob.state ? `, ${detailJob.state}` : ''}{detailJob.zip ? ` ${detailJob.zip}` : ''}</div>}
                    {(detailJob.street || detailJob.city) && (() => {
                      const links = buildMapsLinks(detailJob.street, detailJob.city, detailJob.state, detailJob.zip);
                      if (links.direct) {
                        return (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <a href={links.direct} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🗺️ Abrir ubicación</a>
                          </div>
                        );
                      }
                      return (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <a href={links.google} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🗺️ Maps</a>
                          <a href={links.apple} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#000', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🍎 Apple</a>
                          <a href={links.waze} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#33CCFF', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🚗 Waze</a>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* CHECKLIST TAB */}
            {detailTab === 'checklist' && (
              <div>
                {detailChecklist.length > 0 && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>Progreso</span>
                      <span style={{ fontWeight: 700, color: progress === 100 ? '#1a7a4a' : ORANGE }}>{progress}%</span>
                    </div>
                    <div style={{ background: '#eee', borderRadius: 50, height: 8 }}>
                      <div style={{ background: progress === 100 ? '#1a7a4a' : ORANGE, borderRadius: 50, height: 8, width: progress + '%', transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>{completedCount} de {detailChecklist.length} completados</div>
                  </div>
                )}
                <div style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <form onSubmit={addCheckItem} style={{ display: 'flex', gap: 8 }}>
                    <input value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)} placeholder="Agregar ítem..." style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #dde1e7', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
                    <button type="submit" style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>+</button>
                  </form>
                </div>
                {detailChecklist.length === 0
                  ? <div style={{ background: '#fff', borderRadius: 14, padding: '32px 18px', textAlign: 'center', color: '#aaa', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>Sin ítems.</div>
                  : (() => {
                    const groupedMap = {};
                    detailChecklist.forEach(i => {
                      const g = i.group_name || '__none__';
                      if (!groupedMap[g]) groupedMap[g] = [];
                      groupedMap[g].push(i);
                    });
                    return Object.entries(groupedMap).map(([groupKey, items]) => (
                      <div key={groupKey} style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        {groupKey !== '__none__' && (
                          <div style={{ fontWeight: 700, fontSize: 13, color: ORANGE, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #eee' }}>
                            📁 {groupKey}
                          </div>
                        )}
                        {items.map(item => (
                          <div key={item.id} onClick={() => toggleCheckItem(item)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #eee', cursor: 'pointer' }}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', border: item.completed ? 'none' : '2px solid #dde1e7', background: item.completed ? '#1a7a4a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {item.completed && <span style={{ color: '#fff', fontSize: 14, fontWeight: 900 }}>✓</span>}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, textDecoration: item.completed ? 'line-through' : 'none', color: item.completed ? '#aaa' : '#333' }}>{item.description}</div>
                              {item.completed && item.completed_at && (
                                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                                  {new Date(item.completed_at).toLocaleDateString('es-PR')}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ));
                  })()
                }
              </div>
            )}

            {/* NOTES TAB */}
            {detailTab === 'notes' && (
              <div>
                <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <form onSubmit={saveDetailNote}>
                    <textarea value={detailNoteText} onChange={e => setDetailNoteText(e.target.value)} placeholder="Escribe una nota..." rows={3}
                      style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'none', marginBottom: 8 }} />
                    {detailPhotoPreviews.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        {detailPhotoPreviews.map((preview, idx) => (
                          <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                            {detailPhotos[idx]?.type?.startsWith('video') ? (
                              <video src={preview} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, background: '#000' }} />
                            ) : (
                              <img src={preview} onClick={() => setAnnotatingIdx(idx)} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }} />
                            )}
                            {!detailPhotos[idx]?.type?.startsWith('video') && !savingDetailNote && (
                              <button type="button" onClick={() => setAnnotatingIdx(idx)}
                                style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✏️ Marcar</button>
                            )}
                            {savingDetailNote && (
                              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', borderRadius: '0 0 8px 8px', padding: '3px 6px' }}>
                                <div style={{ background: 'rgba(255,255,255,0.3)', borderRadius: 20, height: 4, overflow: 'hidden' }}>
                                  <div style={{ background: ORANGE, height: '100%', width: `${detailUploadProgress[idx] ?? 0}%`, transition: 'width 0.2s' }} />
                                </div>
                                <div style={{ color: '#fff', fontSize: 9, fontWeight: 700, textAlign: 'center' }}>{detailUploadProgress[idx] ?? 0}%</div>
                              </div>
                            )}
                            {!savingDetailNote && (
                              <button type="button" onClick={() => {
                                setDetailPhotos(prev => prev.filter((_, i) => i !== idx));
                                setDetailPhotoPreviews(prev => prev.filter((_, i) => i !== idx));
                              }}
                                style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 13 }}>×</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {detailNoteError && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 8 }}>
                        ⚠️ {detailNoteError}
                      </div>
                    )}
                    <input ref={fileRef2} type="file" accept="image/*,video/*,application/pdf" multiple
                      onChange={e => {
                        const files = Array.from(e.target.files || []);
                        if (files.length) {
                          setDetailPhotos(prev => [...prev, ...files]);
                          setDetailPhotoPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
                        }
                      }}
                      style={{ display: 'none' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => fileRef2.current?.click()} style={{ padding: '10px 14px', background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>📷{detailPhotos.length > 0 ? ` ${detailPhotos.length}` : ''}</button>
                      <button type="submit" disabled={savingDetailNote} style={{ flex: 1, padding: '10px 14px', background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
                        {savingDetailNote ? 'Subiendo...' : '💾 Guardar'}
                      </button>
                    </div>
                  </form>
                </div>
                {detailNotes.length === 0
                  ? <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa' }}>No hay notas aún.</div>
                  : detailNotes.map(n => (
                    <div key={n.id} style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: '#aaa' }}>
                          {new Date(n.created_at).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {n.created_by === profileId && editingDetailNoteId !== n.id && (
                          <button onClick={() => { setEditingDetailNoteId(n.id); setEditingDetailNoteText(n.note ?? ''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 14 }}>✏️</button>
                        )}
                      </div>
                      {n.photo_urls && n.photo_urls.length > 1 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: n.photo_urls.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }}>
                          {n.photo_urls.map((url, idx) => {
                            const isVideo = /\.(mp4|mov|webm|avi)(\?|$)/i.test(url);
                            const isPdf = /\.pdf(\?|$)/i.test(url);
                            if (isPdf) return (
                              <a key={idx} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 100, background: '#f0f0f0', borderRadius: 8, textDecoration: 'none' }}>
                                <span style={{ fontSize: 26 }}>📄</span>
                                <span style={{ fontSize: 10, color: '#666', fontWeight: 600 }}>PDF</span>
                              </a>
                            );
                            return isVideo ? (
                              <video key={idx} src={url} controls style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8, background: '#000' }} />
                            ) : (
                              <img key={idx} src={url} onClick={() => setLightbox({ urls: n.photo_urls, index: idx, noteId: n.id })}
                                style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in' }} />
                            );
                          })}
                        </div>
                      ) : n.photo_url && (() => {
                        const isVideo = /\.(mp4|mov|webm|avi)(\?|$)/i.test(n.photo_url);
                        const isPdf = /\.pdf(\?|$)/i.test(n.photo_url);
                        if (isPdf) return (
                          <a href={n.photo_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#f0f0f0', borderRadius: 10, textDecoration: 'none', marginBottom: 8 }}>
                            <span style={{ fontSize: 24 }}>📄</span>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>Ver documento PDF</span>
                          </a>
                        );
                        return isVideo ? (
                          <video src={n.photo_url} controls style={{ width: '100%', maxHeight: 250, borderRadius: 10, marginBottom: 8, background: '#000' }} />
                        ) : (
                          <img src={n.photo_url} onClick={() => setLightbox({ urls: [n.photo_url], index: 0, noteId: n.id })}
                            style={{ width: '100%', maxHeight: 250, objectFit: 'cover', borderRadius: 10, marginBottom: 8, cursor: 'zoom-in' }} />
                        );
                      })()}
                      {editingDetailNoteId === n.id ? (
                        <div>
                          <textarea autoFocus value={editingDetailNoteText} onChange={e => setEditingDetailNoteText(e.target.value)} rows={3}
                            style={{ width: '100%', padding: 8, border: '1.5px solid #dde1e7', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'none', marginBottom: 8 }} />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" onClick={() => saveDetailNoteEdit(n.id)} style={{ padding: '6px 14px', background: ORANGE, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Guardar</button>
                            <button type="button" onClick={() => { setEditingDetailNoteId(null); setEditingDetailNoteText(''); }} style={{ padding: '6px 14px', background: '#f0f0f0', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                          </div>
                        </div>
                      ) : n.note && <p style={{ fontSize: 14, margin: 0 }}>{n.note}</p>}
                    </div>
                  ))
                }
              </div>
            )}

            {/* GASTOS TAB */}
            {detailTab === 'gastos' && (
              <div>
                <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  {!showDetailExpenseForm ? (
                    <button onClick={() => setShowDetailExpenseForm(true)} style={{ width: '100%', padding: 12, background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>+ Agregar gasto</button>
                  ) : (
                    <form onSubmit={addDetailExpense}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <select value={detailExpenseForm.category} onChange={e => setDetailExpenseForm(f => ({ ...f, category: e.target.value }))}
                          style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }}>
                          {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                        <input type="date" value={detailExpenseForm.expense_date} onChange={e => setDetailExpenseForm(f => ({ ...f, expense_date: e.target.value }))}
                          style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
                      </div>
                      <input value={detailExpenseForm.description} onChange={e => setDetailExpenseForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción"
                        style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <input value={detailExpenseForm.vendor} onChange={e => setDetailExpenseForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Suplidor (opcional)"
                          style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                        <input type="number" step="0.01" value={detailExpenseForm.amount} onChange={e => setDetailExpenseForm(f => ({ ...f, amount: e.target.value }))} placeholder="Monto"
                          style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                      </div>
                      {detailExpensePhotoPreview && (
                        <img src={detailExpensePhotoPreview} alt="recibo" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
                      )}
                      <input ref={fileRef4} type="file" accept="image/*" onChange={e => handleDetailExpensePhoto(e.target.files?.[0])} style={{ display: 'none' }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => fileRef4.current?.click()} style={{ padding: '10px 14px', background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>📷 Recibo</button>
                        <button type="submit" disabled={savingDetailExpense || !detailExpenseForm.description.trim() || !detailExpenseForm.amount} style={{ flex: 1, padding: 12, background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
                          {savingDetailExpense ? 'Guardando...' : '💾 Guardar'}
                        </button>
                        <button type="button" onClick={() => setShowDetailExpenseForm(false)} style={{ padding: 12, background: 'none', border: 'none', color: '#888', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                      </div>
                    </form>
                  )}
                </div>
                {detailExpenses.length === 0
                  ? <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa' }}>No hay gastos registrados para este trabajo.</div>
                  : detailExpenses.map(exp => (
                    <div key={exp.id} style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                      {editingExpenseId === exp.id ? (
                        <div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <select value={editExpenseForm.category} onChange={e => setEditExpenseForm(f => ({ ...f, category: e.target.value }))}
                              style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }}>
                              {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                            <input type="date" value={editExpenseForm.expense_date} onChange={e => setEditExpenseForm(f => ({ ...f, expense_date: e.target.value }))}
                              style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
                          </div>
                          <input value={editExpenseForm.description} onChange={e => setEditExpenseForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción"
                            style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }} />
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <input value={editExpenseForm.vendor} onChange={e => setEditExpenseForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Suplidor (opcional)"
                              style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                            <input type="number" step="0.01" value={editExpenseForm.amount} onChange={e => setEditExpenseForm(f => ({ ...f, amount: e.target.value }))} placeholder="Monto"
                              style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" onClick={saveExpenseEdit} disabled={savingExpenseEdit || !editExpenseForm.description.trim() || !editExpenseForm.amount}
                              style={{ flex: 1, padding: 12, background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
                              {savingExpenseEdit ? 'Guardando...' : '💾 Guardar'}
                            </button>
                            <button type="button" onClick={cancelEditExpense} style={{ padding: 12, background: 'none', border: 'none', color: '#888', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{exp.description}</div>
                            <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
                              {EXPENSE_CATEGORIES.find(c => c.value === exp.category)?.label ?? exp.category} · {exp.expense_date}{exp.vendor ? ` · ${exp.vendor}` : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtMoney(exp.amount)}</div>
                            <button onClick={() => startEditExpense(exp)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 14 }}>✏️</button>
                            <button onClick={() => deleteDetailExpense(exp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 14 }}>🗑</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </div>
      )}

      {annotatingIdx !== null && detailPhotoPreviews[annotatingIdx] && (
        <PhotoAnnotator
          imageUrl={detailPhotoPreviews[annotatingIdx]}
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
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, cursor: 'zoom-out' }}>
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontSize: 28, borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', zIndex: 3 }}>×</button>
          {lightbox.noteId && (
            <button onClick={e => {
              e.stopPropagation();
              const note = detailNotes.find(n => n.id === lightbox.noteId);
              const isGallery = note.raw_photo_urls && note.raw_photo_urls.length > 1;
              setAnnotatingExisting({
                noteId: lightbox.noteId,
                url: lightbox.urls[lightbox.index],
                path: isGallery ? note.raw_photo_urls[lightbox.index] : note.raw_photo_url,
                isGallery,
                galleryIdx: lightbox.index,
              });
            }}
              style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, borderRadius: 20, padding: '10px 18px', cursor: 'pointer', zIndex: 3 }}>✏️ Editar</button>
          )}

          {lightbox.urls.length > 1 && (
            <div style={{ position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)', color: '#fff', fontSize: 14, fontWeight: 600, background: 'rgba(255,255,255,0.15)', padding: '4px 14px', borderRadius: 20 }}>
              {lightbox.index + 1} / {lightbox.urls.length}
            </div>
          )}

          {lightbox.urls.length > 1 && lightbox.index > 0 && (
            <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: l.index - 1 })); }}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 24, borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', zIndex: 2 }}>‹</button>
          )}

          <img src={lightbox.urls[lightbox.index]} alt="full" onClick={e => e.stopPropagation()} style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} />

          {lightbox.urls.length > 1 && lightbox.index < lightbox.urls.length - 1 && (
            <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: l.index + 1 })); }}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 24, borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', zIndex: 2 }}>›</button>
          )}
        </div>
      )}

      {/* FAB */}
      {tab !== 'clientes' && (
        <button style={{ position: 'fixed', bottom: 80, right: 20, width: 52, height: 52, background: showFab ? '#333' : ORANGE, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(224,92,42,0.4)', zIndex: 99, fontSize: 24, color: '#fff' }} onClick={() => setShowFab(!showFab)}>
          {showFab ? '✕' : '+'}
        </button>
      )}

      {showFab && tab !== 'clientes' && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 97 }} onClick={() => setShowFab(false)} />
          <div style={{ position: 'fixed', bottom: 140, right: 20, zIndex: 98, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
            <button style={fmi('#2a4cb5')} onClick={() => { setShowJobNote(true); setShowFab(false); }}>📝 Agregar nota</button>
            <button style={fmi('#1a7a4a')} onClick={() => { setShowJobPhoto(true); setShowFab(false); }}>📸 Agregar foto</button>
            <button style={fmi('#7a4cb5')} onClick={() => { setShowJobExpense(true); setShowFab(false); }}>💸 Agregar gasto</button>
            <button style={fmi(ORANGE)} onClick={() => { setShowJobClock(true); setShowFab(false); }}>⏱ Clock In a trabajo</button>
          </div>
        </>
      )}

      {showJobClock && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }} onClick={() => setShowJobClock(false)}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: 430 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>⏱ Clock In a trabajo</div>
              <button onClick={() => setShowJobClock(false)} aria-label="Cerrar" style={{ background: '#f0f0f0', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#555', cursor: 'pointer' }}>✕</button>
            </div>
            {allJobs.length === 0 ? <p style={{ color: '#888' }}>No hay trabajos activos.</p>
              : allJobs.map(j => (
                <div key={j.id} onClick={() => handleClockIn(j.id)} style={{ padding: '12px 0', borderBottom: '1px solid #eee', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                  <div><div style={{ fontWeight: 600 }}>{j.title}</div><div style={{ fontSize: 13, color: '#888' }}>{j.clients?.name}</div></div>
                  <span style={{ color: ORANGE, fontWeight: 700 }}>→</span>
                </div>
              ))}
            <button onClick={() => setShowJobClock(false)} style={{ marginTop: 16, width: '100%', padding: 12, background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {showJobNote && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }} onClick={() => { setShowJobNote(false); setFabSelectedJob(null); }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: 430 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>📝 Agregar nota</div>
              <button onClick={() => { setShowJobNote(false); setFabSelectedJob(null); }} aria-label="Cerrar" style={{ background: '#f0f0f0', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#555', cursor: 'pointer' }}>✕</button>
            </div>
            {!fabSelectedJob
              ? <>{<p style={{ color: '#888', marginBottom: 12 }}>Selecciona el trabajo:</p>}{allJobs.map(j => <div key={j.id} onClick={() => setFabSelectedJob(j)} style={{ padding: '12px 0', borderBottom: '1px solid #eee', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}><div><div style={{ fontWeight: 600 }}>{j.title}</div><div style={{ fontSize: 13, color: '#888' }}>{j.clients?.name}</div></div><span style={{ color: ORANGE }}>→</span></div>)}</>
              : <form onSubmit={saveFabNote}>
                <div style={{ fontWeight: 600, marginBottom: 12, color: ORANGE }}>{fabSelectedJob.title}</div>
                <textarea value={fabNoteText} onChange={e => setFabNoteText(e.target.value)} placeholder="Escribe tu nota..." style={{ width: '100%', minHeight: 100, padding: 12, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'none' }} />
                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  <button type="submit" disabled={savingFabNote} style={{ flex: 1, padding: 12, background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>{savingFabNote ? 'Guardando...' : 'Guardar'}</button>
                  <button type="button" onClick={() => { setFabSelectedJob(null); setShowJobNote(false); }} style={{ padding: 12, background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                </div>
              </form>
            }
          </div>
        </div>
      )}

      {showJobPhoto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }} onClick={() => { setShowJobPhoto(false); setFabSelectedJob(null); }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: 430 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>📸 Agregar foto</div>
              <button onClick={() => { setShowJobPhoto(false); setFabSelectedJob(null); }} aria-label="Cerrar" style={{ background: '#f0f0f0', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#555', cursor: 'pointer' }}>✕</button>
            </div>
            {photoSuccess ? <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 18, color: '#1a7a4a', fontWeight: 700 }}>{photoSuccess} ✅</div>
              : !fabSelectedJob
                ? <>{<p style={{ color: '#888', marginBottom: 12 }}>Selecciona el trabajo:</p>}{allJobs.map(j => <div key={j.id} onClick={() => setFabSelectedJob(j)} style={{ padding: '12px 0', borderBottom: '1px solid #eee', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}><div><div style={{ fontWeight: 600 }}>{j.title}</div><div style={{ fontSize: 13, color: '#888' }}>{j.clients?.name}</div></div><span style={{ color: ORANGE }}>→</span></div>)}</>
                : <div>
                  <div style={{ fontWeight: 600, marginBottom: 16, color: ORANGE }}>{fabSelectedJob.title}</div>
                  {photoError && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 12 }}>
                      ⚠️ {photoError}
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/*,video/*,application/pdf" onChange={uploadFabPhoto} style={{ display: 'none' }} />
                  <button onClick={() => fileRef.current?.click()} disabled={uploadingPhoto} style={{ width: '100%', padding: 16, background: '#f0f0f0', border: '2px dashed #dde1e7', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', color: '#555' }}>
                    {uploadingPhoto ? `📤 Subiendo... ${fabUploadProgress}%` : '📷 Tomar foto o elegir de galería'}
                  </button>
                  {uploadingPhoto && (
                    <div style={{ background: '#e5e7eb', borderRadius: 20, height: 8, overflow: 'hidden', marginTop: 10 }}>
                      <div style={{ background: ORANGE, height: '100%', width: `${fabUploadProgress}%`, transition: 'width 0.2s' }} />
                    </div>
                  )}
                  <button onClick={() => { setFabSelectedJob(null); setShowJobPhoto(false); }} style={{ marginTop: 10, width: '100%', padding: 12, background: 'none', border: 'none', color: '#888', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                </div>
            }
          </div>
        </div>
      )}

      {showJobExpense && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }} onClick={closeExpenseModal}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: 430, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>💸 Agregar gasto</div>
              <button onClick={closeExpenseModal} aria-label="Cerrar" style={{ background: '#f0f0f0', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#555', cursor: 'pointer' }}>✕</button>
            </div>
            {expenseSuccess ? (
              <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 18, color: '#1a7a4a', fontWeight: 700 }}>{expenseSuccess} ✅</div>
            ) : expenseJob === undefined ? (
              <>
                <p style={{ color: '#888', marginBottom: 12 }}>Selecciona el trabajo o registra un gasto general:</p>
                <div onClick={() => setExpenseJob(null)} style={{ padding: '12px 0', borderBottom: '1px solid #eee', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, color: '#7a4cb5' }}>💼 Gasto general</div>
                  <span style={{ color: ORANGE }}>→</span>
                </div>
                {allJobs.map(j => (
                  <div key={j.id} onClick={() => setExpenseJob(j)} style={{ padding: '12px 0', borderBottom: '1px solid #eee', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                    <div><div style={{ fontWeight: 600 }}>{j.title}</div><div style={{ fontSize: 13, color: '#888' }}>{j.clients?.name}</div></div>
                    <span style={{ color: ORANGE }}>→</span>
                  </div>
                ))}
                <button onClick={closeExpenseModal} style={{ marginTop: 16, width: '100%', padding: 12, background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              </>
            ) : (
              <form onSubmit={saveExpense}>
                <div style={{ fontWeight: 600, marginBottom: 12, color: ORANGE }}>{expenseJob ? expenseJob.title : 'Gasto general'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))}
                    style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }}>
                    {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <input type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm(f => ({ ...f, expense_date: e.target.value }))}
                    style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
                </div>
                <input value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción"
                  style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input value={expenseForm.vendor} onChange={e => setExpenseForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Suplidor (opcional)"
                    style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                  <input type="number" step="0.01" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} placeholder="Monto"
                    style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                </div>
                {expensePhotoPreview && (
                  <img src={expensePhotoPreview} alt="recibo" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
                )}
                <input ref={fileRef3} type="file" accept="image/*" onChange={e => handleExpensePhotoSelect(e.target.files?.[0])} style={{ display: 'none' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => fileRef3.current?.click()} style={{ padding: '10px 14px', background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>📷 Recibo</button>
                  <button type="submit" disabled={savingExpense || !expenseForm.description.trim() || !expenseForm.amount} style={{ flex: 1, padding: 12, background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
                    {savingExpense ? 'Guardando...' : '💾 Guardar'}
                  </button>
                </div>
                <button type="button" onClick={closeExpenseModal} style={{ marginTop: 10, width: '100%', padding: 12, background: 'none', border: 'none', color: '#888', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              </form>
            )}
          </div>
        </div>
      )}

      <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: '#fff', borderTop: '1px solid #dde1e7', display: 'flex', zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom,4px)' }}>
        <NavI tab="home" icon="home" label="Home" />
        <NavI tab="jobs" icon="jobs" label="Jobs" />
        <NavI tab="time" icon="time" label="Time" />
        <NavI tab="calendar" icon="calendar" label="Calendar" />
        <NavI tab="projects" icon="projects" label="Projects" />
        <NavI tab="clientes" icon="clientes" label="Clientes" />
      </nav>
    </div>
  );
}
