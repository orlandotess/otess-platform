'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function AcceptEstimateButton({ estimateId, status }) {
  const t = useTranslations('estimados.acceptButton');
  const [current, setCurrent] = useState(status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function accept() {
    if (!confirm(t('confirmAccept'))) return;
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
      else setError(data.error || t('genericError'));
    } catch {
      setError(t('genericError'));
    }
    setLoading(false);
  }

  if (current === 'accepted' || current === 'converted') {
    return (
      <div style={{ background: '#eefbf3', border: '1px solid #b7ecc9', borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>✅</span>
        <span style={{ color: '#1a7a44', fontWeight: 600, fontSize: 14 }}>{t('acceptedMessage')}</span>
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
        {loading ? t('processing') : `✅ ${t('acceptButton')}`}
      </button>
      {error && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 8 }}>{error}</p>}
    </div>
  );
}
