'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import PhotoAnnotator from '../PhotoAnnotator';

const ORANGE = '#E05C2A';
const BG = '#EAEEF2';

export default function FieldApp() {
  const [tab, setTab] = useState('home');
  const [jobs, setJobs] = useState([]);
  const [jobFilter, setJobFilter] = useState('today');
  const [clockedIn, setClockedIn] = useState(false);
  const [activeEntry, setActiveEntry] = useState(null);
  const [timeEntries, setTimeEntries] = useState([]);
  const [techId, setTechId] = useState(null);
  const [techName, setTechName] = useState('OTESS');
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
  const [photoSuccess, setPhotoSuccess] = useState('');
  const [allJobs, setAllJobs] = useState([]);
  const fileRef = useRef();

  // Job detail state
  const [detailJob, setDetailJob] = useState(null);
  const [detailTab, setDetailTab] = useState('info');
  const [detailNotes, setDetailNotes] = useState([]);
  const [detailChecklist, setDetailChecklist] = useState([]);
  const [detailNoteText, setDetailNoteText] = useState('');
  const [detailPhotos, setDetailPhotos] = useState([]);
  const [detailPhotoPreviews, setDetailPhotoPreviews] = useState([]);
  const [savingDetailNote, setSavingDetailNote] = useState(false);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [lightbox, setLightbox] = useState(null); // { urls: [], index: 0 }
  const [annotatingIdx, setAnnotatingIdx] = useState(null);
  const [annotatingExisting, setAnnotatingExisting] = useState(null); // { noteId, url, path, isGallery, galleryIdx }
  const fileRef2 = useRef();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.replace('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', session.user.id).single();
      if (profile) setTechName(profile.name);
      const { data: tech } = await supabase.from('technicians').select('id').ilike('name', profile?.name ?? 'OTESS').single();
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

  useEffect(() => { loadJobs(); }, [jobFilter]);

  useEffect(() => {
    supabase.from('jobs').select('id, title, status, scheduled_start, scheduled_end, street, city, state, zip, property_name, contact_name, contact_phone, contact_email, clients(name, phone, email)')
      .in('status', ['scheduled', 'in_progress'])
      .order('scheduled_start', { ascending: true }).limit(20)
      .then(({ data }) => setAllJobs(data ?? []));
  }, []);

  useEffect(() => {
    if (!techId) return;
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    supabase.from('time_entries').select('*').eq('technician_id', techId)
      .gte('clocked_in_at', weekStart.toISOString()).order('clocked_in_at', { ascending: false })
      .then(({ data }) => setTimeEntries(data ?? []));
  }, [techId, clockedIn]);

  async function loadJobs() {
    setLoading(true);
    let q = supabase.from('jobs').select('id, title, status, scheduled_start, scheduled_end, street, city, state, zip, property_name, contact_name, contact_phone, contact_email, clients(name, phone, email)');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    if (jobFilter === 'today') q = q.gte('scheduled_start', today.toISOString()).lt('scheduled_start', tomorrow.toISOString());
    else if (jobFilter === 'upcoming') q = q.gte('scheduled_start', tomorrow.toISOString()).not('status', 'eq', 'completed');
    else if (jobFilter === 'done') q = q.eq('status', 'completed');
    const { data } = await q.order('scheduled_start', { ascending: true }).limit(20);
    setJobs(data ?? []);
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
    const [{ data: notes }, { data: checklist }] = await Promise.all([
      supabase.from('job_notes').select('*').eq('job_id', job.id).order('created_at', { ascending: false }),
      supabase.from('job_checklist_items').select('*').eq('job_id', job.id).order('sort_order'),
    ]);
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

  async function saveFabNote(e) {
    e.preventDefault();
    if (!fabSelectedJob || !fabNoteText.trim()) return;
    setSavingFabNote(true);
    await supabase.from('job_notes').insert([{ job_id: fabSelectedJob.id, note: fabNoteText.trim() }]);
    setSavingFabNote(false); setFabNoteText(''); setShowJobNote(false); setShowFab(false); setFabSelectedJob(null);
  }

  async function uploadFabPhoto(e) {
    const file = e.target.files?.[0];
    if (!file || !fabSelectedJob) return;
    setUploadingPhoto(true);
    const ext = file.name.split('.').pop();
    const path = fabSelectedJob.id + '/' + Date.now() + '.' + ext;
    const { error } = await supabase.storage.from('Job-photos').upload(path, file);
    setUploadingPhoto(false);
    if (!error) {
      await supabase.from('job_notes').insert([{ job_id: fabSelectedJob.id, photo_url: path }]);
      setPhotoSuccess('Foto subida');
      setTimeout(() => { setPhotoSuccess(''); setShowJobPhoto(false); setShowFab(false); setFabSelectedJob(null); }, 2000);
    }
  }

  async function saveDetailNote(e) {
    e.preventDefault();
    if (!detailNoteText.trim() && detailPhotos.length === 0) return;
    setSavingDetailNote(true);

    const uploadedPaths = [];
    for (const file of detailPhotos) {
      const ext = file.name.split('.').pop();
      const path = detailJob.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.' + ext;
      const { error } = await supabase.storage.from('Job-photos').upload(path, file);
      if (!error) uploadedPaths.push(path);
    }

    const { data: note } = await supabase.from('job_notes').insert([{
      job_id: detailJob.id,
      note: detailNoteText.trim() || null,
      photo_url: uploadedPaths[0] ?? null,
      photo_urls: uploadedPaths.length > 0 ? uploadedPaths : null,
    }]).select().single();

    if (note) {
      const signedUrls = await Promise.all(uploadedPaths.map(p => getSignedUrl(p)));
      setDetailNotes(prev => [{ ...note, photo_urls: signedUrls, photo_url: signedUrls[0] ?? null }, ...prev]);
    }

    setDetailNoteText(''); setDetailPhotos([]); setDetailPhotoPreviews([]); setSavingDetailNote(false);
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

  const fmtE = s => String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  const fmtH = es => (es.reduce((a, e) => a + (e.clocked_out_at ? new Date(e.clocked_out_at) - new Date(e.clocked_in_at) : 0), 0) / 3600000).toFixed(1) + 'h';
  const now = new Date();
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const SC = { estimate: '#888', scheduled: '#2a4cb5', in_progress: ORANGE, completed: '#27ae60', cancelled: '#b52a2a' };
  const SL = { estimate: 'Estimate', scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Done', cancelled: 'Cancelled' };
  const DSH = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
  const WD = DSH.map((_, i) => { const d = new Date(now); const off = now.getDay() === 0 ? -4 : now.getDay() >= 3 ? now.getDay() - 3 : now.getDay() + 4; d.setDate(now.getDate() - off + i); return d.getDate(); });
  const card = { margin: '0 14px 12px', background: '#fff', borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
  const navBtn = a => ({ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '10px 0 6px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, color: a ? ORANGE : '#aaa' });
  const ftab = a => ({ padding: '8px 16px', borderRadius: 50, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: a ? 'none' : '1.5px solid #dde1e7', background: a ? '#1a1a1a' : '#fff', color: a ? '#fff' : '#333' });
  const fmi = c => ({ background: c || ORANGE, color: '#fff', border: 'none', borderRadius: 50, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' });
  const NavI = ({ tab: t, icon, label }) => (
    <button style={navBtn(tab === t)} onClick={() => { setTab(t); setShowFab(false); }}>
      <span style={{ fontSize: 22 }}>{icon}</span>{label}
    </button>
  );
  const JobRow = ({ j, onClick }) => (
    <div onClick={onClick} style={{ padding: '12px 0', borderBottom: '1px solid #eee', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{j.title}</div>
        <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{j.clients?.name}</div>
        {j.scheduled_start && <div style={{ fontSize: 12, color: '#aaa', marginTop: 3 }}>📅 {new Date(j.scheduled_start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>}
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: SC[j.status], background: SC[j.status] + '18', padding: '4px 10px', borderRadius: 20, marginLeft: 10, whiteSpace: 'nowrap' }}>{SL[j.status]}</span>
    </div>
  );

  const completedCount = detailChecklist.filter(i => i.completed).length;
  const progress = detailChecklist.length > 0 ? Math.round((completedCount / detailChecklist.length) * 100) : 0;

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
                <button style={{ background: clockedIn ? '#27ae60' : ORANGE, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} onClick={clockedIn ? handleClockOut : () => handleClockIn()}>
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
                <input placeholder="Search jobs or customer..." style={{ border: 'none', background: 'none', fontSize: 15, outline: 'none', width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['today', 'upcoming', 'done', 'all'].map(f => (
                  <button key={f} style={ftab(jobFilter === f)} onClick={() => { setJobFilter(f); loadJobs(); }}>
                    {f === 'today' ? 'Today' : f === 'upcoming' ? 'Upcoming' : f === 'done' ? 'Done' : 'All'}
                  </button>
                ))}
              </div>
            </div>
            <div style={card}>
              {loading ? <div style={{ textAlign: 'center', padding: '32px 0', color: '#888' }}>Loading...</div>
                : jobs.length === 0 ? <div style={{ textAlign: 'center', padding: '32px 0', color: '#888' }}>No jobs here.</div>
                  : jobs.map(j => <JobRow key={j.id} j={j} onClick={() => openJobDetail(j)} />)
              }
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
                <button style={{ background: clockedIn ? '#27ae60' : '#f5ddd3', color: clockedIn ? '#fff' : '#c04a1a', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} onClick={clockedIn ? handleClockOut : () => handleClockIn()}>
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
                const dayHours = (dayEntries.reduce((a, e) => a + (e.clocked_out_at ? new Date(e.clocked_out_at) - new Date(e.clocked_in_at) : Date.now() - new Date(e.clocked_in_at)), 0) / 3600000).toFixed(1);
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
                  const dur = outTime ? ((outTime - inTime) / 3600000).toFixed(2) : null;
                  return (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < selectedDay.entries.length - 1 ? '1px solid #eee' : 'none' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {inTime.toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })}
                          {outTime ? ' → ' + outTime.toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' }) : ' → En progreso'}
                        </div>
                        {e.job_id && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>Con trabajo</div>}
                      </div>
                      <div style={{ fontWeight: 700, color: dur ? '#16223d' : ORANGE, fontSize: 14 }}>
                        {dur ? dur + 'h' : '⏱'}
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
          </div>
        )}

        {tab === 'calendar' && (
          <div>
            <div style={{ padding: '20px 20px 16px' }}><div style={{ fontSize: 26, fontWeight: 700 }}>Calendar</div></div>
            <div style={{ ...card, textAlign: 'center', padding: '60px 20px', color: '#aaa' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
              <div>No events scheduled</div>
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
      </div>

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
            {[['info', '📋 Info'], ['checklist', `✅ (${completedCount}/${detailChecklist.length})`], ['notes', `📸 (${detailNotes.length})`]].map(([t, label]) => (
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
                      {detailJob.clients?.phone && <a href={`tel:${detailJob.clients.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#27ae60', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>📞 {detailJob.clients.phone}</a>}
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
                      {detailJob.contact_phone && <a href={`tel:${detailJob.contact_phone}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#27ae60', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>📞 {detailJob.contact_phone}</a>}
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
                    {(detailJob.street || detailJob.city) && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([detailJob.street, detailJob.city, detailJob.state, detailJob.zip].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🗺️ Maps</a>
                        <a href={`https://maps.apple.com/?q=${encodeURIComponent([detailJob.street, detailJob.city, detailJob.state, detailJob.zip].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#000', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🍎 Apple</a>
                        <a href={`https://waze.com/ul?q=${encodeURIComponent([detailJob.street, detailJob.city, detailJob.state, detailJob.zip].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#33CCFF', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🚗 Waze</a>
                      </div>
                    )}
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
                      <span style={{ fontWeight: 700, color: progress === 100 ? '#27ae60' : ORANGE }}>{progress}%</span>
                    </div>
                    <div style={{ background: '#eee', borderRadius: 50, height: 8 }}>
                      <div style={{ background: progress === 100 ? '#27ae60' : ORANGE, borderRadius: 50, height: 8, width: progress + '%', transition: 'width 0.3s' }} />
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
                            <div style={{ width: 24, height: 24, borderRadius: '50%', border: item.completed ? 'none' : '2px solid #dde1e7', background: item.completed ? '#27ae60' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
                            {!detailPhotos[idx]?.type?.startsWith('video') && (
                              <button type="button" onClick={() => setAnnotatingIdx(idx)}
                                style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✏️ Marcar</button>
                            )}
                            <button type="button" onClick={() => {
                              setDetailPhotos(prev => prev.filter((_, i) => i !== idx));
                              setDetailPhotoPreviews(prev => prev.filter((_, i) => i !== idx));
                            }}
                              style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 13 }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <input ref={fileRef2} type="file" accept="image/*,video/*" multiple
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
                        {savingDetailNote ? 'Guardando...' : '💾 Guardar'}
                      </button>
                    </div>
                  </form>
                </div>
                {detailNotes.length === 0
                  ? <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa' }}>No hay notas aún.</div>
                  : detailNotes.map(n => (
                    <div key={n.id} style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>
                        {new Date(n.created_at).toLocaleString('es-PR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {n.photo_urls && n.photo_urls.length > 1 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: n.photo_urls.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }}>
                          {n.photo_urls.map((url, idx) => {
                            const isVideo = /\.(mp4|mov|webm|avi)(\?|$)/i.test(url);
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
                        return isVideo ? (
                          <video src={n.photo_url} controls style={{ width: '100%', maxHeight: 250, borderRadius: 10, marginBottom: 8, background: '#000' }} />
                        ) : (
                          <img src={n.photo_url} onClick={() => setLightbox({ urls: [n.photo_url], index: 0, noteId: n.id })}
                            style={{ width: '100%', maxHeight: 250, objectFit: 'cover', borderRadius: 10, marginBottom: 8, cursor: 'zoom-in' }} />
                        );
                      })()}
                      {n.note && <p style={{ fontSize: 14, margin: 0 }}>{n.note}</p>}
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
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontSize: 28, borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', zIndex: 2 }}>×</button>

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
      <button style={{ position: 'fixed', bottom: 80, right: 20, width: 52, height: 52, background: showFab ? '#333' : ORANGE, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(224,92,42,0.4)', zIndex: 99, fontSize: 24, color: '#fff' }} onClick={() => setShowFab(!showFab)}>
        {showFab ? '✕' : '+'}
      </button>

      {showFab && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 97 }} onClick={() => setShowFab(false)} />
          <div style={{ position: 'fixed', bottom: 140, right: 20, zIndex: 98, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
            <button style={fmi('#2a4cb5')} onClick={() => { setShowJobNote(true); setShowFab(false); }}>📝 Agregar nota</button>
            <button style={fmi('#27ae60')} onClick={() => { setShowJobPhoto(true); setShowFab(false); }}>📸 Agregar foto</button>
            <button style={fmi(ORANGE)} onClick={() => { setShowJobClock(true); setShowFab(false); }}>⏱ Clock In a trabajo</button>
          </div>
        </>
      )}

      {showJobClock && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }} onClick={() => setShowJobClock(false)}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: 430 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16 }}>⏱ Clock In a trabajo</div>
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
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16 }}>📝 Agregar nota</div>
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
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16 }}>📸 Agregar foto</div>
            {photoSuccess ? <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 18, color: '#27ae60', fontWeight: 700 }}>{photoSuccess} ✅</div>
              : !fabSelectedJob
                ? <>{<p style={{ color: '#888', marginBottom: 12 }}>Selecciona el trabajo:</p>}{allJobs.map(j => <div key={j.id} onClick={() => setFabSelectedJob(j)} style={{ padding: '12px 0', borderBottom: '1px solid #eee', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}><div><div style={{ fontWeight: 600 }}>{j.title}</div><div style={{ fontSize: 13, color: '#888' }}>{j.clients?.name}</div></div><span style={{ color: ORANGE }}>→</span></div>)}</>
                : <div>
                  <div style={{ fontWeight: 600, marginBottom: 16, color: ORANGE }}>{fabSelectedJob.title}</div>
                  <input ref={fileRef} type="file" accept="image/*,video/*" onChange={uploadFabPhoto} style={{ display: 'none' }} />
                  <button onClick={() => fileRef.current?.click()} disabled={uploadingPhoto} style={{ width: '100%', padding: 16, background: '#f0f0f0', border: '2px dashed #dde1e7', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', color: '#555' }}>
                    {uploadingPhoto ? '📤 Subiendo...' : '📷 Tomar foto o elegir de galería'}
                  </button>
                  <button onClick={() => { setFabSelectedJob(null); setShowJobPhoto(false); }} style={{ marginTop: 10, width: '100%', padding: 12, background: 'none', border: 'none', color: '#888', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                </div>
            }
          </div>
        </div>
      )}

      <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: '#fff', borderTop: '1px solid #dde1e7', display: 'flex', zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom,4px)' }}>
        <NavI tab="home" icon="🏠" label="Home" />
        <NavI tab="jobs" icon="📋" label="Jobs" />
        <NavI tab="time" icon="⏱" label="Time" />
        <NavI tab="calendar" icon="📅" label="Calendar" />
        <NavI tab="projects" icon="⊞" label="Projects" />
      </nav>
    </div>
  );
}
