'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { isoToLocalInput, localInputToIso } from '../../lib/datetimeLocal';
import { pickMapsLink } from '../../lib/mapsLinks';
import ClientCombobox from '../facturas/nueva/ClientCombobox';
import QuickRescheduleModal from './QuickRescheduleModal';

const TECH_COLORS = [
  '#16223d', '#e0972c', '#27ae60', '#2a4cb5', '#e05c2a',
  '#8e44ad', '#16a085', '#c0392b', '#d35400', '#1abc9c',
];

const STATUS_COLORS = {
  estimate: 'var(--ink-soft)', scheduled: 'var(--info)', in_progress: 'var(--amber)',
  completed: 'var(--ok)', cancelled: 'var(--ink-faint)',
};

const STATUS_LABELS = {
  estimate: 'Estimado', scheduled: 'Programado', in_progress: 'En progreso',
  completed: 'Completado', cancelled: 'Cancelado',
};

const VISIT_STATUS_LABELS = {
  agendada: 'Agendada', en_progreso: 'En progreso', completada: 'Completada', cancelada: 'Cancelada',
};

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

const ENTRY_TYPE_ICONS = { event: '📌', reminder: '🔔', checklist: '☑' };

export default function CalendarioClient({ jobs, technicians, visits, calendarEvents, tasks, absences, clients, clientProperties, pendingRequests, currentRole, currentUserName, initialView, initialYear, initialMonth, initialWeek }) {
  const router = useRouter();
  const canQuickReschedule = currentRole === 'admin';
  const canScheduleVisit = currentRole === 'admin' || currentRole === 'secretaria';
  const [view, setView] = useState(initialView);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [weekOffset, setWeekOffset] = useState(initialWeek);
  const [selectedTech, setSelectedTech] = useState('all');
  const [selectedJob, setSelectedJob] = useState(null);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showRequests, setShowRequests] = useState(true);
  const [scheduleModal, setScheduleModal] = useState(null); // { requestId?, date?, hour? }
  const [eventModal, setEventModal] = useState(null); // { dateStr?, time? }
  const [taskModal, setTaskModal] = useState(null); // { dateStr?, time? }
  const [absenceModal, setAbsenceModal] = useState(false);
  const [selectedAbsence, setSelectedAbsence] = useState(null);
  const [syncModal, setSyncModal] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { items: [{url, isVideo}], index }
  const [addToJobModal, setAddToJobModal] = useState(false);
  const [addedToJob, setAddedToJob] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reschedulingJob, setReschedulingJob] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({ start: '', end: '' });
  const [savingReschedule, setSavingReschedule] = useState(false);
  const [quickReschedule, setQuickReschedule] = useState(null); // { type: 'job'|'event'|'task', item }
  const [savingQuick, setSavingQuick] = useState(false);
  const [dayDetail, setDayDetail] = useState(null); // dateStr

  const [eventNotes, setEventNotes] = useState([]);
  const [taskNotes, setTaskNotes] = useState([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    setNewNoteText('');
    if (!selectedEvent) { setEventNotes([]); return; }
    supabase.from('calendar_event_notes').select('*').eq('event_id', selectedEvent.id)
      .order('created_at', { ascending: false }).then(({ data }) => setEventNotes(data ?? []));
  }, [selectedEvent?.id]);

  useEffect(() => {
    setNewNoteText('');
    if (!selectedTask) { setTaskNotes([]); return; }
    supabase.from('task_notes').select('*').eq('task_id', selectedTask.id)
      .order('created_at', { ascending: false }).then(({ data }) => setTaskNotes(data ?? []));
  }, [selectedTask?.id]);

  async function addEntryNote(kind, id) {
    if (!newNoteText.trim()) return;
    setSavingNote(true);
    const table = kind === 'event' ? 'calendar_event_notes' : 'task_notes';
    const fkColumn = kind === 'event' ? 'event_id' : 'task_id';
    const { data, error } = await supabase.from(table).insert([{
      [fkColumn]: id, note: newNoteText.trim(), author_name: currentUserName || null,
    }]).select().single();
    setSavingNote(false);
    if (error) { alert(error.message); return; }
    setNewNoteText('');
    if (kind === 'event') setEventNotes(prev => [data, ...prev]);
    else setTaskNotes(prev => [data, ...prev]);
  }

  async function deleteEntryNote(kind, noteId) {
    const table = kind === 'event' ? 'calendar_event_notes' : 'task_notes';
    const { error } = await supabase.from(table).delete().eq('id', noteId);
    if (error) { alert(error.message); return; }
    if (kind === 'event') setEventNotes(prev => prev.filter(n => n.id !== noteId));
    else setTaskNotes(prev => prev.filter(n => n.id !== noteId));
  }

  function renderEntryNotes(kind, notes) {
    const id = kind === 'event' ? selectedEvent?.id : selectedTask?.id;
    return (
      <div style={{ marginTop: 4, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>📝 Notas</div>
        {notes.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Sin notas todavía.</div>}
        <div style={{ display: 'grid', gap: 8, marginBottom: 10, maxHeight: 180, overflowY: 'auto' }}>
          {notes.map(n => (
            <div key={n.id} style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{n.note}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  {n.author_name ?? 'Alguien'} · {new Date(n.created_at).toLocaleString('es-PR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <button onClick={() => deleteEntryNote(kind, n.id)} title="Eliminar nota"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, flexShrink: 0 }}>🗑</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newNoteText} onChange={e => setNewNoteText(e.target.value)} placeholder="Agregar nota..."
            style={{ flex: 1, borderRadius: 8, border: '1px solid var(--border)', padding: '8px 10px', fontSize: 13 }}
            onKeyDown={e => { if (e.key === 'Enter') addEntryNote(kind, id); }} />
          <button className="btn btn-ghost" disabled={savingNote || !newNoteText.trim()} onClick={() => addEntryNote(kind, id)}>
            {savingNote ? '...' : 'Agregar'}
          </button>
        </div>
      </div>
    );
  }

  function openJobReschedule(job) {
    setRescheduleForm({ start: isoToLocalInput(job.scheduled_start), end: isoToLocalInput(job.scheduled_end) });
    setReschedulingJob(true);
  }

  async function saveJobReschedule() {
    setSavingReschedule(true);
    // Extra work days live in job_schedule_days; the job's primary date range lives on jobs itself.
    const table = selectedJob.schedule_day_id ? 'job_schedule_days' : 'jobs';
    const targetId = selectedJob.schedule_day_id ?? selectedJob.id;
    const { error } = await supabase.from(table).update({
      scheduled_start: localInputToIso(rescheduleForm.start),
      scheduled_end: localInputToIso(rescheduleForm.end),
    }).eq('id', targetId);
    setSavingReschedule(false);
    if (error) { alert('Error al reagendar: ' + error.message); return; }
    setReschedulingJob(false);
    setSelectedJob(null);
    router.refresh();
  }

  async function saveQuickReschedule(form) {
    const { type, item } = quickReschedule;
    setSavingQuick(true);
    let error;
    if (type === 'task') {
      ({ error } = await supabase.from('tasks').update({ due_at: localInputToIso(form.due) }).eq('id', item.id));
    } else if (type === 'event') {
      ({ error } = await supabase.from('calendar_events').update({
        start_at: localInputToIso(form.start), end_at: localInputToIso(form.end),
      }).eq('id', item.id));
    } else {
      // Extra work days live in job_schedule_days; the job's primary date range lives on jobs itself.
      const table = item.schedule_day_id ? 'job_schedule_days' : 'jobs';
      const targetId = item.schedule_day_id ?? item.id;
      ({ error } = await supabase.from(table).update({
        scheduled_start: localInputToIso(form.start), scheduled_end: localInputToIso(form.end),
      }).eq('id', targetId));
    }
    setSavingQuick(false);
    if (error) { alert('Error al mover la fecha: ' + error.message); return; }
    setQuickReschedule(null);
    router.refresh();
  }

  function viewQuickDetails() {
    const { type, item } = quickReschedule;
    setQuickReschedule(null);
    if (type === 'job') setSelectedJob(item);
    else if (type === 'event') setSelectedEvent(item);
    else if (type === 'task') setSelectedTask(item);
  }

  // Admins can move a job/event/task's date straight from the calendar entry; everyone
  // else keeps the old behavior of clicking through to the full detail modal.
  function openEntry(type, item) {
    if (canQuickReschedule) { setQuickReschedule({ type, item }); return; }
    if (type === 'job') setSelectedJob(item);
    else if (type === 'event') setSelectedEvent(item);
    else if (type === 'task') setSelectedTask(item);
  }

  const [draggingEntry, setDraggingEntry] = useState(null); // { type, item }
  const [dragOverDate, setDragOverDate] = useState(null);

  function daysBetween(dateStrA, dateStrB) {
    const a = new Date(`${dateStrA}T00:00:00`);
    const b = new Date(`${dateStrB}T00:00:00`);
    return Math.round((b - a) / 86400000);
  }

  function shiftIsoByDays(iso, deltaDays) {
    const d = new Date(iso);
    d.setDate(d.getDate() + deltaDays);
    return d.toISOString();
  }

  async function handleDayDrop(newDateStr) {
    const entry = draggingEntry;
    setDraggingEntry(null);
    setDragOverDate(null);
    if (!entry) return;
    const { type, item } = entry;
    const anchorDateStr = (type === 'task' ? item.due_at : type === 'event' ? item.start_at : item.scheduled_start).slice(0, 10);
    const deltaDays = daysBetween(anchorDateStr, newDateStr);
    if (deltaDays === 0) return;

    let error;
    if (type === 'task') {
      ({ error } = await supabase.from('tasks').update({ due_at: shiftIsoByDays(item.due_at, deltaDays) }).eq('id', item.id));
    } else if (type === 'event') {
      ({ error } = await supabase.from('calendar_events').update({
        start_at: shiftIsoByDays(item.start_at, deltaDays),
        end_at: shiftIsoByDays(item.end_at, deltaDays),
      }).eq('id', item.id));
    } else {
      const table = item.schedule_day_id ? 'job_schedule_days' : 'jobs';
      const targetId = item.schedule_day_id ?? item.id;
      ({ error } = await supabase.from(table).update({
        scheduled_start: shiftIsoByDays(item.scheduled_start, deltaDays),
        scheduled_end: item.scheduled_end ? shiftIsoByDays(item.scheduled_end, deltaDays) : null,
      }).eq('id', targetId));
    }
    if (error) { alert('Error al mover la fecha: ' + error.message); return; }
    router.refresh();
  }

  const techColors = useMemo(() => {
    const map = {};
    technicians.forEach((t, i) => { map[t.id] = TECH_COLORS[i % TECH_COLORS.length]; });
    return map;
  }, [technicians]);

  const jobMatchesTech = (job, techId) =>
    job.technician_id === techId || (job.job_technicians ?? []).some(jt => jt.technician_id === techId);

  const filteredJobs = useMemo(() =>
    selectedTech === 'all' ? jobs : jobs.filter(j => jobMatchesTech(j, selectedTech)),
    [jobs, selectedTech]
  );

  const filteredVisits = useMemo(() =>
    selectedTech === 'all' ? visits : visits.filter(v => v.technician_id === selectedTech),
    [visits, selectedTech]
  );

  const eventMatchesTech = (event, techId) =>
    event.technician_id === techId || (event.calendar_event_technicians ?? []).some(et => et.technician_id === techId);

  const filteredEvents = useMemo(() =>
    selectedTech === 'all' ? calendarEvents : calendarEvents.filter(e => eventMatchesTech(e, selectedTech)),
    [calendarEvents, selectedTech]
  );

  const filteredTasks = useMemo(() =>
    selectedTech === 'all' ? tasks : tasks.filter(t => t.technician_id === selectedTech),
    [tasks, selectedTech]
  );

  const filteredAbsences = useMemo(() =>
    selectedTech === 'all' ? absences : absences.filter(a => a.technician_id === selectedTech),
    [absences, selectedTech]
  );

  const getJobsForDate = (dateStr) =>
    filteredJobs.filter(j => {
      const start = j.scheduled_start?.slice(0, 10);
      const end = j.scheduled_end?.slice(0, 10);
      return start && end && start <= dateStr && dateStr <= end;
    });

  const getVisitsForDate = (dateStr) =>
    filteredVisits.filter(v => v.scheduled_at?.slice(0, 10) === dateStr);

  const getEventsForDate = (dateStr) =>
    filteredEvents.filter(e => {
      const start = e.start_at?.slice(0, 10);
      const end = e.end_at?.slice(0, 10) ?? start;
      return start && start <= dateStr && dateStr <= end;
    });

  const getTasksForDate = (dateStr) =>
    filteredTasks.filter(t => t.due_at?.slice(0, 10) === dateStr);

  const getAbsencesForDate = (dateStr) =>
    filteredAbsences.filter(a => a.date === dateStr);

  const getWeekStart = (offset = 0) => {
    const now = new Date();
    const day = now.getDay();
    const diffToMon = (day + 6) % 7;
    const ws = new Date(now);
    ws.setDate(now.getDate() - diffToMon + offset * 7);
    ws.setHours(0, 0, 0, 0);
    return ws;
  };

  const weekStart = getWeekStart(weekOffset);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const today = new Date().toISOString().slice(0, 10);
  const fmtDate = d => d.toISOString().slice(0, 10);
  const fmtTime = iso => new Date(iso).toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' });

  const navLabel = view === 'year' ? String(year) :
    view === 'month' ? `${MONTHS[month]} ${year}` :
    `${weekDays[0].toLocaleDateString('es-PR', { month: 'short', day: 'numeric' })} — ${weekDays[6].toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  function navPrev() {
    if (view === 'year') setYear(y => y - 1);
    else if (view === 'month') { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
    else setWeekOffset(w => w - 1);
  }
  function navNext() {
    if (view === 'year') setYear(y => y + 1);
    else if (view === 'month') { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }
    else setWeekOffset(w => w + 1);
  }
  function navToday() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setWeekOffset(0);
  }

  async function handleSchedule({ requestId, technicianId, dateStr, time, duration }) {
    setSaving(true);
    try {
      const scheduled_at = new Date(`${dateStr}T${time}:00`).toISOString();
      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          technician_id: technicianId,
          scheduled_at,
          duration_minutes: duration,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? 'Error al agendar visita');
        return;
      }
      setScheduleModal(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateEvent({ title, dateStr, startTime, endTime, technicianIds, clientId, notes, address }) {
    setSaving(true);
    try {
      const { data: event, error } = await supabase.from('calendar_events').insert({
        title,
        notes: notes || null,
        address: address || null,
        start_at: new Date(`${dateStr}T${startTime}:00`).toISOString(),
        end_at: new Date(`${dateStr}T${endTime}:00`).toISOString(),
        technician_id: technicianIds[0] ?? null,
        client_id: clientId || null,
      }).select().single();
      if (error) { alert(error.message); return; }
      if (technicianIds.length > 1) {
        const { error: techError } = await supabase.from('calendar_event_technicians').insert(
          technicianIds.slice(1).map(techId => ({ event_id: event.id, technician_id: techId }))
        );
        if (techError) { alert(techError.message); return; }
      }
      setEventModal(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateTask({ taskType, title, dateStr, time, technicianId, clientId, notes, address, checklistItems }) {
    setSaving(true);
    try {
      const { data: task, error } = await supabase.from('tasks').insert({
        task_type: taskType,
        title,
        notes: notes || null,
        address: address || null,
        due_at: new Date(`${dateStr}T${time}:00`).toISOString(),
        technician_id: technicianId || null,
        client_id: clientId || null,
      }).select().single();
      if (error) { alert(error.message); return; }
      if (taskType === 'checklist' && checklistItems.length) {
        await supabase.from('task_items').insert(
          checklistItems.map((text, i) => ({ task_id: task.id, text, sort_order: i }))
        );
      }
      setTaskModal(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateEvent({ id, title, dateStr, startTime, endTime, technicianIds, clientId, notes, address }) {
    setSaving(true);
    try {
      const { error } = await supabase.from('calendar_events').update({
        title,
        notes: notes || null,
        address: address || null,
        start_at: new Date(`${dateStr}T${startTime}:00`).toISOString(),
        end_at: new Date(`${dateStr}T${endTime}:00`).toISOString(),
        technician_id: technicianIds[0] ?? null,
        client_id: clientId || null,
      }).eq('id', id);
      if (error) { alert(error.message); return; }
      const { error: delError } = await supabase.from('calendar_event_technicians').delete().eq('event_id', id);
      if (delError) { alert(delError.message); return; }
      if (technicianIds.length > 1) {
        const { error: techError } = await supabase.from('calendar_event_technicians').insert(
          technicianIds.slice(1).map(techId => ({ event_id: id, technician_id: techId }))
        );
        if (techError) { alert(techError.message); return; }
      }
      setEventModal(null);
      setSelectedEvent(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateTask({ id, taskType, title, dateStr, time, technicianId, clientId, notes, address }) {
    setSaving(true);
    try {
      const { error } = await supabase.from('tasks').update({
        task_type: taskType,
        title,
        notes: notes || null,
        address: address || null,
        due_at: new Date(`${dateStr}T${time}:00`).toISOString(),
        technician_id: technicianId || null,
        client_id: clientId || null,
      }).eq('id', id);
      if (error) { alert(error.message); return; }
      setTaskModal(null);
      setSelectedTask(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function toggleTaskCompleted(task) {
    await supabase.from('tasks').update({ completed: !task.completed }).eq('id', task.id);
    setSelectedTask(null);
    router.refresh();
  }

  async function toggleTaskItem(item) {
    await supabase.from('task_items').update({ done: !item.done }).eq('id', item.id);
    setSelectedTask(t => t && ({
      ...t,
      task_items: t.task_items.map(i => i.id === item.id ? { ...i, done: !i.done } : i),
    }));
    router.refresh();
  }

  async function uploadItemAttachments(item, files) {
    const uploaded = [];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `${selectedTask.id}/${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error } = await supabase.storage.from('Job-photos').upload(path, file);
      if (!error) uploaded.push({ path, previewUrl: URL.createObjectURL(file) });
    }
    if (!uploaded.length) return;
    const newAttachments = [...(item.attachments ?? []), ...uploaded.map(u => u.path)];
    await supabase.from('task_items').update({ attachments: newAttachments }).eq('id', item.id);
    setSelectedTask(t => t && ({
      ...t,
      task_items: t.task_items.map(i => i.id === item.id ? {
        ...i,
        attachments: newAttachments,
        attachment_urls: [...(i.attachment_urls ?? []), ...uploaded.map(u => u.previewUrl)],
      } : i),
    }));
    router.refresh();
  }

  async function removeItemAttachment(item, index) {
    const path = item.attachments[index];
    await supabase.storage.from('Job-photos').remove([path]);
    const newAttachments = item.attachments.filter((_, i) => i !== index);
    const newUrls = (item.attachment_urls ?? []).filter((_, i) => i !== index);
    await supabase.from('task_items').update({ attachments: newAttachments }).eq('id', item.id);
    setSelectedTask(t => t && ({
      ...t,
      task_items: t.task_items.map(i => i.id === item.id ? { ...i, attachments: newAttachments, attachment_urls: newUrls } : i),
    }));
    router.refresh();
  }

  async function deleteEvent(id) {
    // .select() lets us tell a real failure apart from RLS silently matching zero rows,
    // which supabase-js reports as success with no error otherwise.
    const { data, error } = await supabase.from('calendar_events').delete().eq('id', id).select();
    if (error) { alert('Error al eliminar el evento: ' + error.message); return; }
    if (!data?.length) { alert('No se pudo eliminar el evento (sin permiso o ya fue eliminado). Refrescando...'); router.refresh(); return; }
    setSelectedEvent(null);
    router.refresh();
  }

  async function deleteTask(id) {
    const { data, error } = await supabase.from('tasks').delete().eq('id', id).select();
    if (error) { alert('Error al eliminar la tarea: ' + error.message); return; }
    if (!data?.length) { alert('No se pudo eliminar la tarea (sin permiso o ya fue eliminada). Refrescando...'); router.refresh(); return; }
    setSelectedTask(null);
    router.refresh();
  }

  async function handleCreateAbsence({ technicianId, startDate, endDate, reason }) {
    setSaving(true);
    try {
      const dates = [];
      for (let d = new Date(`${startDate}T00:00:00`); d <= new Date(`${endDate}T00:00:00`); d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().slice(0, 10));
      }
      const { error } = await supabase.from('technician_absences').insert(
        dates.map(date => ({ technician_id: technicianId, date, reason: reason || null }))
      );
      if (error) { alert(error.message); return; }
      setAbsenceModal(false);
      window.dispatchEvent(new Event('otess:absences-changed'));
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function deleteAbsence(id) {
    const { data, error } = await supabase.from('technician_absences').delete().eq('id', id).select();
    if (error) { alert('Error al eliminar la ausencia: ' + error.message); return; }
    if (!data?.length) { alert('No se pudo eliminar la ausencia (sin permiso o ya fue eliminada). Refrescando...'); router.refresh(); return; }
    setSelectedAbsence(null);
    window.dispatchEvent(new Event('otess:absences-changed'));
    router.refresh();
  }

  async function addTaskToJob(task, jobId) {
    const lines = [`[Tarea] ${task.title}`];
    if (task.notes) lines.push(task.notes);
    if (task.task_type === 'checklist' && (task.task_items ?? []).length) {
      lines.push('', 'Checklist:');
      [...task.task_items].sort((a, b) => a.sort_order - b.sort_order).forEach(i => {
        lines.push(`${i.done ? '[x]' : '[ ]'} ${i.text}`);
      });
    }
    const photoPaths = (task.task_items ?? []).flatMap(i => i.attachments ?? []);
    const { error } = await supabase.from('job_notes').insert({
      job_id: jobId,
      note: lines.join('\n'),
      photo_url: photoPaths[0] ?? null,
      photo_urls: photoPaths.length ? photoPaths : null,
    });
    if (error) { alert(error.message); return; }
    setAddToJobModal(false);
    setAddedToJob(true);
    setTimeout(() => setAddedToJob(false), 2500);
  }

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div className="page-title">Calendario</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['year','Anual'],['month','Mensual'],['week','Semanal']].map(([v, l]) => (
              <button key={v} onClick={() => setView(v)} className={`btn ${v === view ? 'btn-primary' : 'btn-ghost'}`}>{l}</button>
            ))}
            <button onClick={() => setShowRequests(s => !s)} className="btn btn-ghost">
              {showRequests ? 'Ocultar' : 'Ver'} solicitudes {pendingRequests.length > 0 && `(${pendingRequests.length})`}
            </button>
            <button onClick={() => setEventModal({ dateStr: today, time: '09:00' })} className="btn btn-ghost">+ Evento</button>
            <button onClick={() => setTaskModal({ dateStr: today, time: '09:00' })} className="btn btn-ghost">+ Tarea</button>
            <button onClick={() => setAbsenceModal(true)} className="btn btn-ghost">🚫 Ausencia</button>
            <button onClick={() => setSyncModal(true)} className="btn btn-ghost">🔄 Sincronizar</button>
          </div>
        </div>

        {/* Controls */}
        <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={navPrev}>←</button>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', minWidth: 200, textAlign: 'center' }}>{navLabel}</span>
            <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={navNext}>→</button>
            <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={navToday}>Hoy</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setSelectedTech('all')} className={`btn ${selectedTech === 'all' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 12, padding: '5px 12px' }}>Todos</button>
            {technicians.map(t => (
              <button key={t.id} onClick={() => setSelectedTech(selectedTech === t.id ? 'all' : t.id)}
                style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '2px solid', cursor: 'pointer', fontWeight: 600,
                  borderColor: techColors[t.id], background: selectedTech === t.id ? techColors[t.id] : 'transparent',
                  color: selectedTech === t.id ? '#fff' : techColors[t.id] }}>
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* ─── ANNUAL VIEW ─── */}
        {view === 'year' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {MONTHS.map((mName, mIdx) => {
              const firstDay = new Date(year, mIdx, 1).getDay();
              const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
              const mStr = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
              const monthCount = filteredJobs.filter(j => j.scheduled_start?.slice(0, 7) === mStr).length
                + filteredVisits.filter(v => v.scheduled_at?.slice(0, 7) === mStr).length
                + filteredEvents.filter(e => e.start_at?.slice(0, 7) === mStr).length
                + filteredTasks.filter(t => t.due_at?.slice(0, 7) === mStr).length;
              return (
                <div key={mIdx} className="card" style={{ cursor: 'pointer', padding: '14px 16px' }}
                  onClick={() => { setMonth(mIdx); setView('month'); }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{mName}</div>
                    {monthCount > 0 && (
                      <span style={{ background: 'var(--amber)', color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{monthCount}</span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                    {['D','L','M','X','J','V','S'].map(d => (
                      <div key={d} style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center', fontWeight: 600 }}>{d}</div>
                    ))}
                    {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const dateStr = `${mStr}-${String(i + 1).padStart(2, '0')}`;
                      const hasItems = getJobsForDate(dateStr).length > 0 || getVisitsForDate(dateStr).length > 0
                        || getEventsForDate(dateStr).length > 0 || getTasksForDate(dateStr).length > 0
                        || getAbsencesForDate(dateStr).length > 0;
                      const isToday = dateStr === today;
                      return (
                        <div key={i} onClick={(e) => { if (hasItems) { e.stopPropagation(); setDayDetail(dateStr); } }}
                          style={{ textAlign: 'center', fontSize: 10.5, borderRadius: 4, padding: '4px 0', minHeight: 22, boxSizing: 'border-box',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: hasItems ? 'pointer' : 'default',
                          background: isToday ? 'var(--navy)' : hasItems ? 'var(--amber)' : 'transparent',
                          color: isToday || hasItems ? '#fff' : 'var(--text)', fontWeight: hasItems ? 700 : 400 }}>
                          {i + 1}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── MONTHLY VIEW ─── */}
        {view === 'month' && (() => {
          const firstDay = new Date(year, month, 1).getDay();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const prevDays = new Date(year, month, 0).getDate();
          const cells = [];
          for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevDays - i, current: false, date: null });
          for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            cells.push({ day: i, current: true, date: dateStr });
          }
          const remaining = 42 - cells.length;
          for (let i = 1; i <= remaining; i++) cells.push({ day: i, current: false, date: null });
          return (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
                {DAYS_SHORT.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--muted)', padding: '8px 0' }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {cells.map((cell, idx) => {
                  const dayJobs = cell.date ? getJobsForDate(cell.date) : [];
                  const dayVisits = cell.date ? getVisitsForDate(cell.date) : [];
                  const dayEvents = cell.date ? getEventsForDate(cell.date) : [];
                  const dayTasks = cell.date ? getTasksForDate(cell.date) : [];
                  const dayAbsences = cell.date ? getAbsencesForDate(cell.date) : [];
                  const dayTotal = dayJobs.length + dayVisits.length + dayEvents.length + dayTasks.length + dayAbsences.length;
                  const isToday = cell.date === today;
                  const isDragOver = cell.current && dragOverDate === cell.date;
                  return (
                    <div key={idx} style={{ minHeight: 100, height: 100, padding: '6px 8px', borderRadius: 8,
                      background: isDragOver ? 'var(--amber-tint)' : isToday ? 'var(--info-tint)' : 'var(--surface)',
                      border: isDragOver ? '2px dashed var(--amber)' : isToday ? '2px solid var(--navy)' : '1px solid var(--border)',
                      opacity: cell.current ? 1 : 0.4,
                      boxSizing: 'border-box', overflow: 'hidden', position: 'relative',
                      cursor: cell.current && (dayTotal > 0 || canScheduleVisit) ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (!cell.current) return;
                        if (dayTotal > 0) setDayDetail(cell.date);
                        else if (canScheduleVisit) setScheduleModal({ dateStr: cell.date, time: '09:00' });
                      }}
                      onDragOver={(e) => { if (cell.current) { e.preventDefault(); setDragOverDate(cell.date); } }}
                      onDragLeave={() => { if (dragOverDate === cell.date) setDragOverDate(null); }}
                      onDrop={(e) => { if (cell.current) { e.preventDefault(); handleDayDrop(cell.date); } }}>
                      <div style={{ fontSize: 13, fontWeight: isToday ? 800 : 500, color: cell.current ? 'var(--text)' : 'var(--muted)', marginBottom: 4, width: 'fit-content' }}>{cell.day}</div>
                      {dayAbsences.slice(0, 3).map(a => (
                        <div key={`a${a.id}`} onClick={(e) => { e.stopPropagation(); setSelectedAbsence(a); }}
                          style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, marginBottom: 2, cursor: 'pointer',
                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                            background: 'var(--danger-tint)', color: 'var(--warn)', userSelect: 'none', WebkitUserSelect: 'none' }}>
                          <span style={{ fontSize: 9 }}>🚫</span> {a.technicians?.name ?? 'Técnico'} ausente
                        </div>
                      ))}
                      {dayVisits.slice(0, Math.max(2 - dayAbsences.length, 0)).map(v => (
                        <div key={`v${v.id}`} onClick={(e) => { e.stopPropagation(); setSelectedVisit(v); }}
                          style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, marginBottom: 2, cursor: 'pointer',
                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                            background: 'var(--surface)', border: `2px solid ${techColors[v.technician_id] ?? 'var(--ink-faint)'}`, color: techColors[v.technician_id] ?? 'var(--ink-faint)', userSelect: 'none', WebkitUserSelect: 'none' }}>
                          <span style={{ fontSize: 9 }}>👁</span> {v.requests?.title ?? 'Visita'}
                        </div>
                      ))}
                      {dayJobs.slice(0, Math.max(3 - dayAbsences.length - dayVisits.length, 0)).map(j => (
                        <div key={j.id} onClick={(e) => { e.stopPropagation(); openEntry('job', j); }}
                          draggable={canQuickReschedule}
                          onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', j.id); e.dataTransfer.effectAllowed = 'move'; setDraggingEntry({ type: 'job', item: j }); }}
                          onDragEnd={() => { setDraggingEntry(null); setDragOverDate(null); }}
                          style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, marginBottom: 2, cursor: canQuickReschedule ? 'grab' : 'pointer',
                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                            background: techColors[j.technician_id] ?? 'var(--ink-faint)', color: '#fff', userSelect: 'none', WebkitUserSelect: 'none' }}>
                          {j.title}
                        </div>
                      ))}
                      {dayEvents.slice(0, Math.max(3 - dayAbsences.length - dayVisits.length - dayJobs.length, 0)).map(e => (
                        <div key={`e${e.id}`} onClick={(ev) => { ev.stopPropagation(); openEntry('event', e); }}
                          draggable={canQuickReschedule}
                          onDragStart={(ev) => { ev.stopPropagation(); ev.dataTransfer.setData('text/plain', e.id); ev.dataTransfer.effectAllowed = 'move'; setDraggingEntry({ type: 'event', item: e }); }}
                          onDragEnd={() => { setDraggingEntry(null); setDragOverDate(null); }}
                          style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, marginBottom: 2, cursor: canQuickReschedule ? 'grab' : 'pointer',
                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                            background: 'var(--surface)', border: `2px solid ${techColors[e.technician_id] ?? 'var(--navy)'}`, color: techColors[e.technician_id] ?? 'var(--navy)', userSelect: 'none', WebkitUserSelect: 'none' }}>
                          <span style={{ fontSize: 9 }}>{ENTRY_TYPE_ICONS.event}</span> {e.title}
                        </div>
                      ))}
                      {dayTasks.slice(0, Math.max(3 - dayAbsences.length - dayVisits.length - dayJobs.length - dayEvents.length, 0)).map(t => (
                        <div key={`t${t.id}`} onClick={(ev) => { ev.stopPropagation(); openEntry('task', t); }}
                          draggable={canQuickReschedule}
                          onDragStart={(ev) => { ev.stopPropagation(); ev.dataTransfer.setData('text/plain', t.id); ev.dataTransfer.effectAllowed = 'move'; setDraggingEntry({ type: 'task', item: t }); }}
                          onDragEnd={() => { setDraggingEntry(null); setDragOverDate(null); }}
                          style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, marginBottom: 2, cursor: canQuickReschedule ? 'grab' : 'pointer',
                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textDecoration: t.completed ? 'line-through' : 'none',
                            background: 'var(--surface)', border: `2px dashed ${techColors[t.technician_id] ?? 'var(--muted)'}`, color: techColors[t.technician_id] ?? 'var(--muted)', userSelect: 'none', WebkitUserSelect: 'none' }}>
                          <span style={{ fontSize: 9 }}>{ENTRY_TYPE_ICONS[t.task_type]}</span> {t.title}
                        </div>
                      ))}
                      {dayTotal > 3 && (
                        <div onClick={(e) => { e.stopPropagation(); setDayDetail(cell.date); }}
                          style={{ fontSize: 10, color: 'var(--navy)', fontWeight: 700, cursor: 'pointer', width: 'fit-content' }}>
                          +{dayTotal - 3} más
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ─── WEEKLY VIEW ─── */}
        {view === 'week' && (() => {
          const startHour = 6;
          const endHour = 20;
          const hours = Array.from({ length: endHour - startHour }, (_, i) => i + startHour);
          return (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', minWidth: 700 }}>
                <div style={{ borderBottom: '2px solid var(--border)', padding: '8px 0' }} />
                {weekDays.map((d, i) => {
                  const isToday = fmtDate(d) === today;
                  const dateStr = fmtDate(d);
                  return (
                    <div key={i} onClick={() => setDayDetail(dateStr)}
                      style={{ textAlign: 'center', padding: '8px 4px', borderBottom: '2px solid var(--border)', background: isToday ? 'var(--info-tint)' : 'transparent', cursor: 'pointer' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{DAYS_SHORT[d.getDay()]}</div>
                      <div style={{ fontSize: 18, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--navy)' : 'var(--text)' }}>{d.getDate()}</div>
                    </div>
                  );
                })}
                <div style={{ borderBottom: '1px solid var(--border)' }} />
                {weekDays.map((d, i) => {
                  const dayAbsences = getAbsencesForDate(fmtDate(d));
                  return (
                    <div key={`abs${i}`} style={{ borderBottom: '1px solid var(--border)', padding: '2px 4px', display: 'grid', gap: 2 }}>
                      {dayAbsences.map(a => (
                        <div key={a.id} onClick={() => setSelectedAbsence(a)}
                          style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                            background: 'var(--danger-tint)', color: 'var(--warn)', userSelect: 'none', WebkitUserSelect: 'none' }}>
                          <span style={{ fontSize: 9 }}>🚫</span> {a.technicians?.name ?? 'Técnico'}
                        </div>
                      ))}
                    </div>
                  );
                })}
                {hours.map(hour => (
                  [
                    <div key={`h${hour}`} style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', paddingRight: 8, paddingTop: 4, borderTop: '1px solid var(--border)', height: 64 }}>
                      {String(hour).padStart(2,'0')}:00
                    </div>,
                    ...weekDays.map((d, di) => {
                      const dateStr = fmtDate(d);
                      const hourJobs = filteredJobs.filter(j => {
                        if (!j.scheduled_start) return false;
                        const start = new Date(j.scheduled_start);
                        return start.toISOString().slice(0, 10) === dateStr && start.getHours() === hour;
                      });
                      const hourVisits = filteredVisits.filter(v => {
                        if (!v.scheduled_at) return false;
                        const start = new Date(v.scheduled_at);
                        return start.toISOString().slice(0, 10) === dateStr && start.getHours() === hour;
                      });
                      const hourEvents = filteredEvents.filter(e => {
                        if (!e.start_at) return false;
                        const start = new Date(e.start_at);
                        return start.toISOString().slice(0, 10) === dateStr && start.getHours() === hour;
                      });
                      const hourTasks = filteredTasks.filter(t => {
                        if (!t.due_at) return false;
                        const start = new Date(t.due_at);
                        return start.toISOString().slice(0, 10) === dateStr && start.getHours() === hour;
                      });
                      return (
                        <div key={`${hour}-${di}`} style={{ borderTop: '1px solid var(--border)', borderLeft: '1px solid var(--border)', height: 64, padding: 2, cursor: canScheduleVisit ? 'pointer' : 'default' }}
                          onClick={() => { if (canScheduleVisit) setScheduleModal({ dateStr, time: `${String(hour).padStart(2,'0')}:00` }); }}>
                          {hourVisits.map(v => (
                            <div key={`v${v.id}`} onClick={(e) => { e.stopPropagation(); setSelectedVisit(v); }}
                              style={{ background: 'var(--surface)', border: `2px solid ${techColors[v.technician_id] ?? 'var(--ink-faint)'}`, color: techColors[v.technician_id] ?? 'var(--ink-faint)',
                                borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 2, overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' }}>
                              <span style={{ fontSize: 9 }}>👁</span> {v.requests?.title ?? 'Visita'}
                              <div style={{ fontSize: 10, opacity: 0.85 }}>{fmtTime(v.scheduled_at)}</div>
                            </div>
                          ))}
                          {hourJobs.map(j => {
                            const start = new Date(j.scheduled_start);
                            const end = new Date(j.scheduled_end ?? j.scheduled_start);
                            const duration = Math.max((end - start) / 3600000, 0.5);
                            return (
                              <div key={j.id} onClick={(e) => { e.stopPropagation(); openEntry('job', j); }}
                                style={{ background: techColors[j.technician_id] ?? 'var(--ink-faint)', color: '#fff', borderRadius: 4, padding: '2px 6px',
                                  fontSize: 11, fontWeight: 600, cursor: 'pointer', height: `${Math.min(duration * 64, 60)}px`, overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' }}>
                                {j.title}
                                <div style={{ fontSize: 10, opacity: 0.85 }}>{fmtTime(j.scheduled_start)}</div>
                              </div>
                            );
                          })}
                          {hourEvents.map(e => (
                            <div key={`e${e.id}`} onClick={(ev) => { ev.stopPropagation(); openEntry('event', e); }}
                              style={{ background: 'var(--surface)', border: `2px solid ${techColors[e.technician_id] ?? 'var(--navy)'}`, color: techColors[e.technician_id] ?? 'var(--navy)',
                                borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 2, overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' }}>
                              <span style={{ fontSize: 9 }}>{ENTRY_TYPE_ICONS.event}</span> {e.title}
                              <div style={{ fontSize: 10, opacity: 0.85 }}>{fmtTime(e.start_at)}</div>
                            </div>
                          ))}
                          {hourTasks.map(t => (
                            <div key={`t${t.id}`} onClick={(ev) => { ev.stopPropagation(); openEntry('task', t); }}
                              style={{ background: 'var(--surface)', border: `2px dashed ${techColors[t.technician_id] ?? 'var(--muted)'}`, color: techColors[t.technician_id] ?? 'var(--muted)',
                                textDecoration: t.completed ? 'line-through' : 'none',
                                borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 2, overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' }}>
                              <span style={{ fontSize: 9 }}>{ENTRY_TYPE_ICONS[t.task_type]}</span> {t.title}
                              <div style={{ fontSize: 10, opacity: 0.85 }}>{fmtTime(t.due_at)}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })
                  ]
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ─── SIDE PANEL: Pending Requests ─── */}
      {showRequests && (
        <div className="card" style={{ width: 280, flexShrink: 0, padding: 16, position: 'sticky', top: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--navy)', marginBottom: 12 }}>
            Solicitudes pendientes {pendingRequests.length > 0 && `(${pendingRequests.length})`}
          </div>
          {pendingRequests.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>No hay solicitudes nuevas.</div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {pendingRequests.map(r => (
              <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--navy)' }}>{r.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6 }}>{r.clients?.name}</div>
                {canScheduleVisit && (
                  <button className="btn btn-primary" style={{ width: '100%', fontSize: 11.5, padding: '5px 0' }}
                    onClick={() => setScheduleModal({ requestId: r.id })}>
                    Agendar visita
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── SCHEDULE MODAL ─── */}
      {scheduleModal && (
        <ScheduleModal
          data={scheduleModal}
          pendingRequests={pendingRequests}
          technicians={technicians}
          saving={saving}
          onClose={() => setScheduleModal(null)}
          onSubmit={handleSchedule}
        />
      )}

      {/* Quick reschedule: move a job/event/task's date without opening its full detail */}
      {quickReschedule && (
        <QuickRescheduleModal
          data={quickReschedule}
          saving={savingQuick}
          onClose={() => setQuickReschedule(null)}
          onSave={saveQuickReschedule}
          onViewDetails={viewQuickDetails}
        />
      )}

      {/* Day detail modal */}
      {dayDetail && (() => {
        const dItems = [
          ...getAbsencesForDate(dayDetail).map(a => ({ type: 'absence', item: a, time: null, label: `🚫 ${a.technicians?.name ?? 'Técnico'} ausente`, color: 'var(--warn)' })),
          ...getVisitsForDate(dayDetail).map(v => ({ type: 'visit', item: v, time: v.scheduled_at, label: `👁 ${v.requests?.title ?? 'Visita'}`, color: techColors[v.technician_id] ?? 'var(--ink-faint)' })),
          ...getJobsForDate(dayDetail).map(j => ({ type: 'job', item: j, time: j.scheduled_start, label: j.title, color: techColors[j.technician_id] ?? 'var(--ink-faint)' })),
          ...getEventsForDate(dayDetail).map(e => ({ type: 'event', item: e, time: e.start_at, label: `${ENTRY_TYPE_ICONS.event} ${e.title}`, color: techColors[e.technician_id] ?? 'var(--navy)' })),
          ...getTasksForDate(dayDetail).map(t => ({ type: 'task', item: t, time: t.due_at, label: `${ENTRY_TYPE_ICONS[t.task_type]} ${t.title}`, color: techColors[t.technician_id] ?? 'var(--muted)' })),
        ].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

        const handleItemClick = (di) => {
          setDayDetail(null);
          if (di.type === 'absence') setSelectedAbsence(di.item);
          else if (di.type === 'visit') setSelectedVisit(di.item);
          else openEntry(di.type, di.item);
        };

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
            onClick={() => setDayDetail(null)}>
            <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 420, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)', textTransform: 'capitalize' }}>
                  {new Date(`${dayDetail}T00:00:00`).toLocaleDateString('es-PR', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                <button onClick={() => setDayDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
              </div>
              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dItems.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>No hay nada programado.</div>}
                {dItems.map((di, i) => (
                  <div key={`${di.type}-${di.item.id}-${i}`} onClick={() => handleItemClick(di)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${di.color}`, background: 'var(--bg)' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: di.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{di.label}</span>
                    {di.time && <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0, marginLeft: 8 }}>{fmtTime(di.time)}</span>}
                  </div>
                ))}
              </div>
              {canScheduleVisit && (
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                  onClick={() => { const d = dayDetail; setDayDetail(null); setScheduleModal({ dateStr: d, time: '09:00' }); }}>
                  + Agendar visita
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Job detail modal */}
      {selectedJob && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => { setSelectedJob(null); setReschedulingJob(false); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>{selectedJob.title}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  {selectedJob.clients?.name}
                  {selectedJob.schedule_day_id && ' · día adicional'}
                </div>
              </div>
              <button onClick={() => { setSelectedJob(null); setReschedulingJob(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: 0, marginBottom: 20 }}>
              {[
                ['Estado', <span style={{ fontWeight: 600, color: STATUS_COLORS[selectedJob.status] }}>{STATUS_LABELS[selectedJob.status]}</span>],
                ['Técnico', selectedJob.technicians?.name ?? '— Sin asignar —'],
                ['Inicio', selectedJob.scheduled_start ? new Date(selectedJob.scheduled_start).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'],
                ['Fin', selectedJob.scheduled_end ? new Date(selectedJob.scheduled_end).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{value}</span>
                </div>
              ))}
            </div>

            {reschedulingJob ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group">
                    <label>Inicio</label>
                    <input type="datetime-local" value={rescheduleForm.start} onChange={e => setRescheduleForm(f => ({ ...f, start: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Fin</label>
                    <input type="datetime-local" value={rescheduleForm.end} onChange={e => setRescheduleForm(f => ({ ...f, end: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary" onClick={saveJobReschedule} disabled={savingReschedule} style={{ flex: 1, justifyContent: 'center' }}>
                    {savingReschedule ? 'Guardando...' : '💾 Guardar'}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setReschedulingJob(false)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="btn btn-amber" style={{ width: '100%', justifyContent: 'center' }} onClick={() => openJobReschedule(selectedJob)}>
                  🗓️ Reagendar
                </button>
                <Link href={`/trabajos/${selectedJob.job_id ?? selectedJob.id}`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  Ver trabajo completo →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Visit detail modal */}
      {selectedVisit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setSelectedVisit(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>{selectedVisit.requests?.title ?? 'Visita'}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{selectedVisit.requests?.clients?.name}</div>
              </div>
              <button onClick={() => setSelectedVisit(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: 0, marginBottom: 20 }}>
              {[
                ['Estado', VISIT_STATUS_LABELS[selectedVisit.status] ?? selectedVisit.status],
                ['Técnico', selectedVisit.technicians?.name ?? '— Sin asignar —'],
                ['Fecha/Hora', selectedVisit.scheduled_at ? new Date(selectedVisit.scheduled_at).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'],
                ['Duración', `${selectedVisit.duration_minutes ?? 60} min`],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{value}</span>
                </div>
              ))}
            </div>
            <Link href={`/solicitudes/${selectedVisit.request_id}`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Ver solicitud completa →
            </Link>
          </div>
        </div>
      )}

      {/* Event detail modal */}
      {selectedEvent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setSelectedEvent(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>{ENTRY_TYPE_ICONS.event} {selectedEvent.title}</div>
                {selectedEvent.clients?.name && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{selectedEvent.clients.name}</div>}
              </div>
              <button onClick={() => setSelectedEvent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: 0, marginBottom: 20 }}>
              {[
                ['Técnicos', [selectedEvent.technicians?.name, ...(selectedEvent.calendar_event_technicians ?? []).map(et => et.technicians?.name)]
                  .filter(Boolean).join(', ') || '— Sin asignar —'],
                ['Inicio', new Date(selectedEvent.start_at).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })],
                ['Fin', new Date(selectedEvent.end_at).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })],
                ...(selectedEvent.address ? [['Dirección', (
                  <a href={pickMapsLink(selectedEvent.address)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--amber)', fontWeight: 600 }}>
                    📍 {selectedEvent.address}
                  </a>
                )]] : []),
                ['Notas', selectedEvent.notes || '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', gap: 12 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span>
                  <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>
            {renderEntryNotes('event', eventNotes)}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => { setEventModal({ editing: selectedEvent }); setSelectedEvent(null); }}>
                ✏️ Editar
              </button>
              <button className="btn btn-ghost" style={{ color: 'var(--warn)' }}
                onClick={() => deleteEvent(selectedEvent.id)}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task detail modal */}
      {selectedTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setSelectedTask(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)', textDecoration: selectedTask.completed ? 'line-through' : 'none' }}>
                  {ENTRY_TYPE_ICONS[selectedTask.task_type]} {selectedTask.title}
                </div>
                {selectedTask.clients?.name && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{selectedTask.clients.name}</div>}
              </div>
              <button onClick={() => setSelectedTask(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: 0, marginBottom: 16 }}>
              {[
                ['Tipo', selectedTask.task_type === 'checklist' ? 'Checklist' : 'Recordatorio'],
                ['Técnico', selectedTask.technicians?.name ?? '— Sin asignar —'],
                ['Vence', new Date(selectedTask.due_at).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })],
                ...(selectedTask.address ? [['Dirección', (
                  <a href={pickMapsLink(selectedTask.address)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--amber)', fontWeight: 600 }}>
                    📍 {selectedTask.address}
                  </a>
                )]] : []),
                ['Notas', selectedTask.notes || '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', gap: 12 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span>
                  <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>
            {selectedTask.task_type === 'checklist' && (selectedTask.task_items ?? []).length > 0 && (
              <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
                {[...selectedTask.task_items].sort((a, b) => a.sort_order - b.sort_order).map(item => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    onToggle={() => toggleTaskItem(item)}
                    onUploadFiles={files => uploadItemAttachments(item, files)}
                    onRemoveAttachment={index => removeItemAttachment(item, index)}
                    onOpenLightbox={index => setLightbox({ item, index })}
                  />
                ))}
              </div>
            )}
            {renderEntryNotes('task', taskNotes)}
            {selectedTask.client_id && (
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                onClick={() => setAddToJobModal(true)}>
                {addedToJob ? '✓ Añadido al trabajo' : '📎 Añadir a trabajo'}
              </button>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => toggleTaskCompleted(selectedTask)}>
                {selectedTask.completed ? 'Marcar pendiente' : 'Marcar completada'}
              </button>
              <button className="btn btn-ghost" style={{ color: 'var(--warn)' }} onClick={() => deleteTask(selectedTask.id)}>
                Eliminar
              </button>
            </div>
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => { setTaskModal({ editing: selectedTask }); setSelectedTask(null); }}>
              ✏️ Editar tarea
            </button>
          </div>
        </div>
      )}

      {/* Absence detail modal */}
      {selectedAbsence && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setSelectedAbsence(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>🚫 Ausencia</div>
              <button onClick={() => setSelectedAbsence(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: 0, marginBottom: 20 }}>
              {[
                ['Técnico', selectedAbsence.technicians?.name ?? '—'],
                ['Fecha', new Date(`${selectedAbsence.date}T00:00:00`).toLocaleDateString('es-PR', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })],
                ['Razón', selectedAbsence.reason || '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', gap: 12 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span>
                  <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', color: 'var(--warn)' }}
              onClick={() => deleteAbsence(selectedAbsence.id)}>
              Eliminar ausencia
            </button>
          </div>
        </div>
      )}

      {/* Create absence modal */}
      {absenceModal && (
        <AbsenceModal
          technicians={technicians}
          saving={saving}
          onClose={() => setAbsenceModal(false)}
          onSubmit={handleCreateAbsence}
        />
      )}

      {/* Add task/note to an existing job of the same client */}
      {addToJobModal && selectedTask && (
        <AddToJobModal
          clientId={selectedTask.client_id}
          clientName={selectedTask.clients?.name}
          onClose={() => setAddToJobModal(false)}
          onConfirm={jobId => addTaskToJob(selectedTask, jobId)}
        />
      )}

      {/* Create/edit event modal */}
      {eventModal && (
        <EventModal
          data={eventModal}
          technicians={technicians}
          clients={clients}
          clientProperties={clientProperties}
          saving={saving}
          onClose={() => setEventModal(null)}
          onSubmit={eventModal.editing ? handleUpdateEvent : handleCreateEvent}
        />
      )}

      {/* Create/edit task modal */}
      {taskModal && (
        <TaskModal
          data={taskModal}
          technicians={technicians}
          clients={clients}
          clientProperties={clientProperties}
          saving={saving}
          onClose={() => setTaskModal(null)}
          onSubmit={taskModal.editing ? handleUpdateTask : handleCreateTask}
        />
      )}

      {/* Apple Calendar sync modal */}
      {syncModal && (
        <SyncModal technicians={technicians} onClose={() => setSyncModal(false)} />
      )}

      {/* Attachment lightbox: large view with prev/next scrolling between photos/videos */}
      {lightbox && (
        <AttachmentLightbox item={lightbox.item} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

function ScheduleModal({ data, pendingRequests, technicians, saving, onClose, onSubmit }) {
  const [requestId, setRequestId] = useState(data.requestId ?? '');
  const [technicianId, setTechnicianId] = useState('');
  const [dateStr, setDateStr] = useState(data.dateStr ?? new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(data.time ?? '09:00');
  const [duration, setDuration] = useState(60);

  const canSubmit = requestId && technicianId && dateStr && time;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>Agendar visita</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
        </div>

        <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Solicitud</label>
            <select value={requestId} onChange={e => setRequestId(e.target.value)} className="input" style={{ width: '100%' }}>
              <option value="">— Selecciona —</option>
              {pendingRequests.map(r => (
                <option key={r.id} value={r.id}>{r.title} — {r.clients?.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Técnico</label>
            <select value={technicianId} onChange={e => setTechnicianId(e.target.value)} className="input" style={{ width: '100%' }}>
              <option value="">— Selecciona —</option>
              {technicians.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Fecha</label>
              <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} className="input" style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Hora</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="input" style={{ width: '100%' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Duración (min)</label>
            <input type="number" step="15" value={duration} onChange={e => setDuration(parseInt(e.target.value) || 60)} className="input" style={{ width: '100%' }} />
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
          disabled={!canSubmit || saving}
          onClick={() => onSubmit({ requestId, technicianId, dateStr, time, duration })}>
          {saving ? 'Agendando...' : 'Agendar visita'}
        </button>
      </div>
    </div>
  );
}

function EventModal({ data, technicians, clients, clientProperties, saving, onClose, onSubmit }) {
  const editing = data.editing;
  const localStart = editing ? isoToLocalInput(editing.start_at) : null;
  const localEnd = editing ? isoToLocalInput(editing.end_at) : null;
  const [title, setTitle] = useState(editing?.title ?? '');
  const [dateStr, setDateStr] = useState(editing ? localStart.slice(0, 10) : (data.dateStr ?? new Date().toISOString().slice(0, 10)));
  const [startTime, setStartTime] = useState(editing ? localStart.slice(11, 16) : (data.time ?? '09:00'));
  const [endTime, setEndTime] = useState(editing ? localEnd.slice(11, 16) : (data.time ?? '10:00'));
  const [technicianIds, setTechnicianIds] = useState(() => editing
    ? [editing.technician_id, ...(editing.calendar_event_technicians ?? []).map(et => et.technician_id)].filter(Boolean)
    : []);
  const [clientId, setClientId] = useState(editing?.client_id ?? '');
  const [propertyId, setPropertyId] = useState('');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [address, setAddress] = useState(editing?.address ?? '');

  const canSubmit = title.trim() && dateStr && startTime && endTime;

  const clientProps = (clientProperties ?? []).filter(p => p.client_id === clientId);

  function toggleTechnician(techId) {
    setTechnicianIds(ids => ids.includes(techId) ? ids.filter(id => id !== techId) : [...ids, techId]);
  }

  function selectProperty(id) {
    setPropertyId(id);
    const p = clientProps.find(p => p.id === id);
    if (p) setAddress([p.street, p.city, p.state, p.zip].filter(Boolean).join(', '));
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>📌 {editing ? 'Editar evento' : 'Nuevo evento'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
        </div>

        <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Título</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input" style={{ width: '100%' }} placeholder="Ej. Reunión con cliente" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Fecha</label>
              <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} className="input" style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Inicio</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="input" style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Fin</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="input" style={{ width: '100%' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Técnicos (opcional, puedes escoger más de uno)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {technicians.map(t => {
                const checked = technicianIds.includes(t.id);
                return (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: checked ? 'var(--navy)' : 'var(--surface)', color: checked ? '#fff' : 'var(--navy)', border: '1.5px solid var(--border)', borderRadius: 20, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleTechnician(t.id)} style={{ margin: 0 }} />
                    {t.name}
                  </label>
                );
              })}
              {technicians.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 12 }}>No hay técnicos registrados.</p>}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Cliente (opcional)</label>
            <ClientCombobox clients={clients} value={clientId} onChange={id => { setClientId(id); setPropertyId(''); }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Dirección (opcional)</label>
            {clientProps.length > 0 && (
              <select value={propertyId} onChange={e => selectProperty(e.target.value)} className="input" style={{ width: '100%', marginBottom: 6 }}>
                <option value="">— Escoger propiedad del cliente —</option>
                {clientProps.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name ? `${p.name} — ` : ''}{[p.street, p.city].filter(Boolean).join(', ')}{p.is_primary ? ' (Principal)' : ''}
                  </option>
                ))}
              </select>
            )}
            <input value={address} onChange={e => setAddress(e.target.value)} className="input" style={{ width: '100%' }} placeholder="Ej. 123 Calle Sol, San Juan, PR" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input" style={{ width: '100%', minHeight: 60 }} />
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
          disabled={!canSubmit || saving}
          onClick={() => onSubmit({ id: editing?.id, title: title.trim(), dateStr, startTime, endTime, technicianIds, clientId, notes, address: address.trim() })}>
          {saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Crear evento')}
        </button>
      </div>
    </div>
  );
}

function AbsenceModal({ technicians, saving, onClose, onSubmit }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [technicianId, setTechnicianId] = useState(technicians[0]?.id ?? '');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [reason, setReason] = useState('');

  const canSubmit = technicianId && startDate && endDate && startDate <= endDate;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>🚫 Marcar ausencia</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
        </div>

        <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Técnico</label>
            <select value={technicianId} onChange={e => setTechnicianId(e.target.value)} className="input" style={{ width: '100%' }}>
              {technicians.length === 0 && <option value="">No hay técnicos registrados</option>}
              {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Desde</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input" style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Hasta</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input" style={{ width: '100%' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Razón</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} className="input" style={{ width: '100%', minHeight: 60 }} placeholder="Ej. Enfermedad, cita médica, asunto personal..." />
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
          disabled={!canSubmit || saving}
          onClick={() => onSubmit({ technicianId, startDate, endDate, reason: reason.trim() })}>
          {saving ? 'Guardando...' : 'Bloquear día(s)'}
        </button>
      </div>
    </div>
  );
}

function TaskModal({ data, technicians, clients, clientProperties, saving, onClose, onSubmit }) {
  const editing = data.editing;
  const localDue = editing ? isoToLocalInput(editing.due_at) : null;
  const [taskType, setTaskType] = useState(editing?.task_type ?? 'reminder');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [dateStr, setDateStr] = useState(editing ? localDue.slice(0, 10) : (data.dateStr ?? new Date().toISOString().slice(0, 10)));
  const [time, setTime] = useState(editing ? localDue.slice(11, 16) : (data.time ?? '09:00'));
  const [technicianId, setTechnicianId] = useState(editing?.technician_id ?? '');
  const [clientId, setClientId] = useState(editing?.client_id ?? '');
  const [propertyId, setPropertyId] = useState('');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [checklistItems, setChecklistItems] = useState(['']);

  const canSubmit = title.trim() && dateStr && time
    && (editing || taskType !== 'checklist' || checklistItems.some(i => i.trim()));

  const clientProps = (clientProperties ?? []).filter(p => p.client_id === clientId);

  function selectProperty(id) {
    setPropertyId(id);
    const p = clientProps.find(p => p.id === id);
    if (p) setAddress([p.street, p.city, p.state, p.zip].filter(Boolean).join(', '));
  }

  function updateItem(i, value) {
    setChecklistItems(items => items.map((it, idx) => idx === i ? value : it));
  }
  function addItem() {
    setChecklistItems(items => [...items, '']);
  }
  function removeItem(i) {
    setChecklistItems(items => items.filter((_, idx) => idx !== i));
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 420, maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>{editing ? 'Editar tarea' : 'Nueva tarea'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
        </div>

        <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['reminder', '🔔 Recordatorio'], ['checklist', '☑ Checklist']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setTaskType(v)}
                className={`btn ${taskType === v ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}>
                {l}
              </button>
            ))}
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Título</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input" style={{ width: '100%' }} placeholder="Ej. Llamar al proveedor" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Fecha</label>
              <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} className="input" style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Hora</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="input" style={{ width: '100%' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Técnico (opcional)</label>
            <select value={technicianId} onChange={e => setTechnicianId(e.target.value)} className="input" style={{ width: '100%' }}>
              <option value="">— Sin asignar —</option>
              {technicians.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Cliente (opcional)</label>
            <ClientCombobox clients={clients} value={clientId} onChange={id => { setClientId(id); setPropertyId(''); }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Dirección (opcional)</label>
            {clientProps.length > 0 && (
              <select value={propertyId} onChange={e => selectProperty(e.target.value)} className="input" style={{ width: '100%', marginBottom: 6 }}>
                <option value="">— Escoger propiedad del cliente —</option>
                {clientProps.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name ? `${p.name} — ` : ''}{[p.street, p.city].filter(Boolean).join(', ')}{p.is_primary ? ' (Principal)' : ''}
                  </option>
                ))}
              </select>
            )}
            <input value={address} onChange={e => setAddress(e.target.value)} className="input" style={{ width: '100%' }} placeholder="Ej. 123 Calle Sol, San Juan, PR" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input" style={{ width: '100%', minHeight: 50 }} />
          </div>

          {taskType === 'checklist' && !editing && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Ítems del checklist</label>
              <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                {checklistItems.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6 }}>
                    <input value={item} onChange={e => updateItem(i, e.target.value)} className="input" style={{ flex: 1 }} placeholder={`Ítem ${i + 1}`} />
                    {checklistItems.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} className="btn btn-ghost" style={{ padding: '4px 10px' }}>×</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addItem} className="btn btn-ghost" style={{ fontSize: 12, alignSelf: 'flex-start' }}>+ Agregar ítem</button>
              </div>
            </div>
          )}
          {taskType === 'checklist' && editing && (
            <p style={{ fontSize: 11.5, color: 'var(--muted)' }}>Los ítems del checklist se administran desde el detalle de la tarea.</p>
          )}
        </div>

        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
          disabled={!canSubmit || saving}
          onClick={() => onSubmit({
            id: editing?.id,
            taskType, title: title.trim(), dateStr, time, technicianId, clientId, notes, address: address.trim(),
            checklistItems: editing ? [] : checklistItems.map(i => i.trim()).filter(Boolean),
          })}>
          {saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Crear tarea')}
        </button>
      </div>
    </div>
  );
}

function SyncModal({ technicians, onClose }) {
  const [copied, setCopied] = useState('');
  const [tokens, setTokens] = useState(() => {
    const map = {};
    technicians.forEach(t => { map[t.id] = t.ics_token; });
    return map;
  });

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  function feedUrl(token) {
    return `${origin}/api/calendar/feed?token=${token}`;
  }

  async function copy(label, url) {
    await navigator.clipboard.writeText(url);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  }

  async function regenerate(techId) {
    const newToken = crypto.randomUUID();
    await supabase.from('technicians').update({ ics_token: newToken }).eq('id', techId);
    setTokens(t => ({ ...t, [techId]: newToken }));
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 480, maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>🔄 Sincronizar con Apple Calendar</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 16 }}>
          En Apple Calendar: <strong>Archivo → Nueva suscripción de calendario</strong>, pega el enlace del técnico y guarda.
          Apple actualiza el feed automáticamente cada pocas horas. Solo funciona en una dirección: lo que se cree en Apple Calendar no se refleja aquí.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          {technicians.map(t => (
            <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 6 }}>{t.name}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input readOnly value={feedUrl(tokens[t.id])} className="input" style={{ flex: 1, fontSize: 11 }} onFocus={e => e.target.select()} />
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => copy(t.id, feedUrl(tokens[t.id]))}>
                  {copied === t.id ? '✓' : 'Copiar'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => regenerate(t.id)}>
                  Regenerar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function isVideoFile(url) { return /\.(mp4|mov|webm|avi)(\?|$)/i.test(url); }
function isPdfFile(url) { return /\.pdf(\?|$)/i.test(url); }

function ChecklistItemRow({ item, onToggle, onUploadFiles, onRemoveAttachment, onOpenLightbox }) {
  const fileRef = useRef(null);
  const urls = item.attachment_urls ?? [];

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
          <input type="checkbox" checked={item.done} onChange={onToggle} />
          <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--muted)' : 'var(--text)' }}>{item.text}</span>
        </label>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => fileRef.current?.click()}>+ Adjuntar</button>
        <input ref={fileRef} type="file" accept="image/*,video/*,application/pdf" multiple style={{ display: 'none' }}
          onChange={e => { const files = Array.from(e.target.files || []); if (files.length) onUploadFiles(files); e.target.value = ''; }} />
      </div>
      {urls.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 26 }}>
          {urls.map((url, i) => {
            // Detect type from the stored storage path, not the display URL — a freshly
            // uploaded item's URL is a blob: object URL, which carries no file extension.
            const path = (item.attachments ?? [])[i] ?? url;
            return (
              <div key={i} style={{ position: 'relative', width: 56, height: 56 }}>
                {isPdfFile(path) ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: 6, border: '1px solid var(--border)', textDecoration: 'none' }}>
                    <span style={{ fontSize: 20 }}>📄</span>
                    <span style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>PDF</span>
                  </a>
                ) : isVideoFile(path) ? (
                  <video src={url} onClick={() => onOpenLightbox(i)} controls style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }} />
                ) : (
                  <img src={url} alt="adjunto" onClick={() => onOpenLightbox(i)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }} />
                )}
                <button type="button" onClick={() => onRemoveAttachment(i)}
                  style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: 'var(--warn)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}>
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AttachmentLightbox({ item, startIndex, onClose }) {
  const entries = (item.attachment_urls ?? [])
    .map((url, i) => ({ url, path: (item.attachments ?? [])[i] ?? url, i }))
    .filter(e => !isPdfFile(e.path));
  const startPos = Math.max(entries.findIndex(e => e.i === startIndex), 0);
  const [pos, setPos] = useState(startPos);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'ArrowRight') setPos(p => (p + 1) % entries.length);
      else if (e.key === 'ArrowLeft') setPos(p => (p - 1 + entries.length) % entries.length);
      else if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [entries.length, onClose]);

  if (!entries.length) return null;
  const current = entries[pos];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
      onClick={onClose}>
      <button type="button" onClick={onClose}
        style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: 32, cursor: 'pointer', lineHeight: 1 }}>×</button>

      {entries.length > 1 && (
        <button type="button" onClick={e => { e.stopPropagation(); setPos(p => (p - 1 + entries.length) % entries.length); }}
          style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 44, height: 44, borderRadius: '50%', fontSize: 22, cursor: 'pointer' }}>
          ‹
        </button>
      )}

      <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {isVideoFile(current.path) ? (
          <video key={current.url} src={current.url} controls autoPlay style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 8 }} />
        ) : (
          <img key={current.url} src={current.url} alt="adjunto" style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 8, objectFit: 'contain' }} />
        )}
        {entries.length > 1 && (
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{pos + 1} / {entries.length}</div>
        )}
      </div>

      {entries.length > 1 && (
        <button type="button" onClick={e => { e.stopPropagation(); setPos(p => (p + 1) % entries.length); }}
          style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 44, height: 44, borderRadius: '50%', fontSize: 22, cursor: 'pointer' }}>
          ›
        </button>
      )}
    </div>
  );
}

function AddToJobModal({ clientId, clientName, onClose, onConfirm }) {
  const [jobs, setJobs] = useState(null); // null = loading
  const [jobId, setJobId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('jobs').select('id, title, job_number, status').eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setJobs(data ?? []));
  }, [clientId]);

  async function handleConfirm() {
    setSaving(true);
    try {
      await onConfirm(jobId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>Añadir a trabajo</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 16 }}>
          Se añadirá como nota (con las fotos/videos/PDF adjuntos) al trabajo de <strong>{clientName}</strong> que escojas.
        </p>
        {jobs === null ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando trabajos...</p>
        ) : jobs.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Este cliente no tiene trabajos todavía.</p>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Trabajo</label>
            <select value={jobId} onChange={e => setJobId(e.target.value)} className="input" style={{ width: '100%' }}>
              <option value="">— Selecciona —</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.job_number ? `#${j.job_number} — ` : ''}{j.title}</option>
              ))}
            </select>
          </div>
        )}
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
          disabled={!jobId || saving}
          onClick={handleConfirm}>
          {saving ? 'Añadiendo...' : 'Añadir nota'}
        </button>
      </div>
    </div>
  );
}
