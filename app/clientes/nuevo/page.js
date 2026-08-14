'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Sidebar from '../../Sidebar';
import { useTranslations } from 'next-intl';

export default function NuevoCliente() {
  const t = useTranslations('clientes.newClient');
  const router = useRouter();
  const [kind, setKind] = useState('individual'); // 'individual' | 'empresa'
  const [form, setForm] = useState({
    name: '', client_type: 'final', email: '', phone: '', company: '', notes: '',
  });
  const [addr, setAddr] = useState({ line1: '', line2: '', city: '', zip: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setA = (k, v) => setAddr(a => ({ ...a, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    const isEmpresa = kind === 'empresa';
    if (isEmpresa && !form.company.trim()) { setError(t('errors.companyRequired')); return; }
    if (!isEmpresa && !form.name.trim()) { setError(t('errors.nameRequired')); return; }
    setSaving(true);
    setError('');
    const payload = isEmpresa
      ? { ...form, name: form.company.trim(), report_name_source: 'company' }
      : form;
    const { data: client, error: err } = await supabase
      .from('clients').insert([payload]).select().single();
    if (err) { setError(err.message); setSaving(false); return; }
    if (addr.line1.trim()) {
      await supabase.from('client_addresses').insert([{
        client_id: client.id, ...addr, is_primary: true,
      }]);
    }
    router.push('/clientes');
  }

  return (
    <div className="admin-shell ds-clientes">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">{t('title')}</div>
        </div>
        <div className="card" style={{ maxWidth: 640 }}>
          <form onSubmit={handleSubmit}>
            {error && <p style={{ color: 'var(--warn)', marginBottom: 16, fontSize: 14 }}>{error}</p>}

            <div className="form-group">
              <label>{t('kindLabel')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setKind('individual')}
                  style={{ flex: 1, fontSize: 13, fontWeight: 700, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: kind === 'individual' ? '1.5px solid var(--navy)' : '1.5px solid var(--border)', background: kind === 'individual' ? 'var(--navy)' : 'transparent', color: kind === 'individual' ? '#fff' : 'var(--text)' }}>
                  {t('kindIndividual')}
                </button>
                <button type="button" onClick={() => setKind('empresa')}
                  style={{ flex: 1, fontSize: 13, fontWeight: 700, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: kind === 'empresa' ? '1.5px solid var(--navy)' : '1.5px solid var(--border)', background: kind === 'empresa' ? 'var(--navy)' : 'transparent', color: kind === 'empresa' ? '#fff' : 'var(--text)' }}>
                  {t('kindCompany')}
                </button>
              </div>
            </div>

            <div className="form-row">
              {kind === 'empresa' ? (
                <div className="form-group">
                  <label>{t('companyNameLabel')}</label>
                  <input value={form.company} onChange={e => set('company', e.target.value)} placeholder={t('companyNamePlaceholder')} />
                </div>
              ) : (
                <div className="form-group">
                  <label>{t('nameLabel')}</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)} placeholder={t('namePlaceholder')} />
                </div>
              )}
              <div className="form-group">
                <label>{t('clientTypeLabel')}</label>
                <select value={form.client_type} onChange={e => set('client_type', e.target.value)}>
                  <option value="final">{t('clientTypeFinal')}</option>
                  <option value="b2b">{t('clientTypeB2b')}</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>{t('phoneLabel')}</label>
                <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder={t('phonePlaceholder')} />
              </div>
              <div className="form-group">
                <label>{t('emailLabel')}</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder={t('emailPlaceholder')} />
              </div>
            </div>

            {kind === 'individual' && (
              <div className="form-group">
                <label>{t('businessLabel')}</label>
                <input value={form.company} onChange={e => set('company', e.target.value)} placeholder={t('businessPlaceholder')} />
              </div>
            )}

            <div className="form-group">
              <label>{t('notesLabel')}</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder={t('notesPlaceholder')} />
            </div>

            <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: '20px 0' }} />
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>{t('primaryAddress')}</p>

            <div className="form-group">
              <label>{t('addressLabel')}</label>
              <input value={addr.line1} onChange={e => setA('line1', e.target.value)} placeholder={t('addressPlaceholder')} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{t('cityLabel')}</label>
                <input value={addr.city} onChange={e => setA('city', e.target.value)} placeholder={t('cityPlaceholder')} />
              </div>
              <div className="form-group">
                <label>{t('zipLabel')}</label>
                <input value={addr.zip} onChange={e => setA('zip', e.target.value)} placeholder={t('zipPlaceholder')} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? t('saving') : t('saveClient')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => router.back()}>{t('cancel')}</button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
