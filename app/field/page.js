'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

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
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  // Get technician
  useEffect(() => {
    supabase.from('technicians').select('id').eq('username', 'OTESS').single()
      .then(({ data }) => { if (data) setTechId(data.id); });
  }, []);

  // Check active clock-in
  useEffect(() => {
    if (!techId) return;
    supabase.from('time_entries')
      .select('*').eq('technician_id', techId).is('clocked_out_at', null)
      .order('clocked_in_at', { ascending: false }).limit(1).single()
      .then(({ data }) => {
        if (data) { setClockedIn(true); setActiveEntry(data); }
        setLoading(false);
      });
  }, [techId]);

  // Elapsed timer
  useEffect(() => {
    if (!clockedIn || !activeEntry) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(activeEntry.clocked_in_at)) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [clockedIn, activeEntry]);

  // Load jobs
  useEffect(() => {
    loadJobs();
  }, [jobFilter]);

  // Load time entries for week
  useEffect(() => {
    if (!techId) return;
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0,0,0,0);
    supabase.from('time_entries').select('*')
      .eq('technician_id', techId)
      .gte('clocked_in_at', weekStart.toISOString())
      .order('clocked_in_at', { ascending: false })
      .then(({ data }) => setTimeEntries(data ?? []));
  }, [techId, clockedIn]);

  async function loadJobs() {
    setLoading(true);
    let q = supabase.from('jobs').select('id, title, status, scheduled_start, clients(name)');
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    if (jobFilter === 'today') {
      q = q.gte('scheduled_start', today.toISOString()).lt('scheduled_start', tomorrow.toISOString());
    } else if (jobFilter === 'upcoming') {
      q = q.gte('scheduled_start', tomorrow.toISOString()).not('status', 'eq', 'completed');
    } else if (jobFilter === 'done') {
      q = q.eq('status', 'completed');
    }
    const { data } = await q.order('scheduled_start', { ascending: true }).limit(20);
    setJobs(data ?? []);
    setLoading(false);
  }

  async function handleClockIn() {
    if (!techId) return;
    const { data } = await supabase.from('time_entries')
      .insert([{ technician_id: techId, clocked_in_at: new Date().toISOString() }])
      .select().single();
    if (data) { setClockedIn(true); setActiveEntry(data); setElapsed(0); }
  }

  async function handleClockOut() {
    if (!activeEntry) return;
    await supabase.from('time_entries')
      .update({ clocked_out_at: new Date().toISOString() })
      .eq('id', activeEntry.id);
    setClockedIn(false); setActiveEntry(null); setElapsed(0);
  }

  const fmtElapsed = s => {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const fmtHours = entries => {
    const total = entries.reduce((acc, e) => {
      if (!e.clocked_out_at) return acc;
      return acc + (new Date(e.clocked_out_at) - new Date(e.clocked_in_at));
    }, 0);
    const h = total / 3600000;
    return `${h.toFixed(1)}h`;
  };

  const now = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const statusColor = { estimate: '#888', scheduled: '#2a4cb5', in_progress: ORANGE, completed: '#27ae60', cancelled: '#b52a2a' };
  const statusLabel = { estimate: 'Estimate', scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Done', cancelled: 'Cancelled' };

  const dayShort = ['Wed','Thu','Fri','Sat','Sun','Mon','Tue'];
  const weekDates = dayShort.map((_, i) => {
    const d = new Date(now);
    const offset = now.getDay() === 0 ? -4 : now.getDay() >= 3 ? now.getDay() - 3 : now.getDay() + 4;
    d.setDate(now.getDate() - offset + i);
    return d.getDate();
  });

  const s = {
    shell: { position:'fixed', top:0, left:0, right:0, bottom:0, background:BG, fontFamily:'-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif', display:'flex', flexDirection:'column', maxWidth:430, margin:'0 auto' },
    page: { flex:1, overflowY:'auto', paddingBottom:80 },
    nav: { position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:430, background:'#fff', borderTop:'1px solid #dde1e7', display:'flex', zIndex:100, paddingBottom:'env(safe-area-inset-bottom,4px)' },
    navBtn: (active) => ({ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, padding:'10px 0 6px', background:'none', border:'none', cursor:'pointer', fontSize:10, fontWeight:600, color: active ? ORANGE : '#aaa' }),
    card: { margin:'0 14px 12px', background:'#fff', borderRadius:14, padding:'16px 18px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' },
    clockBtn: (on) => ({ background: on ? '#27ae60' : ORANGE, color:'#fff', border:'none', borderRadius:10, padding:'10px 20px', fontSize:14, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
    filterTab: (active) => ({ padding:'8px 16px', borderRadius:50, fontSize:13, fontWeight:600, cursor:'pointer', border: active ? 'none' : '1.5px solid #dde1e7', background: active ? '#1a1a1a' : '#fff', color: active ? '#fff' : '#333' }),
    fab: { position:'fixed', bottom:80, right:20, width:52, height:52, background:ORANGE, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', border:'none', cursor:'pointer', boxShadow:'0 4px 16px rgba(224,92,42,0.4)', zIndex:99, fontSize:24, color:'#fff' },
  };

  const NavIcon = ({ tab: t, icon, label }) => (
    <button style={s.navBtn(tab === t)} onClick={() => setTab(t)}>
      <span style={{ fontSize:22 }}>{icon}</span>
      {label}
    </button>
  );

  return (
    <div style={s.shell}>
      <div style={s.page}>

        {/* ── HOME ── */}
        {tab === 'home' && (
          <div>
            <div style={{ padding:'20px 20px 8px', display:'flex', justifyContent:'flex-end' }}>
              <span style={{ fontSize:11, fontWeight:600, color:'#888', letterSpacing:'0.08em', textTransform:'uppercase' }}>
                {days[now.getDay()].toUpperCase()}, {months[now.getMonth()]} {now.getDate()}
              </span>
            </div>
            <div style={{ padding:'0 20px 20px' }}>
              <div style={{ fontSize:27, fontWeight:700 }}>{greeting}, OTESS</div>
            </div>

            <div style={s.card}>
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:40, height:40, background:BG, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>⏱</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:15 }}>{clockedIn ? 'Clocked in' : 'Not clocked in'}</div>
                  <div style={{ fontSize:12, color:'#888', marginTop:2 }}>
                    {clockedIn ? fmtElapsed(elapsed) : 'Tap to start your shift'}
                  </div>
                </div>
                <button style={s.clockBtn(clockedIn)} onClick={clockedIn ? handleClockOut : handleClockIn}>
                  {clockedIn ? 'Clock Out' : 'Clock In'}
                </button>
              </div>
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 20px 12px' }}>
              <span style={{ fontSize:17, fontWeight:700 }}>Today's schedule</span>
              <span style={{ fontSize:14, fontWeight:600, color:ORANGE, cursor:'pointer' }} onClick={() => setTab('jobs')}>View all</span>
            </div>
            <div style={s.card}>
              {jobs.length === 0
                ? <div style={{ textAlign:'center', padding:'24px 0', color:'#888', fontSize:15 }}>No jobs scheduled today.</div>
                : jobs.slice(0,3).map(j => (
                  <div key={j.id} style={{ padding:'10px 0', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:14 }}>{j.title}</div>
                      <div style={{ fontSize:12, color:'#888' }}>{j.clients?.name}</div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color: statusColor[j.status], background:`${statusColor[j.status]}18`, padding:'3px 8px', borderRadius:20 }}>
                      {statusLabel[j.status]}
                    </span>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ── JOBS ── */}
        {tab === 'jobs' && (
          <div>
            <div style={{ padding:'20px 20px 16px' }}>
              <div style={{ fontSize:26, fontWeight:700, marginBottom:14 }}>Jobs</div>
              <div style={{ background:'#fff', borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:10, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', marginBottom:14 }}>
                <span style={{ fontSize:16 }}>🔍</span>
                <input placeholder="Search jobs or customer..." style={{ border:'none', background:'none', fontSize:15, outline:'none', width:'100%' }} />
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {['today','upcoming','done','all'].map(f => (
                  <button key={f} style={s.filterTab(jobFilter === f)} onClick={() => { setJobFilter(f); loadJobs(); }}>
                    {f === 'today' ? 'Today' : f === 'upcoming' ? 'Upcoming' : f === 'done' ? 'Done' : 'All'}
                  </button>
                ))}
              </div>
            </div>
            <div style={s.card}>
              {loading
                ? <div style={{ textAlign:'center', padding:'32px 0', color:'#888' }}>Loading...</div>
                : jobs.length === 0
                  ? <div style={{ textAlign:'center', padding:'32px 0', color:'#888', fontSize:15 }}>No jobs here.</div>
                  : jobs.map(j => (
                    <div key={j.id} style={{ padding:'12px 0', borderBottom:'1px solid #eee' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:15 }}>{j.title}</div>
                          <div style={{ fontSize:13, color:'#888', marginTop:2 }}>{j.clients?.name}</div>
                          {j.scheduled_start && (
                            <div style={{ fontSize:12, color:'#aaa', marginTop:3 }}>
                              📅 {new Date(j.scheduled_start).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:statusColor[j.status], background:`${statusColor[j.status]}18`, padding:'4px 10px', borderRadius:20, marginLeft:10, whiteSpace:'nowrap' }}>
                          {statusLabel[j.status]}
                        </span>
                      </div>
                    </div>
                  ))
              }
            </div>
          </div>
        )}

        {/* ── TIME ── */}
        {tab === 'time' && (
          <div>
            <div style={{ padding:'20px 20px 8px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:20, fontWeight:700 }}>My Timesheet</div>
                <div style={{ fontSize:12, color:'#888', marginTop:2 }}>
                  Week of {months[now.getMonth()]} {now.getDate()}, {now.getFullYear()}
                </div>
              </div>
              <span style={{ fontSize:13, fontWeight:700, color:ORANGE }}>Pending</span>
            </div>

            <div style={s.card}>
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:40, height:40, background:BG, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>⏱</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:15 }}>{clockedIn ? 'Clocked in' : 'Not clocked in'}</div>
                  <div style={{ fontSize:12, color:'#888' }}>{clockedIn ? fmtElapsed(elapsed) : `${fmtHours(timeEntries)} logged this week`}</div>
                </div>
                <button style={{ ...s.clockBtn(clockedIn), background: clockedIn ? '#27ae60' : '#f5ddd3', color: clockedIn ? '#fff' : '#c04a1a' }}
                  onClick={clockedIn ? handleClockOut : handleClockIn}>
                  {clockedIn ? 'Clock Out' : 'Clock In'}
                </button>
              </div>
            </div>

            {/* Week days */}
            <div style={{ ...s.card, display:'flex', justifyContent:'space-between' }}>
              {dayShort.map((d, i) => (
                <div key={d} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                  <div style={{ fontSize:11, color:'#888', fontWeight:500 }}>{d}</div>
                  <div style={{ fontSize:13, color:'#ccc' }}>—</div>
                  <div style={{ fontSize:12, color:'#aaa' }}>{weekDates[i]}</div>
                </div>
              ))}
            </div>

            {/* Hours summary */}
            <div style={s.card}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
                <span style={{ color:'#888', fontSize:14 }}>Hours this week</span>
                <span style={{ fontWeight:700 }}>{fmtHours(timeEntries)}</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ border:'1.5px solid #1abc9c', borderRadius:12, padding:14 }}>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', color:'#1abc9c', marginBottom:6 }}>REGULAR</div>
                  <div style={{ fontSize:26, fontWeight:700, color:'#1abc9c' }}>{fmtHours(timeEntries)}</div>
                  <div style={{ fontSize:11, color:'#aaa', marginTop:4 }}>of 40h</div>
                </div>
                <div style={{ border:'1.5px solid #dde1e7', borderRadius:12, padding:14 }}>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', color:'#aaa', marginBottom:6 }}>OVERTIME</div>
                  <div style={{ fontSize:26, fontWeight:700, color:'#ccc' }}>0.0h</div>
                  <div style={{ fontSize:11, color:'#ccc', marginTop:4 }}>—</div>
                </div>
              </div>
            </div>

            {/* Recent entries */}
            {timeEntries.length > 0 && (
              <div style={s.card}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:12, display:'flex', gap:8, alignItems:'center' }}>
                  <span style={{ color:ORANGE }}>⏱</span> Hours Detail
                </div>
                {timeEntries.slice(0,5).map(e => {
                  const inTime = new Date(e.clocked_in_at);
                  const outTime = e.clocked_out_at ? new Date(e.clocked_out_at) : null;
                  const duration = outTime ? ((outTime - inTime) / 3600000).toFixed(1) + 'h' : 'Active';
                  return (
                    <div key={e.id} style={{ padding:'10px 0', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600 }}>
                          {inTime.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
                        </div>
                        <div style={{ fontSize:12, color:'#aaa' }}>
                          {inTime.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' })}
                          {outTime ? ` → ${outTime.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' })}` : ' → Now'}
                        </div>
                      </div>
                      <span style={{ fontWeight:700, color: duration === 'Active' ? '#27ae60' : 'var(--text)', fontSize:14 }}>{duration}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── CALENDAR ── */}
        {tab === 'calendar' && (
          <div>
            <div style={{ padding:'20px 20px 16px' }}>
              <div style={{ fontSize:26, fontWeight:700 }}>Calendar</div>
            </div>
            <div style={{ ...s.card, textAlign:'center', padding:'60px 20px', color:'#aaa' }}>
              <div style={{ fontSize:48, marginBottom:12 }}>📅</div>
              <div style={{ fontSize:15 }}>No events scheduled</div>
            </div>
          </div>
        )}

        {/* ── PROJECTS ── */}
        {tab === 'projects' && (
          <div>
            <div style={{ padding:'20px 20px 16px' }}>
              <div style={{ fontSize:26, fontWeight:700 }}>Projects</div>
            </div>
            <div style={{ ...s.card, textAlign:'center', padding:'60px 20px', color:'#aaa' }}>
              <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
              <div style={{ fontSize:15 }}>No projects yet</div>
            </div>
          </div>
        )}

      </div>

      {/* FAB */}
      <button style={s.fab}>+</button>

      {/* Bottom Nav */}
      <nav style={s.nav}>
        <NavIcon tab="home" icon="🏠" label="Home" />
        <NavIcon tab="jobs" icon="📋" label="Jobs" />
        <NavIcon tab="time" icon="⏱" label="Time" />
        <NavIcon tab="calendar" icon="📅" label="Calendar" />
        <NavIcon tab="projects" icon="⊞" label="Projects" />
      </nav>
    </div>
  );
}
