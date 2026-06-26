'use client';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
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
      setError('Email o contraseña incorrectos');
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#16223d',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 20,
        padding: 40,
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#16223d', letterSpacing: -1 }}>OTESS</div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>OT Electrical & Security Solutions</div>
          <div style={{ fontSize: 14, color: '#555', marginTop: 16, fontWeight: 500 }}>Acceso a la plataforma</div>
        </div>

        <form onSubmit={handleLogin}>
          {error && (
            <div style={{ background: '#fdecea', color: '#b52a2a', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              autoFocus
            />
          </div>

          <div className="form-group" style={{ marginBottom: 24 }}>
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '13px',
              background: '#16223d',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
