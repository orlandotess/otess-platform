'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations('auth.login');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [languageLoading, setLanguageLoading] = useState(false);

  async function toggleLanguage() {
    setLanguageLoading(true);
    const nextLocale = locale === 'es' ? 'en' : 'es';
    await fetch('/api/set-locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: nextLocale }),
    }).catch(() => {});
    router.refresh();
    setLanguageLoading(false);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('errorDefault'));
        setLoading(false);
        return;
      }
      window.location.href = data.needsVerification ? '/verify-code' : '/';
    } catch {
      setError(t('errorConnection'));
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--navy)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'var(--surface)', borderRadius:20, padding:40, width:'100%', maxWidth:400 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <img src="/otess-logo.png" alt="OTESS" className="brand-logo-light" style={{ width:'100%', maxWidth:220, height:'auto', margin:'0 auto', display:'block' }} />
          <img src="/otess-logo-blanco.png" alt="OTESS" className="brand-logo-dark" style={{ width:'100%', maxWidth:220, height:'auto', margin:'0 auto', display:'block' }} />
          <div style={{ fontSize:13, color:'var(--ink-faint)', marginTop:10 }}>OT Electrical and Security Solutions</div>
          <div style={{ fontSize:14, color:'var(--ink-soft)', marginTop:16 }}>{t('accessTitle')}</div>
        </div>
        <form onSubmit={handleLogin}>
          {error && <div style={{ background:'var(--danger-tint)', color:'var(--warn)', padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:16 }}>{error}</div>}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12, fontWeight:700, color:'var(--ink-faint)', display:'block', marginBottom:6 }}>{t('emailLabel')}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" required style={{ padding:'10px 14px', border:'1.5px solid var(--border)', borderRadius:8, fontSize:14, width:'100%', outline:'none' }} />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, fontWeight:700, color:'var(--ink-faint)', display:'block', marginBottom:6 }}>{t('passwordLabel')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="..." required style={{ padding:'10px 14px', border:'1.5px solid var(--border)', borderRadius:8, fontSize:14, width:'100%', outline:'none' }} />
          </div>
          <div style={{ textAlign:'right', marginBottom:24 }}>
            <a href="/forgot-password" style={{ fontSize:13, color:'var(--ink-faint)' }}>{t('forgotPassword')}</a>
          </div>
          <button type="submit" disabled={loading} style={{ width:'100%', padding:13, background:'var(--navy)', color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:700, cursor:'pointer' }}>
            {loading ? t('entering') : t('enter')}
          </button>
        </form>
        <div style={{ textAlign:'center', marginTop:20 }}>
          <button
            type="button"
            onClick={toggleLanguage}
            disabled={languageLoading}
            style={{ background:'none', border:'none', color:'var(--ink-faint)', fontSize:12, cursor: languageLoading ? 'default' : 'pointer', textDecoration:'underline', opacity: languageLoading ? 0.6 : 1 }}
          >
            {locale === 'es' ? 'English' : 'Español'}
          </button>
        </div>
      </div>
    </div>
  );
}
