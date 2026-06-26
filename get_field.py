import base64

# New field app with job detail view
code = open('app/field/page.js').read()

# Add selectedJob state and job detail view
old = "const [allJobs, setAllJobs] = useState([]);"
new = """const [allJobs, setAllJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobNotes, setJobNotes] = useState([]);
  const [jobChecklist, setJobChecklist] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileRef2 = useRef();"""

code = code.replace(old, new, 1)

# Make jobs clickable
old = "allJobs.map(j=><div key={j.id} style={card}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>"
new = "allJobs.map(j=><div key={j.id} style={{...card,cursor:'pointer'}} onClick={()=>openJob(j)}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>"
code = code.replace(old, new, 1)

# Make job list in Jobs tab clickable too
old = "jobs.map(j=>(\n                    <div key={j.id} style={{padding:'12px 0',borderBottom:'1px solid #eee',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>"
new = "jobs.map(j=>(\n                    <div key={j.id} style={{padding:'12px 0',borderBottom:'1px solid #eee',display:'flex',justifyContent:'space-between',alignItems:'flex-start',cursor:'pointer'}} onClick={()=>openJob(j)}>"
code = code.replace(old, new, 1)

open('app/field/page.js', 'w').write(code)
print('Replacements done, length:', len(code))

