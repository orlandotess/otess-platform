'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

const COOLDOWN_SECONDS = 60;

export default function VerifyCodePage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const sentOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (!data?.user) {
        window.location.href = '/login';
        return;
      }
      if (!sentOnce.current) {
        sentOnce.current = true;
        sendCode();
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function sendCode() {
    setError('');
    try {
      const res = await fetch('/api/send-verification-code', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo enviar el código');
        return;
      }
      setInfo('Te enviamos un código de 6 dígitos por correo.');
      setCooldown(COOLDOWN_SECONDS);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Código incorrecto');
        setLoading(false);
        return;
      }
      window.location.href = '/';
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--navy)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'var(--surface)', borderRadius:20, padding:40, width:'100%', maxWidth:400 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <img src="/otess-logo.png" alt="OTESS" className="brand-logo-light" style={{ width:'100%', maxWidth:220, height:'auto', margin:'0 auto', display:'block' }} />
          <img src="/otess-logo-blanco.png" alt="OTESS" className="brand-logo-dark" style={{ width:'100%', maxWidth:220, height:'auto', margin:'0 auto', display:'block' }} />
          <div style={{ fontSize:14, color:'var(--ink-soft)', marginTop:16 }}>Verificación en dos pasos</div>
        </div>
        <form onSubmit={handleVerify}>
          {error && <div style={{ background:'var(--danger-tint)', color:'var(--warn)', padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:16 }}>{error}</div>}
          {!error && info && <div style={{ background:'var(--ok-tint)', color:'var(--ink-soft)', padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:16 }}>{info}</div>}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12, fontWeight:700, color:'var(--ink-faint)', display:'block', marginBottom:6 }}>CÓDIGO DE 6 DÍGITOS</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              required
              autoFocus
              style={{ padding:'10px 14px', border:'1.5px solid var(--border)', borderRadius:8, fontSize:22, letterSpacing:8, textAlign:'center', width:'100%', outline:'none' }}
            />
          </div>
          <button type="submit" disabled={loading || code.length !== 6} style={{ width:'100%', padding:13, background:'var(--navy)', color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:16 }}>
            {loading ? 'Verificando...' : 'Verificar'}
          </button>
          <div style={{ textAlign:'center' }}>
            <button
              type="button"
              onClick={sendCode}
              disabled={cooldown > 0}
              style={{ background:'none', border:'none', color: cooldown > 0 ? 'var(--ink-faint)' : 'var(--warn)', fontSize:13, cursor: cooldown > 0 ? 'default' : 'pointer' }}
            >
              {cooldown > 0 ? `Reenviar código (${cooldown}s)` : 'Reenviar código'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
