'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';

const DEFAULT_ABOUT_US = `Somos especialistas en la integración de tecnología para crear espacios inteligentes, seguros y eficientes. Nos dedicamos al diseño, instalación y automatización de sistemas de audio, video, iluminación, cableado estructurado, redes y seguridad, brindando así soluciones personalizadas para hogares, oficinas y negocios.

En OTESS transformamos el entorno en un espacio moderno, funcional y seguro.`;

export default function EmpresaClient({ settings }) {
  const router = useRouter();
  const [aboutUs, setAboutUs] = useState(settings?.about_us ?? DEFAULT_ABOUT_US);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setSaved(false);
    if (settings?.id) {
      await supabase.from('company_settings').update({ about_us: aboutUs, updated_at: new Date().toISOString() }).eq('id', settings.id);
    } else {
      await supabase.from('company_settings').insert([{ about_us: aboutUs }]);
    }
    setSaving(false);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 6 }}>Sobre nosotros</p>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
        Este texto aparece en la página "About Us" de las propuestas enviadas a clientes.
      </p>
      <form onSubmit={handleSave}>
        <div className="form-group" style={{ marginBottom: 20 }}>
          <textarea value={aboutUs} onChange={e => setAboutUs(e.target.value)} rows={10} style={{ fontSize: 13.5, lineHeight: 1.7, width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          {saved && <span style={{ color: '#27ae60', fontSize: 13, fontWeight: 600 }}>✓ Guardado</span>}
        </div>
      </form>
    </div>
  );
}
