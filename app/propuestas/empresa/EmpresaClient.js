'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function EmpresaClient({ settings }) {
  const router = useRouter();
  const t = useTranslations('propuestas.empresaClient');
  const [aboutUs, setAboutUs] = useState(settings?.about_us ?? t('defaultAboutUs'));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setSaved(false); setError(null);
    const { error: dbError } = settings?.id
      ? await supabase.from('company_settings').update({ about_us: aboutUs, updated_at: new Date().toISOString() }).eq('id', settings.id)
      : await supabase.from('company_settings').insert([{ about_us: aboutUs }]);
    setSaving(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 6 }}>{t('aboutUsLabel')}</p>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
        {t('aboutUsDescription')}
      </p>
      <form onSubmit={handleSave}>
        <div className="form-group" style={{ marginBottom: 20 }}>
          <textarea value={aboutUs} onChange={e => setAboutUs(e.target.value)} rows={10} style={{ fontSize: 13.5, lineHeight: 1.7, width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('saving') : t('save')}
          </button>
          {saved && <span style={{ color: 'var(--ok)', fontSize: 13, fontWeight: 600 }}>✓ {t('saved')}</span>}
          {error && <span style={{ color: 'var(--danger, #c0392b)', fontSize: 13, fontWeight: 600 }}>{t('errorWithMessage', { error })}</span>}
        </div>
      </form>
    </div>
  );
}
