'use client';
import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--navy)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'var(--surface)', borderRadius:20, padding:40, width:'100%', maxWidth:400 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <img src="/otess-logo.png" alt="OTESS" className="brand-logo-light" style={{ width:'100%', maxWidth:220, height:'auto', margin:'0 auto', display:'block' }} />
          <img src="/otess-logo-blanco.png" alt="OTESS" className="brand-logo-dark" style={{ width:'100%', maxWidth:220, height:'auto', margin:'0 auto', display:'block' }} />
          <div style={{ fontSize:14, color:'var(--ink-soft)', marginTop:16 }}>Recuperar contraseña</div>
        </div>

        {sent ? (
          <div style={{ textAlign:'center' }}>
            <p style={{ fontSize:14, color:'var(--ink-soft)' }}>Si el correo está registrado, recibirás un enlace para restablecer tu contraseña en unos minutos.</p>
            <a href="/login" style={{ fontSize:13, color:'var(--amber)' }}>Volver a iniciar sesión</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div style={{ background:'var(--danger-tint)', color:'var(--warn)', padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:16 }}>{error}</div>}
            <div style={{ marginBottom:24 }}>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--ink-faint)', display:'block', marginBottom:6 }}>EMAIL</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" required style={{ padding:'10px 14px', border:'1.5px solid var(--border)', borderRadius:8, fontSize:14, width:'100%', outline:'none' }} />
            </div>
            <button type="submit" disabled={loading} style={{ width:'100%', padding:13, background:'var(--navy)', color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:700, cursor:'pointer' }}>
              {loading ? 'Enviando...' : 'Enviar enlace'}
            </button>
            <div style={{ textAlign:'center', marginTop:16 }}>
              <a href="/login" style={{ fontSize:13, color:'var(--ink-faint)' }}>Volver a iniciar sesión</a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
