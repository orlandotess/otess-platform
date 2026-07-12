'use client';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('Email o contrasena incorrectos');
      setLoading(false);
      return;
    }
    window.location.href = '/';
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--navy)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'var(--surface)', borderRadius:20, padding:40, width:'100%', maxWidth:400 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:32, fontWeight:900, color:'var(--navy)' }}>OTESS</div>
          <div style={{ fontSize:13, color:'var(--ink-faint)', marginTop:4 }}>OT Electrical and Security Solutions</div>
          <div style={{ fontSize:14, color:'var(--ink-soft)', marginTop:16 }}>Acceso a la plataforma</div>
        </div>
        <form onSubmit={handleLogin}>
          {error && <div style={{ background:'var(--danger-tint)', color:'var(--warn)', padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:16 }}>{error}</div>}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12, fontWeight:700, color:'var(--ink-faint)', display:'block', marginBottom:6 }}>EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" required style={{ padding:'10px 14px', border:'1.5px solid var(--border)', borderRadius:8, fontSize:14, width:'100%', outline:'none' }} />
          </div>
          <div style={{ marginBottom:24 }}>
            <label style={{ fontSize:12, fontWeight:700, color:'var(--ink-faint)', display:'block', marginBottom:6 }}>CONTRASENA</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="..." required style={{ padding:'10px 14px', border:'1.5px solid var(--border)', borderRadius:8, fontSize:14, width:'100%', outline:'none' }} />
          </div>
          <button type="submit" disabled={loading} style={{ width:'100%', padding:13, background:'var(--navy)', color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:700, cursor:'pointer' }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
