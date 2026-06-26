'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://zisidorwdhrttmdppnbj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inppc2lkb3J3ZGhydHRtZHBwbmJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MzA3NDEsImV4cCI6MjA5ODAwNjc0MX0.dKCf0omLnIy3AILNaU8vWj_yrMlJM-Fh9sOui71a7Po'
);

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
  const [showJobClock, setShowJobClock] = useState(false);
  const [showJobNote, setShowJobNote] = useState(false);
  const [showJobPhoto, setShowJobPhoto] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoSuccess, setPhotoSuccess] = useState('');
  const [allJobs, setAllJobs] = useState([]);
  const fileRef = useRef();

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
    supabase.from('jobs').select('id, title, status, clients(name)')
      .in('status', ['scheduled', 'in_progress'])
      .order('scheduled_start', { ascending: true }).limit(20)
      .then(({ data }) => setAllJobs(data ?? []));
  }, []);

  useEffect(() => {
    if (!techId) return;
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0,0,0,0);
    supabase.from('time_entries').select('*').eq('technician_id', techId)
      .gte('clocked_in_at', weekStart.toISOString()).order('clocked_in_at', { ascending: false })
      .then(({ data }) => setTimeEntries(data ?? []));
  }, [techId, clockedIn]);

  async function loadJobs() {
    setLoading(true);
    let q = supabase.from('jobs').select('id, title, status, scheduled_start, clients(name)');
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    if (jobFilter === 'today') q = q.gte('scheduled_start', today.toISOString()).lt('scheduled_start', tomorrow.toISOString());
    else if (jobFilter === 'upcoming') q = q.gte('scheduled_start', tomorrow.toISOString()).not('status', 'eq', 'completed');
    else if (jobFilter === 'done') q = q.eq('status', 'completed');
    const { data } = await q.order('scheduled_start', { ascending: true }).limit(20);
    setJobs(data ?? []);
    setLoading(false);
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

  async function saveNote(e) {
    e.preventDefault();
    if (!selectedJob || !noteText.trim()) return;
    setSavingNote(true);
    await supabase.from('jobs').update({ notes: noteText }).eq('id', selectedJob.id);
    setSavingNote(false); setNoteText(''); setShowJobNote(false); setShowFab(false); setSelectedJob(null);
  }

  async function uploadPhoto(e) {
    const file = e.target.files?.[0];
    if (!file || !selectedJob) return;
    setUploadingPhoto(true);
    const ext = file.name.split('.').pop();
    const path = selectedJob.id + '/' + Date.now() + '.' + ext;
    const { error } = await supabase.storage.from('job-photos').upload(path, file);
    setUploadingPhoto(false);
    if (!error) {
      setPhotoSuccess('Foto subida');
      setTimeout(() => { setPhotoSuccess(''); setShowJobPhoto(false); setShowFab(false); setSelectedJob(null); }, 2000);
    }
  }

  const fmtE = s => String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor((s%3600)/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
  const fmtH = es => (es.reduce((a,e) => a + (e.clocked_out_at ? new Date(e.clocked_out_at)-new Date(e.clocked_in_at) : 0), 0)/3600000).toFixed(1)+'h';
  const now = new Date();
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const greeting = now.getHours()<12?'Good morning':now.getHours()<18?'Good afternoon':'Good evening';
  const SC = { estimate:'#888', scheduled:'#2a4cb5', in_progress:ORANGE, completed:'#27ae60', cancelled:'#b52a2a' };
  const SL = { estimate:'Estimate', scheduled:'Scheduled', in_progress:'In Progress', completed:'Done', cancelled:'Cancelled' };
  const DSH = ['Wed','Thu','Fri','Sat','Sun','Mon','Tue'];
  const WD = DSH.map((_,i) => { const d=new Date(now); const off=now.getDay()===0?-4:now.getDay()>=3?now.getDay()-3:now.getDay()+4; d.setDate(now.getDate()-off+i); return d.getDate(); });
  const card = { margin:'0 14px 12px', background:'#fff', borderRadius:14, padding:'16px 18px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' };
  const navBtn = a => ({ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, padding:'10px 0 6px', background:'none', border:'none', cursor:'pointer', fontSize:10, fontWeight:600, color:a?ORANGE:'#aaa' });
  const ftab = a => ({ padding:'8px 16px', borderRadius:50, fontSize:13, fontWeight:600, cursor:'pointer', border:a?'none':'1.5px solid #dde1e7', background:a?'#1a1a1a':'#fff', color:a?'#fff':'#333' });
  const fmi = c => ({ background:c||ORANGE, color:'#fff', border:'none', borderRadius:50, padding:'10px 18px', fontSize:14, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.2)', whiteSpace:'nowrap' });
  const NavI = ({ tab:t, icon, label }) => <button style={navBtn(tab===t)} onClick={()=>{setTab(t);setShowFab(false);}}><span style={{fontSize:22}}>{icon}</span>{label}</button>;
  const JobList = ({ list, onSelect }) => list.map(j => (
    <div key={j.id} onClick={()=>onSelect(j)} style={{padding:'12px 0',borderBottom:'1px solid #eee',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div><div style={{fontWeight:600}}>{j.title}</div><div style={{fontSize:13,color:'#888'}}>{j.clients?.name}</div></div>
      <span style={{color:ORANGE,fontWeight:700}}>→</span>
    </div>
  ));

  return (
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:BG,fontFamily:'-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif',display:'flex',flexDirection:'column',maxWidth:430,margin:'0 auto'}}>
      <div style={{flex:1,overflowY:'auto',paddingBottom:80}}>

        {tab==='home' && <div>
          <div style={{padding:'20px 20px 8px',display:'flex',justifyContent:'flex-end'}}>
            <span style={{fontSize:11,fontWeight:600,color:'#888',letterSpacing:'0.08em',textTransform:'uppercase'}}>{DAYS[now.getDay()].toUpperCase()}, {MON[now.getMonth()]} {now.getDate()}</span>
          </div>
          <div style={{padding:'0 20px 20px'}}><div style={{fontSize:27,fontWeight:700}}>{greeting}, {techName}</div></div>
          <div style={card}>
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              <div style={{width:40,height:40,background:BG,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>⏱</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:15}}>{clockedIn?'Clocked in':'Not clocked in'}</div>
                <div style={{fontSize:12,color:'#888'}}>{clockedIn?fmtE(elapsed):'Tap to start your shift'}</div>
              </div>
              <button style={{background:clockedIn?'#27ae60':ORANGE,color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:700,cursor:'pointer'}} onClick={clockedIn?handleClockOut:()=>handleClockIn()}>
                {clockedIn?'Clock Out':'Clock In'}
              </button>
            </div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 20px 12px'}}>
            <span style={{fontSize:17,fontWeight:700}}>Today's schedule</span>
            <span style={{fontSize:14,fontWeight:600,color:ORANGE,cursor:'pointer'}} onClick={()=>setTab('jobs')}>View all</span>
          </div>
          <div style={card}>
            {jobs.length===0?<div style={{textAlign:'center',padding:'24px 0',color:'#888'}}>No jobs scheduled today.</div>
            :jobs.slice(0,3).map(j=>(
              <div key={j.id} style={{padding:'10px 0',borderBottom:'1px solid #eee',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div><div style={{fontWeight:600,fontSize:14}}>{j.title}</div><div style={{fontSize:12,color:'#888'}}>{j.clients?.name}</div></div>
                <span style={{fontSize:11,fontWeight:700,color:SC[j.status],background:SC[j.status]+'18',padding:'3px 8px',borderRadius:20}}>{SL[j.status]}</span>
              </div>
            ))}
          </div>
        </div>}

        {tab==='jobs' && <div>
          <div style={{padding:'20px 20px 16px'}}>
            <div style={{fontSize:26,fontWeight:700,marginBottom:14}}>Jobs</div>
            <div style={{background:'#fff',borderRadius:12,padding:'12px 16px',display:'flex',alignItems:'center',gap:10,boxShadow:'0 1px 4px rgba(0,0,0,0.06)',marginBottom:14}}>
              <span>🔍</span><input placeholder="Search jobs or customer..." style={{border:'none',background:'none',fontSize:15,outline:'none',width:'100%'}} />
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {['today','upcoming','done','all'].map(f=>(
                <button key={f} style={ftab(jobFilter===f)} onClick={()=>{setJobFilter(f);loadJobs();}}>
                  {f==='today'?'Today':f==='upcoming'?'Upcoming':f==='done'?'Done':'All'}
                </button>
              ))}
            </div>
          </div>
          <div style={card}>
            {loading?<div style={{textAlign:'center',padding:'32px 0',color:'#888'}}>Loading...</div>
            :jobs.length===0?<div style={{textAlign:'center',padding:'32px 0',color:'#888'}}>No jobs here.</div>
            :jobs.map(j=>(
              <div key={j.id} style={{padding:'12px 0',borderBottom:'1px solid #eee',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:15}}>{j.title}</div>
                  <div style={{fontSize:13,color:'#888'}}>{j.clients?.name}</div>
                  {j.scheduled_start&&<div style={{fontSize:12,color:'#aaa'}}>📅 {new Date(j.scheduled_start).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div>}
                </div>
                <span style={{fontSize:11,fontWeight:700,color:SC[j.status],background:SC[j.status]+'18',padding:'4px 10px',borderRadius:20,marginLeft:10}}>{SL[j.status]}</span>
              </div>
            ))}
          </div>
        </div>}

        {tab==='time' && <div>
          <div style={{padding:'20px 20px 8px',display:'flex',justifyContent:'space-between'}}>
            <div><div style={{fontSize:20,fontWeight:700}}>My Timesheet</div><div style={{fontSize:12,color:'#888'}}>{MON[now.getMonth()]} {now.getDate()}, {now.getFullYear()}</div></div>
            <span style={{fontSize:13,fontWeight:700,color:ORANGE}}>Pending</span>
          </div>
          <div style={card}>
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              <div style={{width:40,height:40,background:BG,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>⏱</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600}}>{clockedIn?'Clocked in':'Not clocked in'}</div>
                <div style={{fontSize:12,color:'#888'}}>{clockedIn?fmtE(elapsed):fmtH(timeEntries)+' logged this week'}</div>
              </div>
              <button style={{background:clockedIn?'#27ae60':'#f5ddd3',color:clockedIn?'#fff':'#c04a1a',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:700,cursor:'pointer'}} onClick={clockedIn?handleClockOut:()=>handleClockIn()}>
                {clockedIn?'Clock Out':'Clock In'}
              </button>
            </div>
          </div>
          <div style={{...card,display:'flex',justifyContent:'space-between'}}>
            {DSH.map((d,i)=><div key={d} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}><div style={{fontSize:11,color:'#888'}}>{d}</div><div style={{fontSize:13,color:'#ccc'}}>—</div><div style={{fontSize:12,color:'#aaa'}}>{WD[i]}</div></div>)}
          </div>
          <div style={card}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}><span style={{color:'#888'}}>Hours this week</span><span style={{fontWeight:700}}>{fmtH(timeEntries)}</span></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={{border:'1.5px solid #1abc9c',borderRadius:12,padding:14}}><div style={{fontSize:10,fontWeight:700,color:'#1abc9c',marginBottom:6}}>REGULAR</div><div style={{fontSize:26,fontWeight:700,color:'#1abc9c'}}>{fmtH(timeEntries)}</div></div>
              <div style={{border:'1.5px solid #dde1e7',borderRadius:12,padding:14}}><div style={{fontSize:10,fontWeight:700,color:'#aaa',marginBottom:6}}>OVERTIME</div><div style={{fontSize:26,fontWeight:700,color:'#ccc'}}>0.0h</div></div>
            </div>
          </div>
        </div>}

        {tab==='calendar' && <div>
          <div style={{padding:'20px 20px 16px'}}><div style={{fontSize:26,fontWeight:700}}>Calendar</div></div>
          <div style={{...card,textAlign:'center',padding:'60px 20px',color:'#aaa'}}><div style={{fontSize:48,marginBottom:12}}>📅</div><div>No events scheduled</div></div>
        </div>}

        {tab==='projects' && <div>
          <div style={{padding:'20px 20px 16px'}}><div style={{fontSize:26,fontWeight:700}}>Projects</div></div>
          {allJobs.length===0?<div style={{...card,textAlign:'center',padding:'60px 20px',color:'#aaa'}}><div style={{fontSize:48,marginBottom:12}}>📋</div><div>No active projects</div></div>
          :allJobs.map(j=><div key={j.id} style={card}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div><div style={{fontWeight:700}}>{j.title}</div><div style={{fontSize:13,color:'#888'}}>{j.clients?.name}</div></div>
            <span style={{fontSize:11,fontWeight:700,color:SC[j.status],background:SC[j.status]+'18',padding:'4px 10px',borderRadius:20}}>{SL[j.status]}</span>
          </div></div>)}
        </div>}

      </div>

      <button style={{position:'fixed',bottom:80,right:20,width:52,height:52,background:showFab?'#333':ORANGE,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',border:'none',cursor:'pointer',boxShadow:'0 4px 16px rgba(224,92,42,0.4)',zIndex:99,fontSize:24,color:'#fff'}} onClick={()=>setShowFab(!showFab)}>
        {showFab?'✕':'+'}
      </button>

      {showFab && <>
        <div style={{position:'fixed',inset:0,zIndex:97}} onClick={()=>setShowFab(false)} />
        <div style={{position:'fixed',bottom:140,right:20,zIndex:98,display:'flex',flexDirection:'column',gap:10,alignItems:'flex-end'}}>
          <button style={fmi('#2a4cb5')} onClick={()=>{setShowJobNote(true);setShowFab(false);}}>📝 Agregar nota</button>
          <button style={fmi('#27ae60')} onClick={()=>{setShowJobPhoto(true);setShowFab(false);}}>📸 Agregar foto</button>
          <button style={fmi(ORANGE)} onClick={()=>{setShowJobClock(true);setShowFab(false);}}>⏱ Clock In a trabajo</button>
        </div>
      </>}

      {showJobClock && <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}} onClick={()=>setShowJobClock(false)}>
        <div style={{background:'#fff',borderRadius:'20px 20px 0 0',padding:'24px 20px',width:'100%',maxWidth:430}} onClick={e=>e.stopPropagation()}>
          <div style={{fontWeight:800,fontSize:18,marginBottom:16}}>⏱ Clock In a trabajo</div>
          {allJobs.length===0?<p style={{color:'#888'}}>No hay trabajos activos.</p>:<JobList list={allJobs} onSelect={j=>handleClockIn(j.id)} />}
          <button onClick={()=>setShowJobClock(false)} style={{marginTop:16,width:'100%',padding:12,background:'#f0f0f0',border:'none',borderRadius:10,fontWeight:600,cursor:'pointer'}}>Cancelar</button>
        </div>
      </div>}

      {showJobNote && <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}} onClick={()=>{setShowJobNote(false);setSelectedJob(null);}}>
        <div style={{background:'#fff',borderRadius:'20px 20px 0 0',padding:'24px 20px',width:'100%',maxWidth:430}} onClick={e=>e.stopPropagation()}>
          <div style={{fontWeight:800,fontSize:18,marginBottom:16}}>📝 Agregar nota</div>
          {!selectedJob?<><p style={{color:'#888',marginBottom:12}}>Selecciona el trabajo:</p><JobList list={allJobs} onSelect={setSelectedJob} /></>
          :<form onSubmit={saveNote}>
            <div style={{fontWeight:600,marginBottom:12,color:ORANGE}}>{selectedJob.title}</div>
            <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Escribe tu nota..." style={{width:'100%',minHeight:120,padding:12,border:'1.5px solid #dde1e7',borderRadius:10,fontSize:14,fontFamily:'inherit',outline:'none',resize:'none'}} />
            <div style={{display:'flex',gap:10,marginTop:12}}>
              <button type="submit" disabled={savingNote} style={{flex:1,padding:12,background:ORANGE,color:'#fff',border:'none',borderRadius:10,fontWeight:700,cursor:'pointer'}}>{savingNote?'Guardando...':'Guardar nota'}</button>
              <button type="button" onClick={()=>{setSelectedJob(null);setShowJobNote(false);}} style={{padding:12,background:'#f0f0f0',border:'none',borderRadius:10,fontWeight:600,cursor:'pointer'}}>Cancelar</button>
            </div>
          </form>}
        </div>
      </div>}

      {showJobPhoto && <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}} onClick={()=>{setShowJobPhoto(false);setSelectedJob(null);}}>
        <div style={{background:'#fff',borderRadius:'20px 20px 0 0',padding:'24px 20px',width:'100%',maxWidth:430}} onClick={e=>e.stopPropagation()}>
          <div style={{fontWeight:800,fontSize:18,marginBottom:16}}>📸 Agregar foto</div>
          {photoSuccess?<div style={{textAlign:'center',padding:'24px 0',fontSize:18,color:'#27ae60',fontWeight:700}}>{photoSuccess} ✅</div>
          :!selectedJob?<><p style={{color:'#888',marginBottom:12}}>Selecciona el trabajo:</p><JobList list={allJobs} onSelect={setSelectedJob} /></>
          :<div>
            <div style={{fontWeight:600,marginBottom:16,color:ORANGE}}>{selectedJob.title}</div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={uploadPhoto} style={{display:'none'}} />
            <button onClick={()=>fileRef.current?.click()} disabled={uploadingPhoto} style={{width:'100%',padding:16,background:'#f0f0f0',border:'2px dashed #dde1e7',borderRadius:12,fontSize:15,fontWeight:600,cursor:'pointer',color:'#555'}}>
              {uploadingPhoto?'📤 Subiendo...':'📷 Tomar foto o elegir de galería'}
            </button>
            <button onClick={()=>{setSelectedJob(null);setShowJobPhoto(false);}} style={{marginTop:12,width:'100%',padding:12,background:'none',border:'none',color:'#888',fontWeight:600,cursor:'pointer'}}>Cancelar</button>
          </div>}
        </div>
      </div>}

      <nav style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:430,background:'#fff',borderTop:'1px solid #dde1e7',display:'flex',zIndex:100,paddingBottom:'env(safe-area-inset-bottom,4px)'}}>
        <NavI tab="home" icon="🏠" label="Home" />
        <NavI tab="jobs" icon="📋" label="Jobs" />
        <NavI tab="time" icon="⏱" label="Time" />
        <NavI tab="calendar" icon="📅" label="Calendar" />
        <NavI tab="projects" icon="⊞" label="Projects" />
      </nav>
    </div>
  );
}
