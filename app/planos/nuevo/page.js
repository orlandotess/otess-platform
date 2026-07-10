'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { uploadFileWithProgress } from '../../../lib/uploadWithProgress';
import { rasterizePdfFirstPage } from '../../../lib/pdfRasterize';
import Sidebar from '../../Sidebar';
import ClientCombobox from '../../facturas/nueva/ClientCombobox';

export default function NuevoPlano() {
  const router = useRouter();
  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [jobId, setJobId] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('clients').select('id, name').order('name').then(({ data }) => setClients(data ?? []));
  }, []);

  useEffect(() => {
    if (!clientId) { setJobs([]); setJobId(''); return; }
    supabase.from('jobs').select('id, title').eq('client_id', clientId).order('title').then(({ data }) => setJobs(data ?? []));
  }, [clientId]);

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, ''));
    setFile(f);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !file) { setError('Nombre y archivo del plano son requeridos'); return; }
    setSaving(true); setError(''); setProgress(0);

    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const id = crypto.randomUUID();
      const sourceExt = file.name.split('.').pop();
      const sourcePath = `${id}/source.${sourceExt}`;
      const renderedPath = `${id}/rendered.png`;

      setStep(isPdf ? 'Procesando PDF...' : 'Subiendo plano...');
      let renderedBlob = file;
      let width = null, height = null;

      if (isPdf) {
        const result = await rasterizePdfFirstPage(file);
        renderedBlob = result.blob;
        width = result.width;
        height = result.height;
      } else {
        const dims = await new Promise(resolve => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.src = URL.createObjectURL(file);
        });
        width = dims.width; height = dims.height;
      }

      setStep('Subiendo archivo original...');
      const { error: srcErr } = await uploadFileWithProgress('floor-plans', sourcePath, file, setProgress);
      if (srcErr) { setError(srcErr.message); setSaving(false); return; }

      setStep('Subiendo imagen de trabajo...');
      const { error: renderErr } = await supabase.storage.from('floor-plans').upload(renderedPath, renderedBlob, { contentType: 'image/png' });
      if (renderErr) { setError(renderErr.message); setSaving(false); return; }

      setStep('Guardando...');
      const { data: plan, error: insertErr } = await supabase.from('floor_plans').insert([{
        name: name.trim(),
        client_id: clientId || null,
        job_id: jobId || null,
        source_type: isPdf ? 'pdf' : 'image',
        source_path: sourcePath,
        rendered_image_path: renderedPath,
        image_width: width,
        image_height: height,
      }]).select().single();

      if (insertErr) { setError(insertErr.message); setSaving(false); return; }
      router.push(`/planos/${plan.id}`);
    } catch (err) {
      setError(err.message || 'Ocurrió un error al subir el plano.');
      setSaving(false);
    }
  }

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Nuevo plano</div>
        </div>
        <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <p style={{ color: 'var(--warn)', fontSize: 14 }}>{error}</p>}

          <div className="form-group">
            <label>Nombre del plano *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Planta baja - Oficina Principal" />
          </div>

          <div className="form-group">
            <label>Cliente (opcional)</label>
            <ClientCombobox clients={clients} value={clientId} onChange={setClientId} />
          </div>

          {jobs.length > 0 && (
            <div className="form-group">
              <label>Trabajo (opcional)</label>
              <select value={jobId} onChange={e => setJobId(e.target.value)}>
                <option value="">— Sin asignar —</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>Archivo del plano * (imagen o PDF)</label>
            <input type="file" accept="image/*,application/pdf" onChange={handleFile} />
          </div>

          {saving && (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {step} {progress > 0 && progress < 100 ? `(${progress}%)` : ''}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
              {saving ? 'Subiendo...' : 'Crear plano'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => router.back()} style={{ justifyContent: 'center' }}>Cancelar</button>
          </div>
        </form>
      </main>
    </div>
  );
}
