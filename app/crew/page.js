'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import PhotoAnnotator from '../PhotoAnnotator';
import BarcodeScanner from '../BarcodeScanner';
import { buildMapsLinks, pickMapsLink } from '../../lib/mapsLinks';
import { normalizeName } from '../../lib/normalizeName';
import { uploadFileWithProgress } from '../../lib/uploadWithProgress';
import { computeHours } from '../../lib/hours';
import { formatDatePR, formatDateTimePR, formatTimePR } from '../../lib/datetimeLocal';

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
  note: <><path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4"/><line x1="8" y1="12.5" x2="15" y2="12.5"/><line x1="8" y1="16.5" x2="13" y2="16.5"/></>,
  camera: <><path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="14" r="3.3"/></>,
  cash: <><rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.4"/><line x1="6.5" y1="9.5" x2="6.5" y2="9.5"/><line x1="17.5" y1="14.5" x2="17.5" y2="14.5"/></>,
};
function FieldIcon({ name }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name] || null}
    </svg>
  );
}
const JOB_FIELDS = 'id, title, status, client_id, scheduled_start, scheduled_end, street, city, state, zip, property_name, contact_name, contact_phone, contact_email, clients(name, phone, email)';
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
function blankClientForm() {
  return { name: '', client_type: 'final', email: '', phone: '', company: '' };
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

// A technician can be assigned to a job two independent ways: the legacy single
// `jobs.technician_id` column, or a row in the `job_technicians` junction table (multi-tech
// jobs) — a job assigned only via the former is invisible if you only query the latter, which
// is what left some technicians' jobs missing from the Crew App. Union both (deduped by job
// id, since they can both name the same job) and then append the extra-work-day entries
// un-deduped: fetchScheduleDayJobs reuses the parent job's id on each entry by design, since
// every extra day is meant to render as its own occurrence on that day, not get collapsed.
async function fetchTechJobs(techId) {
  const [{ data: viaJunction }, { data: viaPrimary }, scheduleDayJobs] = await Promise.all([
    supabase.from('job_technicians').select(`jobs(${JOB_FIELDS})`).eq('technician_id', techId),
    supabase.from('jobs').select(JOB_FIELDS).eq('technician_id', techId),
    fetchScheduleDayJobs(techId),
  ]);
  const mainJobs = [];
  const seen = new Set();
  const addMain = j => { if (j && !seen.has(j.id)) { seen.add(j.id); mainJobs.push(j); } };
  (viaJunction ?? []).forEach(row => addMain(row.jobs));
  (viaPrimary ?? []).forEach(addMain);
  return [...mainJobs, ...scheduleDayJobs];
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
  const [todayAbsence, setTodayAbsence] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [showFab, setShowFab] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
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

  // Pull-to-refresh — the app shell is position:fixed (no native page scroll), so
  // Safari's native swipe-to-refresh never fires here even installed to homescreen.
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef(null);
  const pullStartY = useRef(0);
  const pulling = useRef(false);
  const PULL_THRESHOLD = 70;

  function handlePullStart(e) {
    if (refreshing || !scrollRef.current || scrollRef.current.scrollTop > 0) { pulling.current = false; return; }
    pullStartY.current = e.touches[0].clientY;
    pulling.current = true;
  }
  function handlePullMove(e) {
    if (!pulling.current || refreshing) return;
    const delta = e.touches[0].clientY - pullStartY.current;
    if (delta > 0 && scrollRef.current && scrollRef.current.scrollTop <= 0) {
      setPullY(Math.min(delta * 0.5, 90));
    } else {
      pulling.current = false;
      setPullY(0);
    }
  }
  function handlePullEnd() {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullY > PULL_THRESHOLD) {
      setRefreshing(true);
      setPullY(PULL_THRESHOLD);
      window.location.reload();
    } else {
      setPullY(0);
    }
  }

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
  const [weekStartKey, setWeekStartKey] = useState('');

  // Inline edit for an individual clock entry (fix a mistaken clock in/out)
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editEntryIn, setEditEntryIn] = useState('');
  const [editEntryOut, setEditEntryOut] = useState('');
  const [editEntryError, setEditEntryError] = useState('');
  const [savingEntry, setSavingEntry] = useState(false);

  // Job detail state
  const [detailJob, setDetailJob] = useState(null);
  const [detailTab, setDetailTab] = useState('info');
  const [detailNotes, setDetailNotes] = useState([]);
  const [detailChecklist, setDetailChecklist] = useState([]);
  const [detailPlanos, setDetailPlanos] = useState([]);
  const [detailNoteText, setDetailNoteText] = useState('');
  const [detailPhotos, setDetailPhotos] = useState([]);
  const [detailPhotoPreviews, setDetailPhotoPreviews] = useState([]);
  const [savingDetailNote, setSavingDetailNote] = useState(false);
  const [detailUploadProgress, setDetailUploadProgress] = useState({});
  const [detailNoteError, setDetailNoteError] = useState('');
  const [editingDetailNoteId, setEditingDetailNoteId] = useState(null);
  const [editingDetailNoteText, setEditingDetailNoteText] = useState('');
  const [newCheckItem, setNewCheckItem] = useState('');
  const [addingArea, setAddingArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');
  const [addingItemArea, setAddingItemArea] = useState(null);
  const [newAreaItemText, setNewAreaItemText] = useState({});
  const [areaMenuOpen, setAreaMenuOpen] = useState(null);
  const [checkItemMenuOpen, setCheckItemMenuOpen] = useState(null);
  const [editingCheckItemId, setEditingCheckItemId] = useState(null);
  const [editingCheckItemText, setEditingCheckItemText] = useState('');
  const [dragCheckItem, setDragCheckItem] = useState(null);
  const [dragOverArea, setDragOverArea] = useState(null);
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

  // Job reports (create/edit + email to client, mirrors app/trabajos/[id]/JobTabs.js)
  const [detailReports, setDetailReports] = useState([]);
  const [detailClientContacts, setDetailClientContacts] = useState([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [editingReportId, setEditingReportId] = useState(null);
  const [reportTitle, setReportTitle] = useState('');
  const [reportNoteIds, setReportNoteIds] = useState([]);
  const [reportVisitDate, setReportVisitDate] = useState('');
  const [reportPersonnel, setReportPersonnel] = useState('');
  const [reportSummary, setReportSummary] = useState('');
  const [reportObservations, setReportObservations] = useState('');
  const [reportRecommendations, setReportRecommendations] = useState('');
  const [reportPreparedBy, setReportPreparedBy] = useState('');
  const [savingReport, setSavingReport] = useState(false);
  const [emailingReportId, setEmailingReportId] = useState(null);
  const [reportEmailTo, setReportEmailTo] = useState('');
  const [reportEmailCc, setReportEmailCc] = useState([]);
  const [reportEmailCcExtra, setReportEmailCcExtra] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { urls: [], index: 0 }
  const [annotatingIdx, setAnnotatingIdx] = useState(null);
  const [annotatingExisting, setAnnotatingExisting] = useState(null); // { noteId, url, path, isGallery, galleryIdx }
  const fileRef2 = useRef();

  // Calendar state
  const [calendarJobs, setCalendarJobs] = useState([]);
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(new Date());
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  // Non-job schedule items assigned to this technician — shown alongside jobs so "today's
  // schedule" and the Calendar tab reflect everything, not just jobs.
  const [techEvents, setTechEvents] = useState([]);
  const [techTasks, setTechTasks] = useState([]);
  const [techVisits, setTechVisits] = useState([]);
  const [detailEntry, setDetailEntry] = useState(null); // { kind, raw } — simple read-only view for event/task/visit
  const [detailEntryNotes, setDetailEntryNotes] = useState([]);
  const [newEntryNoteText, setNewEntryNoteText] = useState('');
  const [newEntryNotePhotos, setNewEntryNotePhotos] = useState([]); // [{file, previewUrl}]
  const [savingEntryNote, setSavingEntryNote] = useState(false);
  const entryNotePhotoInputRef = useRef(null);
  const [maintReportModal, setMaintReportModal] = useState(null); // { task }
  const [savingMaintReport, setSavingMaintReport] = useState(false);

  async function resolveNotePhotoUrls(notes) {
    return Promise.all(notes.map(async n => ({
      ...n,
      photo_signed_urls: await Promise.all((n.photo_urls ?? []).map(async p => {
        const { data } = await supabase.storage.from('Job-photos').createSignedUrl(p, 3600);
        return data?.signedUrl ?? null;
      })),
    })));
  }

  useEffect(() => {
    setNewEntryNoteText('');
    setNewEntryNotePhotos([]);
    if (!detailEntry || (detailEntry._kind !== 'event' && detailEntry._kind !== 'task')) { setDetailEntryNotes([]); return; }
    const table = detailEntry._kind === 'event' ? 'calendar_event_notes' : 'task_notes';
    const fkColumn = detailEntry._kind === 'event' ? 'event_id' : 'task_id';
    supabase.from(table).select('*').eq(fkColumn, detailEntry._raw.id)
      .order('created_at', { ascending: false }).then(async ({ data }) => setDetailEntryNotes(await resolveNotePhotoUrls(data ?? [])));
  }, [detailEntry?._kind, detailEntry?._raw?.id]);

  async function addDetailEntryNote() {
    if (!newEntryNoteText.trim() && newEntryNotePhotos.length === 0) return;
    setSavingEntryNote(true);
    const table = detailEntry._kind === 'event' ? 'calendar_event_notes' : 'task_notes';
    const fkColumn = detailEntry._kind === 'event' ? 'event_id' : 'task_id';
    const taskId = detailEntry._raw.id;
    const uploadedPaths = [];
    for (const { file } of newEntryNotePhotos) {
      const ext = file.name.split('.').pop();
      const path = `${taskId}/note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error } = await supabase.storage.from('Job-photos').upload(path, file);
      if (!error) uploadedPaths.push(path);
    }
    const { data, error } = await supabase.from(table).insert([{
      [fkColumn]: taskId, note: newEntryNoteText.trim() || null, author_name: techName,
      photo_urls: uploadedPaths.length ? uploadedPaths : null,
    }]).select().single();
    setSavingEntryNote(false);
    if (error) { alert(error.message); return; }
    setNewEntryNoteText('');
    const newNote = { ...data, photo_signed_urls: newEntryNotePhotos.map(p => p.previewUrl) };
    setNewEntryNotePhotos([]);
    setDetailEntryNotes(prev => [newNote, ...prev]);
  }

  async function deleteDetailEntryNote(note) {
    const table = detailEntry._kind === 'event' ? 'calendar_event_notes' : 'task_notes';
    const { error } = await supabase.from(table).delete().eq('id', note.id);
    if (error) { alert(error.message); return; }
    if (note.photo_urls?.length) await supabase.storage.from('Job-photos').remove(note.photo_urls);
    setDetailEntryNotes(prev => prev.filter(n => n.id !== note.id));
  }

  // One report per visit — the checklist/notes/photos are read live from the
  // task on the report page itself, so reopen the existing one instead of
  // letting a tech generate duplicates.
  async function openMaintenanceReport(task) {
    const { data: existing } = await supabase.from('maintenance_reports').select('id').eq('task_id', task.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing) {
      window.open(`/reporte-mantenimiento/${existing.id}`, '_blank');
      return;
    }
    setMaintReportModal({ task });
  }

  async function createMaintenanceReport(form) {
    setSavingMaintReport(true);
    const { data, error } = await supabase.from('maintenance_reports').insert([{
      task_id: form.task.id,
      title: form.title.trim(),
      visit_date: form.visitDate || null,
      personnel: form.personnel.trim() || null,
      prepared_by: form.preparedBy.trim() || null,
    }]).select().single();
    setSavingMaintReport(false);
    if (error) { alert(error.message); return; }
    setMaintReportModal(null);
    window.open(`/reporte-mantenimiento/${data.id}`, '_blank');
  }

  async function toggleDetailTaskItem(item) {
    const taskId = detailEntry._raw.id;
    await supabase.from('task_items').update({ done: !item.done }).eq('id', item.id);
    const applyToggle = items => items.map(i => i.id === item.id ? { ...i, done: !i.done } : i);
    setDetailEntry(prev => prev && ({ ...prev, _raw: { ...prev._raw, task_items: applyToggle(prev._raw.task_items) } }));
    setTechTasks(prev => prev.map(t => t.id === taskId ? { ...t, task_items: applyToggle(t.task_items ?? []) } : t));
  }

  // Clientes state
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [searchingClients, setSearchingClients] = useState(false);
  const [clientDetail, setClientDetail] = useState(null);
  const [clientDetailJobs, setClientDetailJobs] = useState([]);
  const [clientDetailProperties, setClientDetailProperties] = useState([]);
  const [clientDetailContacts, setClientDetailContacts] = useState([]);
  const [loadingClientDetail, setLoadingClientDetail] = useState(false);

  // New client (FAB, Clientes tab)
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientForm, setNewClientForm] = useState(blankClientForm());
  const [newClientAddr, setNewClientAddr] = useState({ line1: '', city: '', zip: '' });
  const [savingNewClient, setSavingNewClient] = useState(false);
  const [newClientError, setNewClientError] = useState('');

  // Inventario state — reads locations/location_stock directly (RLS grants tecnico select),
  // writes go through adjust_catalog_stock (security definer), so no write policy is needed.
  const [invLoaded, setInvLoaded] = useState(false);
  const [invLocations, setInvLocations] = useState([]);
  const [invStock, setInvStock] = useState([]);
  const [invProducts, setInvProducts] = useState([]);
  const [invLocationId, setInvLocationId] = useState('');
  const [invLocationQuery, setInvLocationQuery] = useState('');
  const [invLocationOpen, setInvLocationOpen] = useState(false);
  const [invStockSearch, setInvStockSearch] = useState('');
  const [invUnitSearch, setInvUnitSearch] = useState('');
  const [showInvAdjust, setShowInvAdjust] = useState(false);
  const [invAdjustForm, setInvAdjustForm] = useState({ catalog_item_id: '', delta: '', reason: '' });
  const [invSaving, setInvSaving] = useState(false);

  // Inventario: equipo serializado (foto + serial por unidad, no por cantidad)
  const [invUnits, setInvUnits] = useState([]);
  const [showInvAddUnit, setShowInvAddUnit] = useState(false);
  const [invUnitForm, setInvUnitForm] = useState({ catalog_item_id: '', serial_number: '', notes: '' });
  const [invUnitPhotoFile, setInvUnitPhotoFile] = useState(null);
  const [invUnitPhotoPreview, setInvUnitPhotoPreview] = useState(null);
  const [invUnitUploadProgress, setInvUnitUploadProgress] = useState(0);
  const [invSavingUnit, setInvSavingUnit] = useState(false);
  const [invUnitError, setInvUnitError] = useState('');
  const [showInvScanner, setShowInvScanner] = useState(false);
  const [showInvNewProduct, setShowInvNewProduct] = useState(false);
  const [invNewProductForm, setInvNewProductForm] = useState({ item_code: '', description: '', price: '' });
  const [savingInvNewProduct, setSavingInvNewProduct] = useState(false);
  const [invNewProductError, setInvNewProductError] = useState('');
  const fileRefInvUnit = useRef();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.replace('/login'); return; }
      setProfileId(session.user.id);
      // profiles.id doesn't always match auth.users.id in this app — look up by email instead,
      // same as getCurrentRole() and middleware.js do, or this silently falls through to the
      // 'OTESS' fallback below and resolves techId to the wrong technician.
      const { data: profile } = await supabase.from('profiles').select('name').eq('email', session.user.email).single();
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
    if (!techId) return;
    const today = new Date();
    const todayLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    supabase.from('technician_absences').select('*').eq('technician_id', techId).eq('date', todayLocal).maybeSingle()
      .then(({ data }) => setTodayAbsence(data ?? null));
  }, [techId]);

  // Blocks Clock In on a day with an "ausencia" registered for this technician.
  function getClockBlockMessage() {
    if (!todayAbsence) return null;
    return `Tienes una ausencia registrada hoy${todayAbsence.reason ? ': ' + todayAbsence.reason : ''}. No puedes marcar entrada.`;
  }

  useEffect(() => {
    if (!clockedIn || !activeEntry) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(activeEntry.clocked_in_at)) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [clockedIn, activeEntry]);

  useEffect(() => { if (techId) loadJobs(); }, [jobFilter, techId]);

  async function loadAllJobs() {
    const merged = await fetchTechJobs(techId);
    // This list backs job-picker UI (clock-in/note/photo job selection), so unlike the
    // Jobs/Calendar tabs it should show each job once even if it also has extra work days.
    const seen = new Set();
    const deduped = merged.filter(j => (seen.has(j.id) ? false : (seen.add(j.id), true)));
    const list = deduped
      .filter(j => j.status === 'scheduled' || j.status === 'in_progress')
      .sort((a, b) => new Date(a.scheduled_start ?? 0) - new Date(b.scheduled_start ?? 0));
    setAllJobs(list.slice(0, 20));
  }

  useEffect(() => { if (techId) loadAllJobs(); }, [techId]);

  // Events/tasks/visits assigned to this technician, mirroring the same dual-path pattern as
  // jobs (a direct technician_id column, plus a junction table for calendar_events' multi-tech
  // assignment) so the tech's schedule shows everything, not just jobs.
  async function loadTechScheduleExtras() {
    const [{ data: eventsDirect }, { data: eventsViaJunction }, { data: tasksDirect }, { data: tasksViaJunction }, { data: visitsData }] = await Promise.all([
      supabase.from('calendar_events').select('id, title, notes, address, start_at, end_at, client_id, technician_id, clients(name)').eq('technician_id', techId),
      supabase.from('calendar_event_technicians').select('calendar_events(id, title, notes, address, start_at, end_at, client_id, technician_id, clients(name))').eq('technician_id', techId),
      supabase.from('tasks').select('id, task_type, title, notes, due_at, client_id, technician_id, completed, clients(name), task_items(id, text, done, sort_order)').eq('technician_id', techId),
      supabase.from('task_technicians').select('tasks(id, task_type, title, notes, due_at, client_id, technician_id, completed, clients(name), task_items(id, text, done, sort_order))').eq('technician_id', techId),
      supabase.from('visits').select('id, request_id, scheduled_at, duration_minutes, status, requests(title, clients(name))').eq('technician_id', techId),
    ]);
    const seen = new Set();
    const events = [];
    const addEvent = e => { if (e && !seen.has(e.id)) { seen.add(e.id); events.push(e); } };
    (eventsDirect ?? []).forEach(addEvent);
    (eventsViaJunction ?? []).forEach(row => addEvent(row.calendar_events));

    const seenTasks = new Set();
    const tasks = [];
    const addTask = t => { if (t && !seenTasks.has(t.id)) { seenTasks.add(t.id); tasks.push(t); } };
    (tasksDirect ?? []).forEach(addTask);
    (tasksViaJunction ?? []).forEach(row => addTask(row.tasks));

    setTechEvents(events);
    setTechTasks(tasks);
    setTechVisits(visitsData ?? []);
  }

  useEffect(() => { if (techId) loadTechScheduleExtras(); }, [techId]);

  // Jobs are fetched once per mount/filter change with no realtime subscription, so an admin
  // rescheduling a job from /calendario wouldn't otherwise show up until a hard reload. Refetch
  // whenever the tech brings this tab/app back into focus to keep it reasonably current.
  useEffect(() => {
    if (!techId) return;
    function refreshOnFocus() {
      if (document.visibilityState !== 'visible') return;
      loadJobs();
      loadAllJobs();
      loadTechScheduleExtras();
      if (tab === 'calendar') loadCalendarJobs();
    }
    document.addEventListener('visibilitychange', refreshOnFocus);
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      document.removeEventListener('visibilitychange', refreshOnFocus);
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [techId, tab, jobFilter]);

  useEffect(() => {
    if (!techId) return;
    const weekStart = getPayrollWeekDays()[0];
    supabase.from('time_entries').select('*').eq('technician_id', techId)
      .gte('clocked_in_at', weekStart.toISOString()).order('clocked_in_at', { ascending: false })
      .then(({ data }) => setTimeEntries(data ?? []));
  }, [techId, clockedIn, weekStartKey]);

  // Load this technician's assigned jobs for the calendar
  useEffect(() => {
    if (!techId || tab !== 'calendar') return;
    loadCalendarJobs();
  }, [techId, tab, calendarWeekOffset]);

  async function loadCalendarJobs() {
    setLoadingCalendar(true);
    const merged = await fetchTechJobs(techId);
    setCalendarJobs(merged);
    setLoadingCalendar(false);
  }

  async function loadJobs() {
    setLoading(true);
    let list = await fetchTechJobs(techId);
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
    setDetailPlanos([]);
    setDetailReports([]);
    setDetailClientContacts([]);
    setShowDetailExpenseForm(false);
    const [{ data: notes }, { data: checklist }, { data: jobExpenses }, { data: planos }, { data: reports }, { data: contacts }] = await Promise.all([
      supabase.from('job_notes').select('*').eq('job_id', job.id).order('created_at', { ascending: false }),
      supabase.from('job_checklist_items').select('*').eq('job_id', job.id).order('sort_order'),
      supabase.from('expenses').select('*').eq('job_id', job.id).order('expense_date', { ascending: false }),
      supabase.from('floor_plans').select('id, name, rendered_image_path').eq('job_id', job.id).order('updated_at', { ascending: false }),
      supabase.from('job_reports').select('*').eq('job_id', job.id).order('created_at', { ascending: false }),
      job.client_id ? supabase.from('client_contacts').select('*').eq('client_id', job.client_id).order('is_primary', { ascending: false }) : Promise.resolve({ data: [] }),
    ]);
    setDetailExpenses(jobExpenses ?? []);
    setDetailReports(reports ?? []);
    setDetailClientContacts(contacts ?? []);
    const planosWithThumbs = await Promise.all((planos ?? []).map(async p => {
      const { data } = await supabase.storage.from('floor-plans').createSignedUrl(p.rendered_image_path, 3600);
      return { ...p, thumbUrl: data?.signedUrl ?? null };
    }));
    setDetailPlanos(planosWithThumbs);
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

  function openNewReport() {
    setEditingReportId(null);
    setReportTitle('');
    setReportNoteIds([]);
    setReportVisitDate(new Date().toISOString().slice(0, 10));
    setReportPersonnel(techName ?? '');
    setReportSummary('');
    setReportObservations('');
    setReportRecommendations('');
    setReportPreparedBy('');
    setShowReportModal(true);
  }

  function openEditReport(report) {
    setEditingReportId(report.id);
    setReportTitle(report.title);
    setReportNoteIds(report.note_ids ?? []);
    setReportVisitDate(report.visit_date ?? '');
    setReportPersonnel(report.personnel ?? '');
    setReportSummary(report.summary ?? '');
    setReportObservations(report.observations ?? '');
    setReportRecommendations(report.recommendations ?? '');
    setReportPreparedBy(report.prepared_by ?? '');
    setShowReportModal(true);
  }

  function toggleReportNoteSelection(noteId) {
    setReportNoteIds(prev => prev.includes(noteId) ? prev.filter(id => id !== noteId) : [...prev, noteId]);
  }

  async function saveReport() {
    if (!reportTitle.trim() || !detailJob) return;
    setSavingReport(true);
    const fields = {
      title: reportTitle.trim(),
      note_ids: reportNoteIds,
      visit_date: reportVisitDate || null,
      personnel: reportPersonnel.trim() || null,
      summary: reportSummary.trim() || null,
      observations: reportObservations.trim() || null,
      recommendations: reportRecommendations.trim() || null,
      prepared_by: reportPreparedBy.trim() || null,
    };
    if (editingReportId) {
      const { data } = await supabase.from('job_reports')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', editingReportId).select().single();
      if (data) setDetailReports(prev => prev.map(r => r.id === editingReportId ? data : r));
    } else {
      const { data } = await supabase.from('job_reports')
        .insert([{ job_id: detailJob.id, created_by: profileId, ...fields }])
        .select().single();
      if (data) setDetailReports(prev => [data, ...prev]);
    }
    setSavingReport(false);
    setShowReportModal(false);
  }

  async function deleteReport(reportId) {
    if (!confirm('¿Eliminar este reporte? Las notas no se borran, solo el reporte.')) return;
    await supabase.from('job_reports').delete().eq('id', reportId);
    setDetailReports(prev => prev.filter(r => r.id !== reportId));
  }

  function openReportEmail(report) {
    setEmailingReportId(report.id);
    setReportEmailTo(report.sent_to || detailJob?.clients?.email || '');
    const contactEmails = new Set(detailClientContacts.filter(c => c.email).map(c => c.email));
    const savedCc = report.sent_cc ?? [];
    setReportEmailCc(savedCc.filter(e => contactEmails.has(e)));
    setReportEmailCcExtra(savedCc.filter(e => !contactEmails.has(e)).join(', '));
  }

  function toggleReportCcContact(email) {
    setReportEmailCc(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  }

  async function sendReportEmail(e) {
    e.preventDefault();
    setSendingReport(true);
    const extraCc = reportEmailCcExtra.split(',').map(s => s.trim()).filter(Boolean);
    const cc = [...new Set([...reportEmailCc, ...extraCc])];
    const res = await fetch('/api/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: emailingReportId, toEmail: reportEmailTo, cc }),
    });
    const data = await res.json();
    setSendingReport(false);
    if (data.success) {
      setDetailReports(prev => prev.map(r => r.id === emailingReportId ? { ...r, sent_at: new Date().toISOString(), sent_to: reportEmailTo, sent_cc: cc.length ? cc : null } : r));
      setEmailingReportId(null);
    } else {
      alert('Error: ' + data.error);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.replace('/login');
  }

  async function handleClockIn(jobId) {
    if (!techId) return;
    const blockMessage = getClockBlockMessage();
    if (blockMessage) { alert(blockMessage); setShowFab(false); setShowJobClock(false); return; }
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

  useEffect(() => { if (techId && tab === 'time') loadWeekDayForms(); }, [techId, tab, weekStartKey]);

  // Detect the Wed payroll-week rollover while the app stays open (installed PWA left
  // running across midnight) so stale hours from the prior week get cleared instead of
  // lingering until the user manually reloads.
  useEffect(() => {
    function syncWeekStart() {
      const key = dayKey(getPayrollWeekDays()[0]);
      setWeekStartKey(prev => {
        if (prev && prev !== key) {
          setWeekDayForms({});
          setSelectedDay(null);
        }
        return key;
      });
    }
    syncWeekStart();
    const interval = setInterval(syncWeekStart, 60000);
    document.addEventListener('visibilitychange', syncWeekStart);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', syncWeekStart); };
  }, []);

  function updateDayForm(key, patch) {
    setWeekDayForms(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function isAbsenceBlockedDay(dateObj) {
    if (!todayAbsence) return false;
    const localKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    return localKey === todayAbsence.date;
  }

  async function saveDayForm(dateObj) {
    const key = dayKey(dateObj);
    const form = weekDayForms[key];
    if (!form?.entryHour || !form?.exitHour) return;
    if (isAbsenceBlockedDay(dateObj)) {
      setDayFormStatus(prev => ({ ...prev, [key]: 'blocked' }));
      return;
    }
    setSavingDay(key);
    setDayFormStatus(prev => ({ ...prev, [key]: null }));
    const to24 = (hour, ampm) => { let h = parseInt(hour, 10) % 12; if (ampm === 'PM') h += 12; return h; };
    const clockedIn = new Date(dateObj);
    clockedIn.setHours(to24(form.entryHour, form.entryAmPm), parseInt(form.entryMinute, 10) || 0, 0, 0);
    const clockedOut = new Date(dateObj);
    clockedOut.setHours(to24(form.exitHour, form.exitAmPm), parseInt(form.exitMinute, 10) || 0, 0, 0);
    if (computeHours(clockedIn.toISOString(), clockedOut.toISOString(), form.lunch ? 60 : 0).invalid) {
      setSavingDay(null);
      setDayFormStatus(prev => ({ ...prev, [key]: 'invalid' }));
      return;
    }
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
    setEditEntryError('');
  }

  async function saveEntryEdit(entry) {
    if (!editEntryIn) return;
    const baseDate = entry.clocked_in_at.slice(0, 10);
    const newIn = new Date(baseDate + 'T' + editEntryIn + ':00');
    const newOut = editEntryOut ? new Date(baseDate + 'T' + editEntryOut + ':00') : null;
    if (newOut && computeHours(newIn.toISOString(), newOut.toISOString(), entry.lunch_minutes).invalid) {
      setEditEntryError('La salida debe ser después de la entrada.');
      return;
    }
    setEditEntryError('');
    setSavingEntry(true);
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
      job_id: detailJob.id, description: newCheckItem.trim(), sort_order: detailChecklist.filter(i => !i.__placeholder).length,
    }]).select().single();
    if (data) setDetailChecklist(prev => [...prev, data]);
    setNewCheckItem('');
  }

  function addArea() {
    if (!newAreaName.trim()) return;
    setAddingArea(false);
    setDetailChecklist(prev => [...prev, {
      id: '__placeholder__' + Date.now(),
      job_id: detailJob.id,
      description: '',
      group_name: newAreaName.trim(),
      completed: false,
      sort_order: prev.length,
      __placeholder: true,
    }]);
    setNewAreaName('');
  }

  async function addItemToArea(groupName) {
    const key = groupName ?? '__none__';
    const text = newAreaItemText[key] ?? '';
    if (!text.trim()) return;
    const { data } = await supabase.from('job_checklist_items').insert([{
      job_id: detailJob.id,
      description: text.trim(),
      sort_order: detailChecklist.filter(i => !i.__placeholder).length,
      group_name: groupName || null,
    }]).select().single();
    if (data) setDetailChecklist(prev => [
      ...prev.filter(i => !(i.__placeholder && i.group_name === groupName)),
      data,
    ]);
    setNewAreaItemText(prev => ({ ...prev, [key]: '' }));
    setAddingItemArea(null);
  }

  async function renameArea(oldName) {
    const newName = prompt(`Renombrar área "${oldName}":`, oldName);
    if (!newName || newName === oldName) return;
    await supabase.from('job_checklist_items').update({ group_name: newName })
      .eq('job_id', detailJob.id).eq('group_name', oldName);
    setDetailChecklist(prev => prev.map(i => i.group_name === oldName ? { ...i, group_name: newName } : i));
    setAreaMenuOpen(null);
  }

  async function deleteArea(groupName) {
    if (!confirm(`¿Eliminar el área "${groupName}" y todos sus ítems?`)) return;
    await supabase.from('job_checklist_items').delete().eq('job_id', detailJob.id).eq('group_name', groupName);
    setDetailChecklist(prev => prev.filter(i => i.group_name !== groupName));
    setAreaMenuOpen(null);
  }

  async function deleteCheckItem(itemId) {
    setCheckItemMenuOpen(null);
    await supabase.from('job_checklist_items').delete().eq('id', itemId);
    setDetailChecklist(prev => prev.filter(i => i.id !== itemId));
  }

  function startEditCheckItem(item) {
    setEditingCheckItemId(item.id);
    setEditingCheckItemText(item.description);
    setCheckItemMenuOpen(null);
  }

  async function saveEditCheckItem(itemId) {
    const text = editingCheckItemText.trim();
    setEditingCheckItemId(null);
    if (!text) return;
    await supabase.from('job_checklist_items').update({ description: text }).eq('id', itemId);
    setDetailChecklist(prev => prev.map(i => i.id === itemId ? { ...i, description: text } : i));
  }

  async function duplicateCheckItem(item) {
    setCheckItemMenuOpen(null);
    const { data } = await supabase.from('job_checklist_items').insert([{
      job_id: detailJob.id,
      description: item.description,
      group_name: item.group_name,
      sort_order: detailChecklist.filter(i => !i.__placeholder).length,
      completed: false,
    }]).select().single();
    if (data) setDetailChecklist(prev => [...prev, data]);
  }

  async function reorderCheckItems(targetGroupKey, draggedId, targetItemId) {
    if (draggedId === targetItemId) return;
    const allReal = detailChecklist.filter(i => !i.__placeholder);
    const dragged = allReal.find(i => i.id === draggedId);
    if (!dragged) return;
    const targetGroupName = targetGroupKey === '__none__' ? null : targetGroupKey;
    const groupOrder = [];
    const groupsMap = {};
    allReal.forEach(i => {
      if (i.id === draggedId) return;
      const g = i.group_name || '__none__';
      if (!groupsMap[g]) { groupsMap[g] = []; groupOrder.push(g); }
      groupsMap[g].push(i);
    });
    if (!groupsMap[targetGroupKey]) { groupsMap[targetGroupKey] = []; groupOrder.push(targetGroupKey); }
    const targetArr = groupsMap[targetGroupKey];
    const insertAt = targetItemId ? targetArr.findIndex(i => i.id === targetItemId) : targetArr.length;
    const movedItem = { ...dragged, group_name: targetGroupName };
    if (insertAt === -1) targetArr.push(movedItem);
    else targetArr.splice(insertAt, 0, movedItem);
    const reordered = groupOrder.flatMap(g => groupsMap[g]).map((it, idx) => ({ ...it, sort_order: idx }));
    const placeholders = detailChecklist.filter(i => i.__placeholder);
    setDetailChecklist([...reordered, ...placeholders]);
    await Promise.all(reordered.map(u => supabase.from('job_checklist_items').update({ sort_order: u.sort_order, group_name: u.group_name }).eq('id', u.id)));
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

  function closeNewClientModal() {
    setShowNewClient(false);
    setNewClientForm(blankClientForm());
    setNewClientAddr({ line1: '', city: '', zip: '' });
    setNewClientError('');
  }

  async function saveNewClient(e) {
    e.preventDefault();
    if (!newClientForm.name.trim()) { setNewClientError('El nombre es requerido'); return; }
    setSavingNewClient(true);
    setNewClientError('');
    const { data: client, error: err } = await supabase.from('clients').insert([newClientForm]).select().single();
    if (err) { setNewClientError('No se pudo guardar. Intenta de nuevo.'); setSavingNewClient(false); return; }
    if (newClientAddr.line1.trim()) {
      await supabase.from('client_properties').insert([{
        client_id: client.id, street: newClientAddr.line1.trim(), city: newClientAddr.city.trim(), state: 'PR', zip: newClientAddr.zip.trim(), is_primary: true,
      }]);
    }
    setSavingNewClient(false);
    setShowFab(false);
    closeNewClientModal();
    setClientSearch('');
    setClientResults(prev => [client, ...prev]);
    openClientDetail(client);
  }

  // Inventario: cargado una sola vez al abrir el tab (locations rara vez cambian en el turno).
  useEffect(() => {
    if (tab !== 'inventario' || invLoaded) return;
    (async () => {
      const [{ data: locs }, { data: stockRows }, { data: prods }, { data: unitRows }] = await Promise.all([
        supabase.from('locations').select('*').eq('is_active', true).order('name'),
        supabase.from('location_stock').select('*, catalog_items(item_code, description)'),
        supabase.from('catalog_items').select('id, item_code, description').eq('type', 'product').order('item_code'),
        supabase.from('location_stock_units').select('*, catalog_items(item_code, description)').order('created_at', { ascending: false }),
      ]);
      setInvLocations(locs ?? []);
      setInvStock(stockRows ?? []);
      setInvProducts(prods ?? []);
      const unitsWithUrls = await Promise.all((unitRows ?? []).map(async u => ({ ...u, photo_signed_url: u.photo_path ? await getSignedUrl(u.photo_path) : null })));
      setInvUnits(unitsWithUrls);
      const savedLocationId = localStorage.getItem('otess-crew-inv-location');
      if (savedLocationId && (locs ?? []).some(l => l.id === savedLocationId)) {
        setInvLocationId(savedLocationId);
      }
      setInvLoaded(true);
    })();
  }, [tab, invLoaded]);

  // Recuerda la última ubicación elegida entre visitas al tab (y entre sesiones).
  useEffect(() => {
    if (invLocationId) localStorage.setItem('otess-crew-inv-location', invLocationId);
  }, [invLocationId]);

  const invLocById = Object.fromEntries(invLocations.map(l => [l.id, l]));
  const INV_TYPE_ICON = { warehouse: '🏢', site: '📍', van: '🚐', zone: '🗂️', shelf: '📚', bin: '🗃️' };
  function invPathLabel(loc) {
    const parts = [];
    let cur = loc;
    while (cur) { parts.unshift(cur.name); cur = cur.parent_id ? invLocById[cur.parent_id] : null; }
    return parts.join(' › ');
  }
  const invLocOptions = [...invLocations]
    .map(l => ({ id: l.id, label: `${INV_TYPE_ICON[l.type] ?? ''} ${invPathLabel(l)}`.trim() }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const invLocationQueryTerm = invLocationQuery.trim().toLowerCase();
  const invLocationResults = invLocationQueryTerm
    ? invLocOptions.filter(o => o.label.toLowerCase().includes(invLocationQueryTerm))
    : invLocOptions;
  const invSelectedLocation = invLocOptions.find(o => o.id === invLocationId) ?? null;

  function selectInvLocation(loc) {
    setInvLocationId(loc.id);
    setInvLocationQuery('');
    setInvLocationOpen(false);
  }

  function clearInvLocation() {
    setInvLocationId('');
    setInvLocationQuery('');
  }

  const invStockSearchTerm = invStockSearch.trim().toLowerCase();
  const invSelectedStock = invStock.filter(s => s.location_id === invLocationId
    && (!invStockSearchTerm || s.catalog_items?.description?.toLowerCase().includes(invStockSearchTerm) || s.catalog_items?.item_code?.toLowerCase().includes(invStockSearchTerm)));
  const invUnitSearchTerm = invUnitSearch.trim().toLowerCase();
  const invSelectedUnits = invUnits.filter(u => u.location_id === invLocationId
    && (!invUnitSearchTerm || u.catalog_items?.description?.toLowerCase().includes(invUnitSearchTerm) || u.catalog_items?.item_code?.toLowerCase().includes(invUnitSearchTerm) || u.serial_number.toLowerCase().includes(invUnitSearchTerm)));

  function handleInvUnitPhotoSelect(file) {
    if (!file) return;
    setInvUnitPhotoFile(file);
    setInvUnitPhotoPreview(URL.createObjectURL(file));
  }

  function closeInvAddUnitModal() {
    setShowInvAddUnit(false);
    setInvUnitForm({ catalog_item_id: '', serial_number: '', notes: '' });
    setInvUnitPhotoFile(null);
    setInvUnitPhotoPreview(null);
    setInvUnitUploadProgress(0);
    setInvUnitError('');
    setShowInvNewProduct(false);
    setInvNewProductForm({ item_code: '', description: '', price: '' });
    setInvNewProductError('');
  }

  // Crear un producto de catálogo al vuelo desde Agregar Equipo, mismo insert que usa
  // app/catalogo/CatalogoClient.js::addItem, para no obligar al técnico a ir primero a Catálogo.
  async function createInvProduct() {
    if (!invNewProductForm.item_code.trim() || !invNewProductForm.description.trim()) {
      setInvNewProductError('Escribe el nombre y la descripción.');
      return;
    }
    setSavingInvNewProduct(true);
    setInvNewProductError('');
    const { data, error } = await supabase.from('catalog_items').insert([{
      type: 'product',
      item_code: invNewProductForm.item_code.trim(),
      description: invNewProductForm.description.trim(),
      price: parseFloat(invNewProductForm.price) || 0,
    }]).select('id, item_code, description').single();
    setSavingInvNewProduct(false);
    if (error) { setInvNewProductError('No se pudo crear el producto. Intenta de nuevo.'); return; }
    setInvProducts(prev => [...prev, data].sort((a, b) => a.item_code.localeCompare(b.item_code)));
    setInvUnitForm(f => ({ ...f, catalog_item_id: data.id }));
    setShowInvNewProduct(false);
    setInvNewProductForm({ item_code: '', description: '', price: '' });
  }

  async function invAddUnit() {
    if (!invUnitForm.catalog_item_id || !invUnitForm.serial_number.trim() || !invLocationId) {
      setInvUnitError('Selecciona un producto y escribe el serial number.');
      return;
    }
    setInvSavingUnit(true);
    setInvUnitError('');
    let photo_path = null;
    if (invUnitPhotoFile) {
      const ext = invUnitPhotoFile.name.split('.').pop();
      photo_path = `inventory/${invUnitForm.catalog_item_id}/${Date.now()}.${ext}`;
      const { error: upErr } = await uploadFileWithProgress('Job-photos', photo_path, invUnitPhotoFile, setInvUnitUploadProgress);
      if (upErr) { setInvSavingUnit(false); setInvUnitError('No se pudo subir la foto. Intenta de nuevo.'); return; }
    }
    const { data, error } = await supabase.from('location_stock_units').insert([{
      location_id: invLocationId,
      catalog_item_id: invUnitForm.catalog_item_id,
      serial_number: invUnitForm.serial_number.trim(),
      photo_path,
      notes: invUnitForm.notes.trim() || null,
      created_by: profileId,
    }]).select('*, catalog_items(item_code, description)').single();
    setInvSavingUnit(false);
    if (error) {
      setInvUnitError(error.code === '23505' ? 'Ese serial number ya existe en el sistema.' : 'No se pudo guardar. Intenta de nuevo.');
      return;
    }
    const photo_signed_url = photo_path ? await getSignedUrl(photo_path) : null;
    setInvUnits(prev => [{ ...data, photo_signed_url }, ...prev]);
    closeInvAddUnitModal();
  }

  async function invAdjustStock() {
    const delta = parseFloat(invAdjustForm.delta);
    if (!invAdjustForm.catalog_item_id || !delta || !invLocationId) return;
    setInvSaving(true);
    const { error } = await supabase.rpc('adjust_catalog_stock', {
      p_catalog_item_id: invAdjustForm.catalog_item_id,
      p_delta: delta,
      p_invoice_id: null,
      p_reason: invAdjustForm.reason.trim() || 'ajuste_tecnico',
      p_location_id: invLocationId,
    });
    setInvSaving(false);
    if (error) { alert('Error: ' + error.message); return; }
    setInvStock(prev => {
      const idx = prev.findIndex(s => s.location_id === invLocationId && s.catalog_item_id === invAdjustForm.catalog_item_id);
      if (idx === -1) {
        const prod = invProducts.find(p => p.id === invAdjustForm.catalog_item_id);
        return [...prev, { id: `tmp-${Date.now()}`, location_id: invLocationId, catalog_item_id: invAdjustForm.catalog_item_id, quantity: delta, catalog_items: prod ? { item_code: prod.item_code, description: prod.description } : null }];
      }
      return prev.map((s, i) => i === idx ? { ...s, quantity: s.quantity + delta } : s);
    });
    setShowInvAdjust(false);
    setInvAdjustForm({ catalog_item_id: '', delta: '', reason: '' });
  }

  const fmtE = s => String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  const fmtH = es => (es.reduce((a, e) => a + (e.clocked_out_at ? computeHours(e.clocked_in_at, e.clocked_out_at, e.lunch_minutes).hours : 0), 0)).toFixed(1) + 'h';
  // Job the technician is currently clocked into, used to skip the "select job" step in the FAB
  const activeJob = clockedIn && activeEntry?.job_id ? allJobs.find(j => j.id === activeEntry.job_id) ?? null : null;
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
  const fmi = c => ({ background: c || ORANGE, color: '#fff', border: 'none', borderRadius: 50, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 8 });
  const menuItem = { display: 'block', width: '100%', textAlign: 'left', padding: '13px 16px', background: 'none', border: 'none', borderBottom: '1px solid #eee', fontSize: 14, fontWeight: 600, color: '#333', cursor: 'pointer' };
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
          {j.scheduled_start && <div style={{ fontSize: 12, color: '#aaa', marginTop: 3 }}>📅 {formatDatePR(j.scheduled_start, { weekday: 'short', month: 'short', day: 'numeric' }, 'en-US')}</div>}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: SC[j.status], background: SC[j.status] + '18', padding: '4px 10px', borderRadius: 20, marginLeft: 10, whiteSpace: 'nowrap' }}>{SL[j.status]}</span>
      </div>
    );
  };

  const fmtMoney = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const totalDetailExpenses = detailExpenses.reduce((a, e) => a + Number(e.amount ?? 0), 0);
  const realChecklistCount = detailChecklist.filter(i => !i.__placeholder).length;
  const completedCount = detailChecklist.filter(i => i.completed && !i.__placeholder).length;
  const progress = realChecklistCount > 0 ? Math.round((completedCount / realChecklistCount) * 100) : 0;

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

  // Events/tasks/visits shown as if they were "just another job" in the calendar and today's
  // schedule lists — same row shape, so JobRow/the calendar timeline render them without change.
  // Tapping one opens a lightweight read-only detail (setDetailEntry) instead of the full job
  // clock-in/photos/expenses flow, since those actions don't apply to a task or a visit.
  const VISIT_STATUS_MAP = { agendada: 'scheduled', en_progreso: 'in_progress', completada: 'completed', cancelada: 'cancelled' };
  function normalizeEntry(kind, raw) {
    if (kind === 'event') {
      return {
        id: `event-${raw.id}`, title: `📌 ${raw.title}`, clients: raw.clients, property_name: raw.address ?? null,
        street: null, city: null, state: null, zip: null,
        scheduled_start: raw.start_at, status: 'scheduled', _kind: 'event', _raw: raw,
      };
    }
    if (kind === 'task') {
      const icon = raw.task_type === 'checklist' ? '☑' : '🔔';
      return {
        id: `task-${raw.id}`, title: `${icon} ${raw.title}`, clients: raw.clients, property_name: null,
        street: null, city: null, state: null, zip: null,
        scheduled_start: raw.due_at, status: raw.completed ? 'completed' : 'scheduled', _kind: 'task', _raw: raw,
      };
    }
    // visit
    return {
      id: `visit-${raw.id}`, title: `👁 ${raw.requests?.title ?? 'Visita'}`, clients: raw.requests?.clients, property_name: null,
      street: null, city: null, state: null, zip: null,
      scheduled_start: raw.scheduled_at, status: VISIT_STATUS_MAP[raw.status] ?? 'scheduled', _kind: 'visit', _raw: raw,
    };
  }

  const calendarEntries = [
    ...calendarJobs,
    ...techEvents.map(e => normalizeEntry('event', e)),
    ...techTasks.map(t => normalizeEntry('task', t)),
    ...techVisits.map(v => normalizeEntry('visit', v)),
  ];

  const jobsForSelectedDay = calendarEntries
    .filter(j => j.scheduled_start && sameDay(new Date(j.scheduled_start), calendarSelectedDate))
    .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));

  const jobDaysSet = new Set(calendarEntries.filter(j => j.scheduled_start).map(j => new Date(j.scheduled_start).toDateString()));

  function openEntry(entry) {
    if (entry._kind) setDetailEntry(entry);
    else openJobDetail(entry);
  }

  // "Today's schedule" on Home mixes in today's events/tasks/visits alongside jobs, same idea
  // as the Calendar tab above.
  const todayBounds = (() => { const s = new Date(); s.setHours(0, 0, 0, 0); const e = new Date(s); e.setDate(e.getDate() + 1); return [s, e]; })();
  const isToday = iso => { if (!iso) return false; const d = new Date(iso); return d >= todayBounds[0] && d < todayBounds[1]; };
  const todayEntries = [
    ...jobs,
    ...techEvents.filter(e => isToday(e.start_at)).map(e => normalizeEntry('event', e)),
    ...techTasks.filter(t => isToday(t.due_at)).map(t => normalizeEntry('task', t)),
    ...techVisits.filter(v => isToday(v.scheduled_at)).map(v => normalizeEntry('visit', v)),
  ].sort((a, b) => new Date(a.scheduled_start ?? 0) - new Date(b.scheduled_start ?? 0));

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: BG, fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif', display: 'flex', flexDirection: 'column', maxWidth: 430, margin: '0 auto', paddingTop: 'env(safe-area-inset-top,0px)' }}>
      <div
        ref={scrollRef}
        onTouchStart={handlePullStart}
        onTouchMove={handlePullMove}
        onTouchEnd={handlePullEnd}
        style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: pullY, overflow: 'hidden', transition: pulling.current ? 'none' : 'height 0.2s' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: refreshing ? 'none' : `rotate(${Math.min(pullY / PULL_THRESHOLD, 1) * 180}deg)`, animation: refreshing ? 'crew-ptr-spin 0.7s linear infinite' : 'none' }}>
            <path d="M4 12a8 8 0 0 1 14.5-4.65M20 12a8 8 0 0 1-14.5 4.65" />
            <path d="M4 4v4h4M20 20v-4h-4" />
          </svg>
        </div>
        <style>{`@keyframes crew-ptr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

        {tab === 'home' && (
          <div>
            <div style={{ padding: '20px 20px 8px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{DAYS[now.getDay()].toUpperCase()}, {MON[now.getMonth()]} {now.getDate()}</span>
            </div>
            <div style={{ padding: '0 20px 20px' }}><div style={{ fontSize: 27, fontWeight: 700 }}>{greeting}, {techName}</div></div>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 40, height: 40, background: BG, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⏱</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{clockedIn ? 'Clocked in' : 'Not clocked in'}</div>
                  <div style={{ fontSize: 12, color: !clockedIn && getClockBlockMessage() ? '#c04a1a' : '#888' }}>
                    {clockedIn ? fmtE(elapsed) : (getClockBlockMessage() ?? 'Tap to start your shift')}
                  </div>
                </div>
                <button disabled={!clockedIn && !!getClockBlockMessage()}
                  style={{ background: clockedIn ? '#1a7a4a' : (getClockBlockMessage() ? '#ccc' : ORANGE), color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: (!clockedIn && getClockBlockMessage()) ? 'not-allowed' : 'pointer' }}
                  onClick={clockedIn ? handleClockOut : () => handleClockIn()}>
                  {clockedIn ? 'Clock Out' : 'Clock In'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 20px 12px' }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>Today's schedule</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: ORANGE, cursor: 'pointer' }} onClick={() => setTab('jobs')}>View all</span>
            </div>
            <div style={card}>
              {todayEntries.length === 0
                ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#888' }}>No jobs scheduled today.</div>
                : todayEntries.slice(0, 3).map(j => <JobRow key={j.id} j={j} onClick={() => openEntry(j)} />)
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
                  <div style={{ fontSize: 12, color: !clockedIn && getClockBlockMessage() ? '#c04a1a' : '#888' }}>
                    {clockedIn ? fmtE(elapsed) : (getClockBlockMessage() ?? fmtH(timeEntries) + ' logged this week')}
                  </div>
                </div>
                <button disabled={!clockedIn && !!getClockBlockMessage()}
                  style={{ background: clockedIn ? '#1a7a4a' : (getClockBlockMessage() ? '#eee' : '#f5ddd3'), color: clockedIn ? '#fff' : '#c04a1a', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: (!clockedIn && getClockBlockMessage()) ? 'not-allowed' : 'pointer' }}
                  onClick={clockedIn ? handleClockOut : () => handleClockIn()}>
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
                  ? computeHours(e.clocked_in_at, e.clocked_out_at, e.lunch_minutes).hours
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
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#16223d' }}>
                  {selectedDay.date.toLocaleDateString('es-PR', { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
                {selectedDay.entries.map((e, i) => {
                  const inTime = new Date(e.clocked_in_at);
                  const outTime = e.clocked_out_at ? new Date(e.clocked_out_at) : null;
                  const { hours: durHours, invalid: durInvalid } = outTime ? computeHours(e.clocked_in_at, e.clocked_out_at, e.lunch_minutes) : { hours: 0, invalid: false };
                  const dur = outTime ? durHours.toFixed(2) : null;
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
                            <button onClick={() => { setEditingEntryId(null); setEditEntryError(''); }}
                              style={{ background: '#f0f0f0', color: '#333', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                              Cancelar
                            </button>
                          </div>
                          {editEntryError && <div style={{ color: '#e74c3c', fontSize: 12, width: '100%' }}>⚠️ {editEntryError}</div>}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < selectedDay.entries.length - 1 ? '1px solid #eee' : 'none' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {formatTimePR(inTime, { hour: '2-digit', minute: '2-digit' })}
                          {outTime ? ' → ' + formatTimePR(outTime, { hour: '2-digit', minute: '2-digit' }) : ' → En progreso'}
                        </div>
                        {e.job_id && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>Con trabajo</div>}
                        {(e.lunch_minutes ?? 0) > 0 && <div style={{ fontSize: 11, color: ORANGE, marginTop: 2 }}>🍽️ Lunch -{(e.lunch_minutes / 60).toFixed(1)}h</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {durInvalid && <span style={{ fontSize: 11, fontWeight: 700, color: '#e74c3c' }} title="Salida antes de la entrada o almuerzo mayor al turno">⚠️</span>}
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
              const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
              const isFutureDay = dateObj > todayStart;
              const isBlockedDay = isAbsenceBlockedDay(dateObj);
              return (
                <div key={key} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isFutureDay ? 0 : 14 }}>
                    <div><span style={{ fontWeight: 700, fontSize: 16 }}>{dayLabel}</span> <span style={{ color: '#888', fontSize: 13 }}>{dateLabel}</span></div>
                    {!isFutureDay && (
                      <button onClick={() => saveDayForm(dateObj)} disabled={saving || !form.entryHour || !form.exitHour || isBlockedDay}
                        style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (!form.entryHour || !form.exitHour || isBlockedDay) ? 0.5 : 1 }}>
                        {saving ? '...' : '💾'}
                      </button>
                    )}
                  </div>

                  {isBlockedDay && (
                    <div style={{ marginBottom: 14, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600 }}>
                      🚫 Ausencia registrada este día{todayAbsence.reason ? ': ' + todayAbsence.reason : ''}. No puedes registrar horas.
                    </div>
                  )}

                  {isFutureDay ? (
                    <div style={{ padding: '8px 0 2px', color: '#aaa', fontSize: 13 }}>Disponible cuando llegue este día</div>
                  ) : (
                  <>
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
                  {dayFormStatus[key] === 'invalid' && (
                    <div style={{ marginTop: 10, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600 }}>
                      ⚠️ La salida debe ser después de la entrada (revisa a.m./p.m.).
                    </div>
                  )}
                  {dayFormStatus[key] === 'blocked' && (
                    <div style={{ marginTop: 10, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600 }}>
                      🚫 No puedes registrar horas — ausencia registrada este día.
                    </div>
                  )}
                  </>
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
                  <div key={j._scheduleDayId ? `day-${j._scheduleDayId}` : `${j.id}-${i}`} onClick={() => openEntry(j)} style={{ display: 'flex', gap: 12, paddingBottom: i < jobsForSelectedDay.length - 1 ? 16 : 0, marginBottom: i < jobsForSelectedDay.length - 1 ? 16 : 0, borderBottom: i < jobsForSelectedDay.length - 1 ? '1px solid #eee' : 'none', cursor: 'pointer' }}>
                    <div style={{ width: 62, flexShrink: 0, fontSize: 13, fontWeight: 700, color: ORANGE }}>
                      {formatTimePR(j.scheduled_start, { hour: 'numeric', minute: '2-digit' }, 'en-US')}
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

        {tab === 'inventario' && (
          <div>
            <div style={{ padding: '20px 20px 16px' }}>
              <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 14 }}>Inventario</div>
              <div style={{ position: 'relative' }}>
                {invLocationId && !invLocationOpen ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div onClick={() => setInvLocationOpen(true)} style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'pointer', fontSize: 15 }}>
                      {invSelectedLocation?.label ?? 'Ubicación'}
                    </div>
                    <button onClick={clearInvLocation} style={{ background: '#fff', border: 'none', borderRadius: 12, width: 44, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'pointer', fontSize: 15, color: '#888' }}>✕</button>
                  </div>
                ) : (
                  <div style={{ background: '#fff', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <span>🔍</span>
                    <input
                      autoFocus={invLocationOpen}
                      value={invLocationQuery}
                      onChange={e => setInvLocationQuery(e.target.value)}
                      onFocus={() => setInvLocationOpen(true)}
                      placeholder="Buscar ubicación..."
                      style={{ border: 'none', background: 'none', fontSize: 15, outline: 'none', width: '100%' }}
                    />
                  </div>
                )}
                {invLocationOpen && (
                  <>
                    <div onClick={() => setInvLocationOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 11, maxHeight: 280, overflowY: 'auto' }}>
                      {invLocationResults.length === 0 ? (
                        <div style={{ padding: '14px', color: '#aaa', fontSize: 13 }}>Sin resultados.</div>
                      ) : invLocationResults.map(o => (
                        <div key={o.id} onClick={() => selectInvLocation(o)} style={{ padding: '12px 14px', borderBottom: '1px solid #eee', cursor: 'pointer', fontSize: 14 }}>{o.label}</div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {!invLoaded ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#888' }}>Cargando...</div>
            ) : !invLocationId ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#aaa' }}>Elige una ubicación para ver su stock.</div>
            ) : (
              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#888' }}>STOCK ({invSelectedStock.length})</div>
                  <button onClick={() => setShowInvAdjust(true)} style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Ajustar</button>
                </div>
                <input
                  value={invStockSearch}
                  onChange={e => setInvStockSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #eee', borderRadius: 8, fontSize: 13, outline: 'none', marginBottom: 10 }}
                />
                {invSelectedStock.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa' }}>Sin productos en esta ubicación.</div>
                ) : (
                  invSelectedStock.map((s, idx) => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: idx < invSelectedStock.length - 1 ? '1px solid #eee' : 'none' }}>
                      <div>
                        <div style={{ fontFamily: 'monospace', fontSize: 11, color: AMBER }}>{s.catalog_items?.item_code}</div>
                        <div style={{ fontSize: 14 }}>{s.catalog_items?.description}</div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: s.quantity <= 0 ? '#b52a2a' : '#16223d' }}>{s.quantity}</div>
                    </div>
                  ))
                )}
              </div>
            )}

            {invLoaded && invLocationId && (
              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#888' }}>EQUIPO ({invSelectedUnits.length})</div>
                  <button onClick={() => setShowInvAddUnit(true)} style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Agregar equipo</button>
                </div>
                <input
                  value={invUnitSearch}
                  onChange={e => setInvUnitSearch(e.target.value)}
                  placeholder="Buscar equipo (serial, descripción)..."
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #eee', borderRadius: 8, fontSize: 13, outline: 'none', marginBottom: 10 }}
                />
                {invSelectedUnits.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa' }}>Sin equipo registrado en esta ubicación.</div>
                ) : (
                  invSelectedUnits.map((u, idx) => (
                    <div key={u.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: idx < invSelectedUnits.length - 1 ? '1px solid #eee' : 'none' }}>
                      {u.photo_signed_url ? (
                        <img src={u.photo_signed_url} alt={u.serial_number} onClick={() => setLightbox({ urls: [u.photo_signed_url], index: 0 })}
                          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 48, height: 48, borderRadius: 8, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📦</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{u.catalog_items?.description}</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 12, color: AMBER }}>SN: {u.serial_number}</div>
                        {u.notes && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{u.notes}</div>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
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
                          {j.scheduled_start && <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>{formatDatePR(j.scheduled_start, { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
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
            {[['info', '📋 Info'], ['checklist', `✅ (${completedCount}/${realChecklistCount})`], ['notes', `📸 (${detailNotes.length})`], ['gastos', `💸 ${detailExpenses.length > 0 ? fmtMoney(totalDetailExpenses) : ''}`], ['reports', `📄 (${detailReports.length})`]].map(([t, label]) => (
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
                    <div style={{ fontSize: 14 }}>{formatDateTimePR(detailJob.scheduled_start, { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
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

                {/* Planos */}
                {detailPlanos.length > 0 && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 8 }}>🗺️ Planos</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {detailPlanos.map(p => (
                        <a key={p.id} href={`/planos/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                          {p.thumbUrl
                            ? <img src={p.thumbUrl} alt={p.name} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee', flexShrink: 0 }} />
                            : <div style={{ width: 52, height: 52, borderRadius: 8, background: '#f0f0f0', flexShrink: 0 }} />}
                          <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CHECKLIST TAB */}
            {detailTab === 'checklist' && (
              <div>
                {realChecklistCount > 0 && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>Progreso</span>
                      <span style={{ fontWeight: 700, color: progress === 100 ? '#1a7a4a' : ORANGE }}>{progress}%</span>
                    </div>
                    <div style={{ background: '#eee', borderRadius: 50, height: 8 }}>
                      <div style={{ background: progress === 100 ? '#1a7a4a' : ORANGE, borderRadius: 50, height: 8, width: progress + '%', transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>{completedCount} de {realChecklistCount} completados</div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button onClick={() => setAddingArea(true)} style={{ flex: 1, background: '#fff', color: ORANGE, border: `1.5px solid ${ORANGE}`, borderRadius: 10, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Nueva área</button>
                </div>

                {addingArea && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', gap: 8 }}>
                    <input autoFocus value={newAreaName} onChange={e => setNewAreaName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addArea()}
                      placeholder="Nombre del área (ej: Área 1)..." style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #dde1e7', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
                    <button onClick={addArea} style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>Crear</button>
                    <button onClick={() => { setAddingArea(false); setNewAreaName(''); }} style={{ background: 'none', border: '1.5px solid #dde1e7', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', color: '#888' }}>×</button>
                  </div>
                )}

                <div style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <form onSubmit={addCheckItem} style={{ display: 'flex', gap: 8 }}>
                    <input value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)} placeholder="Agregar ítem (sin área)..." style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #dde1e7', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
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
                    return Object.entries(groupedMap).map(([groupKey, items]) => {
                      const groupName = groupKey === '__none__' ? null : groupKey;
                      const realItems = items.filter(i => !i.__placeholder);
                      return (
                      <div key={groupKey}
                        onDragOver={e => { e.preventDefault(); if (dragCheckItem) setDragOverArea(groupKey); }}
                        onDragLeave={() => setDragOverArea(prev => prev === groupKey ? null : prev)}
                        onDrop={e => { e.preventDefault(); if (dragCheckItem) reorderCheckItems(groupKey, dragCheckItem.id, null); setDragCheckItem(null); setDragOverArea(null); }}
                        style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', outline: dragOverArea === groupKey ? `2px dashed ${ORANGE}` : 'none', outlineOffset: 2 }}>
                        {groupName && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #eee' }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: ORANGE, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              📁 {groupName}
                            </div>
                            <div style={{ position: 'relative' }}>
                              <button onClick={() => setAreaMenuOpen(areaMenuOpen === groupKey ? null : groupKey)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 20, lineHeight: 1, padding: '2px 6px' }}>⋮</button>
                              {areaMenuOpen === groupKey && (
                                <>
                                  <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setAreaMenuOpen(null)} />
                                  <div style={{ position: 'absolute', right: 0, top: 28, background: '#fff', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid #eee', zIndex: 99, minWidth: 160, overflow: 'hidden' }}>
                                    <button onClick={() => renameArea(groupName)} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, cursor: 'pointer' }}>✏️ Renombrar</button>
                                    <button onClick={() => deleteArea(groupName)} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, cursor: 'pointer', color: '#c0392b' }}>🗑 Eliminar área</button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        {realItems.map(item => (
                          <div key={item.id}
                            draggable={editingCheckItemId !== item.id}
                            onDragStart={() => setDragCheckItem({ id: item.id, groupKey })}
                            onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (dragCheckItem) setDragOverArea(groupKey); }}
                            onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragCheckItem) reorderCheckItems(groupKey, dragCheckItem.id, item.id); setDragCheckItem(null); setDragOverArea(null); }}
                            onDragEnd={() => { setDragCheckItem(null); setDragOverArea(null); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid #eee', opacity: dragCheckItem?.id === item.id ? 0.4 : 1 }}>
                            <span style={{ cursor: 'grab', color: '#ccc', fontSize: 14, flexShrink: 0 }}>⠿</span>
                            <div onClick={() => toggleCheckItem(item)} style={{ width: 24, height: 24, borderRadius: '50%', border: item.completed ? 'none' : '2px solid #dde1e7', background: item.completed ? '#1a7a4a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
                              {item.completed && <span style={{ color: '#fff', fontSize: 14, fontWeight: 900 }}>✓</span>}
                            </div>
                            <div style={{ flex: 1 }} onClick={() => editingCheckItemId !== item.id && toggleCheckItem(item)}>
                              {editingCheckItemId === item.id ? (
                                <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                                  <input autoFocus value={editingCheckItemText} onChange={e => setEditingCheckItemText(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveEditCheckItem(item.id); if (e.key === 'Escape') setEditingCheckItemId(null); }}
                                    style={{ flex: 1, padding: '6px 10px', border: '1.5px solid #dde1e7', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                                  <button onClick={() => saveEditCheckItem(item.id)} style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Guardar</button>
                                  <button onClick={() => setEditingCheckItemId(null)} style={{ background: 'none', border: '1.5px solid #dde1e7', borderRadius: 6, padding: '5px 10px', fontWeight: 700, fontSize: 12, cursor: 'pointer', color: '#888' }}>×</button>
                                </div>
                              ) : (
                                <>
                                  <div style={{ fontSize: 14, fontWeight: 600, textDecoration: item.completed ? 'line-through' : 'none', color: item.completed ? '#aaa' : '#333' }}>{item.description}</div>
                                  {item.completed && item.completed_at && (
                                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                                      {formatDatePR(item.completed_at)}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                            {editingCheckItemId !== item.id && (
                              <div style={{ position: 'relative' }}>
                                <button onClick={() => setCheckItemMenuOpen(checkItemMenuOpen === item.id ? null : item.id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}>⋮</button>
                                {checkItemMenuOpen === item.id && (
                                  <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setCheckItemMenuOpen(null)} />
                                    <div style={{ position: 'absolute', right: 0, top: 24, background: '#fff', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid #eee', zIndex: 99, minWidth: 150, overflow: 'hidden' }}>
                                      <button onClick={() => startEditCheckItem(item)} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, cursor: 'pointer' }}>✏️ Editar</button>
                                      <button onClick={() => duplicateCheckItem(item)} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, cursor: 'pointer' }}>📄 Duplicar</button>
                                      <button onClick={() => deleteCheckItem(item.id)} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, cursor: 'pointer', color: '#c0392b' }}>🗑 Eliminar</button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        {groupName && (
                          addingItemArea === groupKey ? (
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                              <input autoFocus value={newAreaItemText[groupKey] ?? ''}
                                onChange={e => setNewAreaItemText(prev => ({ ...prev, [groupKey]: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && addItemToArea(groupName)}
                                placeholder="Descripción del ítem..."
                                style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #dde1e7', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
                              <button onClick={() => addItemToArea(groupName)} style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>+</button>
                              <button onClick={() => setAddingItemArea(null)} style={{ background: 'none', border: '1.5px solid #dde1e7', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', color: '#888' }}>×</button>
                            </div>
                          ) : (
                            <button onClick={() => setAddingItemArea(groupKey)}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 13, fontWeight: 600, padding: '4px 0' }}>
                              + Nuevo ítem
                            </button>
                          )
                        )}
                      </div>
                      );
                    });
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
                          {n.author_name && <>{n.author_name} · </>}
                          {formatDateTimePR(n.created_at, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
                      ) : n.note && <p style={{ fontSize: 14, margin: 0, whiteSpace: 'pre-wrap' }}>{n.note}</p>}
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

            {/* REPORTS TAB */}
            {detailTab === 'reports' && (
              <div>
                <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Reportes para el cliente</div>
                    <button onClick={openNewReport} style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>+ Nuevo</button>
                  </div>
                  <p style={{ color: '#888', fontSize: 12.5, margin: 0 }}>Agrupa notas y fotos por fase para compartir el avance del trabajo — envía por email al cliente.</p>
                </div>

                {detailReports.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa' }}>No hay reportes aún.</div>
                ) : detailReports.map(r => (
                  <div key={r.id} style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
                      {(r.note_ids ?? []).length} nota{(r.note_ids ?? []).length === 1 ? '' : 's'} ·{' '}
                      {r.sent_at ? `Enviado a ${r.sent_to} el ${formatDatePR(r.sent_at)}` : 'No enviado'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      <a href={`/reporte/${r.id}`} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 12px', background: '#f0f0f0', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#333', textDecoration: 'none' }}>👁 Ver</a>
                      <button onClick={() => openReportEmail(r)} style={{ padding: '6px 12px', background: '#f0f0f0', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>📧 Enviar</button>
                      {r.created_by === profileId && (
                        <>
                          <button onClick={() => openEditReport(r)} style={{ padding: '6px 12px', background: '#f0f0f0', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✏️ Editar</button>
                          <button onClick={() => deleteReport(r.id)} style={{ padding: '6px 12px', background: '#fef2f2', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#b91c1c', cursor: 'pointer' }}>🗑 Eliminar</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightweight read-only detail for a non-job schedule entry (event/task/visit) — no
          clock-in/photos/expenses, since those actions are job-specific. */}
      {detailEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 1000 }} onClick={() => setDetailEntry(null)}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px calc(24px + env(safe-area-inset-bottom,0px))', width: '100%', maxWidth: 430, maxHeight: '85vh', overflowY: 'auto', margin: '0 auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 18, flex: 1 }}>{detailEntry.title}</div>
              <button onClick={() => setDetailEntry(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#888', cursor: 'pointer' }}>×</button>
            </div>
            {detailEntry.clients?.name && <div style={{ fontSize: 14, color: '#555', marginBottom: 6 }}>{detailEntry.clients.name}</div>}
            {detailEntry.scheduled_start && (
              <div style={{ fontSize: 14, color: '#555', marginBottom: 6 }}>
                🕐 {formatDateTimePR(detailEntry.scheduled_start, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }, 'en-US')}
              </div>
            )}
            {detailEntry._kind === 'event' && detailEntry._raw.address && (
              <a href={pickMapsLink(detailEntry._raw.address)} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: 13, color: ORANGE, marginBottom: 6, fontWeight: 600 }}>📍 {detailEntry._raw.address}</a>
            )}
            {detailEntry._raw.notes && <div style={{ fontSize: 13, color: '#888', marginTop: 8, whiteSpace: 'pre-wrap' }}>{detailEntry._raw.notes}</div>}
            {detailEntry._kind === 'task' && detailEntry._raw.task_type === 'checklist' && (detailEntry._raw.task_items ?? []).length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 13, color: '#555', fontWeight: 700, marginBottom: 8 }}>
                  ✅ Checklist ({detailEntry._raw.task_items.filter(i => i.done).length}/{detailEntry._raw.task_items.length})
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {[...detailEntry._raw.task_items].sort((a, b) => a.sort_order - b.sort_order).map(item => (
                    <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: item.done ? '#aaa' : '#333', textDecoration: item.done ? 'line-through' : 'none' }}>
                      <input type="checkbox" checked={item.done} onChange={() => toggleDetailTaskItem(item)} style={{ width: 18, height: 18, flexShrink: 0 }} />
                      {item.text}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {(detailEntry._kind === 'event' || detailEntry._kind === 'task') && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 13, color: '#555', fontWeight: 700, marginBottom: 8 }}>📝 Notas</div>
                <div style={{ display: 'grid', gap: 8, marginBottom: 10, maxHeight: 220, overflowY: 'auto' }}>
                  {detailEntryNotes.map(n => (
                    <div key={n.id} style={{ background: '#f7f7f7', borderRadius: 8, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {n.note && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{n.note}</div>}
                        {(n.photo_signed_urls ?? []).filter(Boolean).length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: n.note ? 6 : 0 }}>
                            {n.photo_signed_urls.filter(Boolean).map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt="note photo" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
                              </a>
                            ))}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                          {n.author_name ?? 'Alguien'} · {formatDateTimePR(n.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }, 'en-US')}
                        </div>
                      </div>
                      <button onClick={() => deleteDetailEntryNote(n)} title="Delete note"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 14, flexShrink: 0 }}>🗑</button>
                    </div>
                  ))}
                </div>
                {newEntryNotePhotos.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {newEntryNotePhotos.map((p, i) => (
                      <div key={i} style={{ position: 'relative', width: 44, height: 44 }}>
                        <img src={p.previewUrl} alt="pending photo" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
                        <button type="button" onClick={() => setNewEntryNotePhotos(prev => prev.filter((_, idx) => idx !== i))}
                          style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', background: '#c0392b', color: '#fff', border: 'none', fontSize: 10, lineHeight: 1, cursor: 'pointer' }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newEntryNoteText} onChange={e => setNewEntryNoteText(e.target.value)} placeholder="Add a note..."
                    style={{ flex: 1, borderRadius: 8, border: '1px solid #ddd', padding: '10px 12px', fontSize: 14 }}
                    onKeyDown={e => { if (e.key === 'Enter') addDetailEntryNote(); }} />
                  <input ref={entryNotePhotoInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                    onChange={e => {
                      const files = Array.from(e.target.files || []);
                      setNewEntryNotePhotos(prev => [...prev, ...files.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))]);
                      e.target.value = '';
                    }} />
                  <button type="button" onClick={() => entryNotePhotoInputRef.current?.click()} title="Attach photo"
                    style={{ background: '#f0f0f0', border: '1px solid #ddd', borderRadius: 8, padding: '0 14px', fontSize: 16, cursor: 'pointer' }}>📷</button>
                  <button onClick={addDetailEntryNote} disabled={savingEntryNote || (!newEntryNoteText.trim() && newEntryNotePhotos.length === 0)}
                    style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 8, padding: '0 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    {savingEntryNote ? '...' : 'Add'}
                  </button>
                </div>
              </div>
            )}
            {detailEntry._kind === 'task' && detailEntry._raw.task_type === 'checklist' && (
              <button
                onClick={() => openMaintenanceReport(detailEntry._raw)}
                style={{ marginTop: 16, width: '100%', background: '#fff', color: ORANGE, border: `1.5px solid ${ORANGE}`, borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                📄 Generate report
              </button>
            )}
            {detailEntry._kind === 'task' && (
              <button
                onClick={async () => {
                  await supabase.from('tasks').update({ completed: !detailEntry._raw.completed }).eq('id', detailEntry._raw.id);
                  setDetailEntry(null);
                  loadTechScheduleExtras();
                }}
                style={{ marginTop: 8, width: '100%', background: detailEntry._raw.completed ? '#eee' : ORANGE, color: detailEntry._raw.completed ? '#333' : '#fff', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {detailEntry._raw.completed ? 'Mark as pending' : 'Mark as done'}
              </button>
            )}
          </div>
        </div>
      )}

      {maintReportModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 1100 }} onClick={() => setMaintReportModal(null)}>
          <MaintenanceReportForm
            task={maintReportModal.task}
            techName={techName}
            saving={savingMaintReport}
            onCancel={() => setMaintReportModal(null)}
            onSubmit={createMaintenanceReport}
          />
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

      {/* Dropdown menu — replaces the standalone + FAB in the same bottom-right spot, houses
          Nuevo, Clientes, Actualizar and Salir so nothing floats loose near the tab bar. */}
      <button aria-label="Menú" style={{ position: 'fixed', bottom: 96, right: 20, width: 52, height: 52, background: showMenu ? '#333' : ORANGE, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(224,92,42,0.4)', zIndex: 99, fontSize: 22, color: '#fff' }}
        onClick={() => setShowMenu(v => !v)}>
        {showMenu ? '✕' : '☰'}
      </button>

      {showMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowMenu(false)} />
          <div style={{ position: 'fixed', bottom: 156, right: 20, zIndex: 99, background: '#fff', borderRadius: 14, boxShadow: '0 6px 20px rgba(0,0,0,0.18)', overflow: 'hidden', minWidth: 190 }}>
            <button style={menuItem} onClick={() => { setShowMenu(false); if (tab === 'clientes') { setShowNewClient(true); } else { setShowFab(true); } }}>➕ Nuevo</button>
            <button style={menuItem} onClick={() => { setShowMenu(false); setTab('clientes'); }}>👥 Clientes</button>
            <button style={menuItem} onClick={() => { setShowMenu(false); setTab('inventario'); }}>📦 Inventario</button>
            <button style={menuItem} onClick={() => { setShowMenu(false); setRefreshing(true); window.location.reload(); }}>🔄 Actualizar</button>
            <button style={menuItem} onClick={() => { setShowMenu(false); window.location.href = '/'; }}>🏢 Panel de oficina</button>
            <button style={{ ...menuItem, borderBottom: 'none', color: '#b52a2a' }} onClick={() => { setShowMenu(false); handleLogout(); }}>🚪 Salir</button>
          </div>
        </>
      )}

      {showFab && tab !== 'clientes' && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 97 }} onClick={() => setShowFab(false)} />
          <div style={{ position: 'fixed', bottom: 140, right: 20, zIndex: 98, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
            <button style={fmi('#2a4cb5')} onClick={() => { setFabSelectedJob(activeJob); setShowJobNote(true); setShowFab(false); }}><FieldIcon name="note" />Agregar nota</button>
            <button style={fmi('#1a7a4a')} onClick={() => { setFabSelectedJob(activeJob); setShowJobPhoto(true); setShowFab(false); }}><FieldIcon name="camera" />Agregar foto</button>
            <button style={fmi('#7a4cb5')} onClick={() => { setExpenseJob(activeJob ?? undefined); setShowJobExpense(true); setShowFab(false); }}><FieldIcon name="cash" />Agregar gasto</button>
            <button style={fmi(ORANGE)} onClick={() => { setShowJobClock(true); setShowFab(false); }}><FieldIcon name="time" />Clock In a trabajo</button>
          </div>
        </>
      )}

      {showNewClient && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }} onClick={closeNewClientModal}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: 430, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>👤 Nuevo cliente</div>
              <button onClick={closeNewClientModal} aria-label="Cerrar" style={{ background: '#f0f0f0', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#555', cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={saveNewClient}>
              {newClientError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 12 }}>⚠️ {newClientError}</div>
              )}
              <div style={{ marginBottom: 8 }}>
                <input value={newClientForm.name} onChange={e => setNewClientForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre *"
                  style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input value={newClientForm.phone} onChange={e => setNewClientForm(f => ({ ...f, phone: e.target.value }))} placeholder="Teléfono"
                  style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
                <input type="email" value={newClientForm.email} onChange={e => setNewClientForm(f => ({ ...f, email: e.target.value }))} placeholder="Email"
                  style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <input value={newClientForm.company} onChange={e => setNewClientForm(f => ({ ...f, company: e.target.value }))} placeholder="Empresa (opcional)"
                  style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
              </div>
              <select value={newClientForm.client_type} onChange={e => setNewClientForm(f => ({ ...f, client_type: e.target.value }))}
                style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', marginBottom: 8 }}>
                <option value="final">Consumidor final</option>
                <option value="b2b">Comerciante registrado B2B</option>
              </select>
              <input value={newClientAddr.line1} onChange={e => setNewClientAddr(a => ({ ...a, line1: e.target.value }))} placeholder="Dirección (opcional)"
                style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', marginBottom: 8 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                <input value={newClientAddr.city} onChange={e => setNewClientAddr(a => ({ ...a, city: e.target.value }))} placeholder="Ciudad"
                  style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
                <input value={newClientAddr.zip} onChange={e => setNewClientAddr(a => ({ ...a, zip: e.target.value }))} placeholder="Código postal"
                  style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" disabled={savingNewClient} style={{ flex: 1, padding: 12, background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>{savingNewClient ? 'Guardando...' : 'Guardar cliente'}</button>
                <button type="button" onClick={closeNewClientModal} style={{ padding: 12, background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, color: ORANGE }}>{fabSelectedJob.title}</div>
                  <button type="button" onClick={() => setFabSelectedJob(null)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>Cambiar</button>
                </div>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, color: ORANGE }}>{fabSelectedJob.title}</div>
                    <button type="button" onClick={() => setFabSelectedJob(null)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>Cambiar</button>
                  </div>
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

      {showInvAdjust && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }} onClick={() => setShowInvAdjust(false)}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: 430, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>📦 Ajustar stock — {invLocById[invLocationId]?.name}</div>
              <button onClick={() => setShowInvAdjust(false)} aria-label="Cerrar" style={{ background: '#f0f0f0', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#555', cursor: 'pointer' }}>✕</button>
            </div>
            <select value={invAdjustForm.catalog_item_id} onChange={e => setInvAdjustForm(f => ({ ...f, catalog_item_id: e.target.value }))}
              style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }}>
              <option value="">Selecciona un producto...</option>
              {invProducts.map(p => <option key={p.id} value={p.id}>{p.item_code} — {p.description}</option>)}
            </select>
            <input type="number" value={invAdjustForm.delta} onChange={e => setInvAdjustForm(f => ({ ...f, delta: e.target.value }))} placeholder="Cantidad (negativo para restar)"
              style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }} />
            <input value={invAdjustForm.reason} onChange={e => setInvAdjustForm(f => ({ ...f, reason: e.target.value }))} placeholder="Motivo (opcional) — Ej: usado en trabajo"
              style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowInvAdjust(false)} style={{ flex: 1, padding: 12, background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={invAdjustStock} disabled={invSaving || !invAdjustForm.catalog_item_id || !invAdjustForm.delta} style={{ flex: 1, padding: 12, background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
                {invSaving ? 'Guardando...' : 'Ajustar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInvAddUnit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }} onClick={closeInvAddUnitModal}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: 430, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>📦 Agregar equipo — {invLocById[invLocationId]?.name}</div>
              <button onClick={closeInvAddUnitModal} aria-label="Cerrar" style={{ background: '#f0f0f0', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#555', cursor: 'pointer' }}>✕</button>
            </div>
            {!showInvNewProduct ? (
              <>
                <select value={invUnitForm.catalog_item_id} onChange={e => setInvUnitForm(f => ({ ...f, catalog_item_id: e.target.value }))}
                  style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }}>
                  <option value="">Selecciona un producto...</option>
                  {invProducts.map(p => <option key={p.id} value={p.id}>{p.item_code} — {p.description}</option>)}
                </select>
                <button type="button" onClick={() => setShowInvNewProduct(true)}
                  style={{ background: 'none', border: 'none', color: ORANGE, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
                  + ¿No está en la lista? Crear producto nuevo
                </button>
              </>
            ) : (
              <div style={{ background: '#f6f7fa', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Nuevo producto</div>
                <input value={invNewProductForm.item_code} onChange={e => setInvNewProductForm(f => ({ ...f, item_code: e.target.value }))} placeholder="Nombre / Código"
                  style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }} />
                <input value={invNewProductForm.description} onChange={e => setInvNewProductForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción"
                  style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }} />
                <input type="number" step="0.01" value={invNewProductForm.price} onChange={e => setInvNewProductForm(f => ({ ...f, price: e.target.value }))} placeholder="Precio (opcional)"
                  style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }} />
                {invNewProductError && <p style={{ color: '#b52a2a', fontSize: 12, marginBottom: 8 }}>{invNewProductError}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => { setShowInvNewProduct(false); setInvNewProductError(''); }} style={{ flex: 1, padding: 10, background: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                  <button type="button" onClick={createInvProduct} disabled={savingInvNewProduct || !invNewProductForm.item_code.trim() || !invNewProductForm.description.trim()}
                    style={{ flex: 1, padding: 10, background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
                    {savingInvNewProduct ? 'Creando...' : 'Crear producto'}
                  </button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input value={invUnitForm.serial_number} onChange={e => setInvUnitForm(f => ({ ...f, serial_number: e.target.value }))} placeholder="Serial number"
                style={{ flex: 1, padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
              <button type="button" onClick={() => setShowInvScanner(true)} title="Escanear código de barra"
                style={{ padding: '0 14px', background: '#f0f0f0', border: 'none', borderRadius: 10, fontSize: 16, cursor: 'pointer' }}>📷</button>
            </div>
            <input value={invUnitForm.notes} onChange={e => setInvUnitForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notas (opcional)"
              style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }} />

            {invUnitPhotoPreview ? (
              <img src={invUnitPhotoPreview} alt="preview" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
            ) : null}
            <input ref={fileRefInvUnit} type="file" accept="image/*" onChange={e => handleInvUnitPhotoSelect(e.target.files?.[0])} style={{ display: 'none' }} />
            <button type="button" onClick={() => fileRefInvUnit.current?.click()} style={{ width: '100%', padding: '10px 14px', background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
              📷 {invUnitPhotoFile ? 'Cambiar foto' : 'Agregar foto'}
            </button>
            {invSavingUnit && invUnitPhotoFile && (
              <div style={{ background: '#e5e7eb', borderRadius: 20, height: 8, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ background: ORANGE, height: '100%', width: `${invUnitUploadProgress}%`, transition: 'width 0.2s' }} />
              </div>
            )}
            {invUnitError && <p style={{ color: '#b52a2a', fontSize: 13, marginBottom: 8 }}>{invUnitError}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={closeInvAddUnitModal} style={{ flex: 1, padding: 12, background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={invAddUnit} disabled={invSavingUnit || !invUnitForm.catalog_item_id || !invUnitForm.serial_number.trim()} style={{ flex: 1, padding: 12, background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
                {invSavingUnit ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInvScanner && (
        <BarcodeScanner
          onScan={code => { setInvUnitForm(f => ({ ...f, serial_number: code })); setShowInvScanner(false); }}
          onClose={() => setShowInvScanner(false)}
        />
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, color: ORANGE }}>{expenseJob ? expenseJob.title : 'Gasto general'}</div>
                  <button type="button" onClick={() => setExpenseJob(undefined)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>Cambiar</button>
                </div>
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

      {showReportModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }} onClick={() => setShowReportModal(false)}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: 430, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{editingReportId ? '✏️ Editar reporte' : '📄 Nuevo reporte'}</div>
              <button onClick={() => setShowReportModal(false)} aria-label="Cerrar" style={{ background: '#f0f0f0', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#555', cursor: 'pointer' }}>✕</button>
            </div>

            <input value={reportTitle} onChange={e => setReportTitle(e.target.value)} placeholder="Título — Ej: Avance de instalación, semana 1" autoFocus
              style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8, marginBottom: 8 }}>
              <input type="date" value={reportVisitDate} onChange={e => setReportVisitDate(e.target.value)}
                style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
              <input value={reportPersonnel} onChange={e => setReportPersonnel(e.target.value)} placeholder="Personal presente"
                style={{ padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
            </div>

            <textarea value={reportSummary} onChange={e => setReportSummary(e.target.value)} rows={3} placeholder="Resumen de actividades..."
              style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 12 }} />

            <p style={{ fontWeight: 700, fontSize: 12, color: '#555', marginBottom: 8 }}>SELECCIONA LAS NOTAS/FOTOS A INCLUIR</p>
            {detailNotes.length === 0 ? (
              <p style={{ color: '#aaa', fontSize: 13 }}>Este trabajo no tiene notas todavía.</p>
            ) : (() => {
              const groups = {};
              [...detailNotes]
                .sort((a, b) => (a.phase_number ?? Infinity) - (b.phase_number ?? Infinity) || new Date(b.created_at) - new Date(a.created_at))
                .forEach(n => {
                  const key = n.phase_number != null ? `Fase ${n.phase_number}` : 'Sin fase';
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(n);
                });
              return Object.entries(groups).map(([label, notesInGroup]) => (
                <div key={label} style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', marginBottom: 6 }}>{label}</p>
                  {notesInGroup.map(n => {
                    const thumbUrls = n.photo_urls && n.photo_urls.length > 0 ? n.photo_urls : (n.photo_url ? [n.photo_url] : []);
                    const isVideo = url => /\.(mp4|mov|webm|avi)(\?|$)/i.test(url);
                    const isPdf = url => /\.pdf(\?|$)/i.test(url);
                    return (
                      <label key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                        <input type="checkbox" checked={reportNoteIds.includes(n.id)} onChange={() => toggleReportNoteSelection(n.id)} style={{ marginTop: 3 }} />
                        {thumbUrls.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            {thumbUrls.slice(0, 3).map((url, idx) => (
                              isPdf(url) ? (
                                <div key={idx} style={{ width: 40, height: 40, borderRadius: 6, background: '#f0f0f0', border: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📄</div>
                              ) : isVideo(url) ? (
                                <video key={idx} src={url} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, background: '#000' }} />
                              ) : (
                                <img key={idx} src={url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} />
                              )
                            ))}
                          </div>
                        )}
                        <span style={{ fontSize: 13 }}>
                          {n.title && <strong>{n.title}</strong>}
                          {n.title && n.note ? ' — ' : ''}
                          {n.note && <span style={{ color: '#888' }}>{n.note.slice(0, 60)}{n.note.length > 60 ? '…' : ''}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ));
            })()}

            <textarea value={reportObservations} onChange={e => setReportObservations(e.target.value)} rows={3} placeholder="Observaciones — una por línea"
              style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginTop: 14, marginBottom: 8 }} />
            <textarea value={reportRecommendations} onChange={e => setReportRecommendations(e.target.value)} rows={3} placeholder="Recomendaciones — una por línea"
              style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 8 }} />
            <input value={reportPreparedBy} onChange={e => setReportPreparedBy(e.target.value)} placeholder="Preparado por (opcional)"
              style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 14 }} />

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveReport} disabled={savingReport || !reportTitle.trim()} style={{ flex: 1, padding: 12, background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
                {savingReport ? 'Guardando...' : '💾 Guardar reporte'}
              </button>
              <button onClick={() => setShowReportModal(false)} style={{ padding: 12, background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {emailingReportId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }} onClick={() => setEmailingReportId(null)}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: 430, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>📧 Enviar reporte por email</div>
              <button onClick={() => setEmailingReportId(null)} aria-label="Cerrar" style={{ background: '#f0f0f0', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#555', cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={sendReportEmail}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6 }}>EMAIL DEL CLIENTE</p>
              <input type="email" required value={reportEmailTo} onChange={e => setReportEmailTo(e.target.value)} autoFocus
                style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 14 }} />

              {detailClientContacts.filter(c => c.email).length > 0 && (
                <>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6 }}>COPIAR A (CC)</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, border: '1.5px solid #dde1e7', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                    {detailClientContacts.filter(c => c.email).map(c => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" checked={reportEmailCc.includes(c.email)} onChange={() => toggleReportCcContact(c.email)} />
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        <span style={{ color: '#888' }}>{c.email}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}

              <p style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6 }}>OTROS CORREOS EN COPIA (OPCIONAL)</p>
              <input value={reportEmailCcExtra} onChange={e => setReportEmailCcExtra(e.target.value)} placeholder="correo1@ejemplo.com, correo2@ejemplo.com"
                style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 16 }} />

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={sendingReport} style={{ flex: 1, padding: 12, background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
                  {sendingReport ? 'Enviando...' : '📤 Enviar'}
                </button>
                <button type="button" onClick={() => setEmailingReportId(null)} style={{ padding: 12, background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: '#fff', borderTop: '1px solid #dde1e7', display: 'flex', zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom,4px)' }}>
        <NavI tab="home" icon="home" label="Home" />
        <NavI tab="jobs" icon="jobs" label="Jobs" />
        <NavI tab="time" icon="time" label="Time" />
        <NavI tab="calendar" icon="calendar" label="Calendar" />
        <NavI tab="projects" icon="projects" label="Projects" />
      </nav>
    </div>
  );
}

function MaintenanceReportForm({ task, techName, saving, onCancel, onSubmit }) {
  const technicianNames = [task.technicians?.name, ...(task.task_technicians ?? []).map(tt => tt.technicians?.name)].filter(Boolean).join(', ');
  const [title, setTitle] = useState(task.title);
  const [visitDate, setVisitDate] = useState((task.due_at || '').slice(0, 10));
  const [personnel, setPersonnel] = useState(technicianNames);
  const [preparedBy, setPreparedBy] = useState(techName ?? '');

  return (
    <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px calc(24px + env(safe-area-inset-bottom,0px))', width: '100%', maxWidth: 430, margin: '0 auto' }} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>📄 Generate report</div>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 20, color: '#888', cursor: 'pointer' }}>×</button>
      </div>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>The checklist and notes/photos from this visit are included automatically.</p>
      <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>Visit date</label>
          <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>Personnel present</label>
          <input value={personnel} onChange={e => setPersonnel(e.target.value)} style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>Prepared by</label>
          <input value={preparedBy} onChange={e => setPreparedBy(e.target.value)} style={{ width: '100%', padding: 10, border: '1.5px solid #dde1e7', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
        </div>
      </div>
      <button
        disabled={!title.trim() || saving}
        onClick={() => onSubmit({ task, title, visitDate, personnel, preparedBy })}
        style={{ width: '100%', background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        {saving ? 'Generating...' : 'Generate report'}
      </button>
    </div>
  );
}
