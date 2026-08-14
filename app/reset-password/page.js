'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '../../lib/supabase';

export default function ResetPasswordPage() {
  const t = useTranslations('auth.resetPassword');
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setReady(true);
      else setError(t('errorInvalidLink'));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 6) { setError(t('errorMinLength')); return; }
    if (password !== confirm) { setError(t('errorMismatch')); return; }
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => { window.location.href = '/'; }, 1500);
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--navy)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'var(--surface)', borderRadius:20, padding:40, width:'100%', maxWidth:400 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <img src="/otess-logo.png" alt="OTESS" className="brand-logo-light" style={{ width:'100%', maxWidth:220, height:'auto', margin:'0 auto', display:'block' }} />
          <img src="/otess-logo-blanco.png" alt="OTESS" className="brand-logo-dark" style={{ width:'100%', maxWidth:220, height:'auto', margin:'0 auto', display:'block' }} />
          <div style={{ fontSize:14, color:'var(--ink-soft)', marginTop:16 }}>{t('title')}</div>
        </div>

        {error && <div style={{ background:'var(--danger-tint)', color:'var(--warn)', padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:16 }}>{error}</div>}

        {done ? (
          <p style={{ textAlign:'center', fontSize:14, color:'var(--ink-soft)' }}>{t('doneBody')}</p>
        ) : ready ? (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--ink-faint)', display:'block', marginBottom:6 }}>{t('newPasswordLabel')}</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={{ padding:'10px 14px', border:'1.5px solid var(--border)', borderRadius:8, fontSize:14, width:'100%', outline:'none' }} />
            </div>
            <div style={{ marginBottom:24 }}>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--ink-faint)', display:'block', marginBottom:6 }}>{t('confirmPasswordLabel')}</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required style={{ padding:'10px 14px', border:'1.5px solid var(--border)', borderRadius:8, fontSize:14, width:'100%', outline:'none' }} />
            </div>
            <button type="submit" disabled={loading} style={{ width:'100%', padding:13, background:'var(--navy)', color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:700, cursor:'pointer' }}>
              {loading ? t('saving') : t('saveButton')}
            </button>
          </form>
        ) : (
          <div style={{ textAlign:'center' }}>
            <a href="/forgot-password" style={{ fontSize:13, color:'var(--amber)' }}>{t('requestNewLink')}</a>
          </div>
        )}
      </div>
    </div>
  );
}
