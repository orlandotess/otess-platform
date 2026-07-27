'use client';
import { useState } from 'react';

export default function AcceptEstimateButton({ estimateId, status }) {
  const [current, setCurrent] = useState(status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function accept() {
    if (!confirm('¿Confirmas que aceptas este estimado?')) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/accept-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimateId }),
      });
      const data = await res.json();
      if (data.success) setCurrent('accepted');
      else setError(data.error || 'No se pudo procesar la aceptación');
    } catch {
      setError('No se pudo procesar la aceptación');
    }
    setLoading(false);
  }

  if (current === 'accepted' || current === 'converted') {
    return (
      <div style={{ background: '#eefbf3', border: '1px solid #b7ecc9', borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>✅</span>
        <span style={{ color: '#1a7a44', fontWeight: 600, fontSize: 14 }}>Estimado aceptado. Nuestro equipo se pondrá en contacto para coordinar.</span>
      </div>
    );
  }

  if (current !== 'sent') return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={accept}
        disabled={loading}
        style={{ background: '#e0972c', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 32px', fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer', width: '100%' }}
      >
        {loading ? 'Procesando...' : '✅ Aceptar este estimado'}
      </button>
      {error && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 8 }}>{error}</p>}
    </div>
  );
}
