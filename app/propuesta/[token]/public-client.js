'use client';
import { useState } from 'react';

const NAVY = '#16223d';
const AMBER = '#e0972c';

export default function PropuestaPublicClient({ proposal, options }) {
  const [selectedId, setSelectedId] = useState(
    options.find(o => o.is_recommended)?.id ?? options[0]?.id ?? null
  );
  const [signedName, setSignedName] = useState('');
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(proposal.status === 'aprobada');
  const [error, setError] = useState('');

  const fmt = n => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const optionTotal = opt => (opt.items ?? []).reduce((sum, it) => sum + (it.quantity || 0) * (it.unit_price || 0), 0);

  const canApprove = selectedId && (!proposal.requires_signature || signedName.trim().length > 1);

  async function handleApprove() {
    if (!canApprove) return;
    setApproving(true); setError('');
    const res = await fetch('/api/propuestas/aprobar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: proposal.public_token,
        option_id: selectedId,
        signed_name: proposal.requires_signature ? signedName.trim() : null,
      }),
    });
    setApproving(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? 'Error al aprobar');
      return;
    }
    setApproved(true);
  }

  if (approved) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f6f9', fontFamily: '-apple-system,sans-serif', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 40, maxWidth: 420, textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Propuesta aprobada</div>
          <p style={{ fontSize: 14, color: '#666' }}>Gracias — nos pondremos en contacto para coordinar los próximos pasos.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f9', fontFamily: '-apple-system,sans-serif', padding: '32px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: '#888', fontWeight: 600 }}>{proposal.proposal_number}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: NAVY, marginTop: 4 }}>{proposal.title}</div>
          <div style={{ fontSize: 14, color: '#888', marginTop: 4 }}>Para {proposal.clients?.name}</div>
        </div>

        {proposal.intro_note && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: 14, margin: 0, color: '#333', lineHeight: 1.6 }}>{proposal.intro_note}</p>
          </div>
        )}

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: options.length > 1 ? `repeat(${Math.min(options.length, 3)}, 1fr)` : '1fr', marginBottom: 24 }}>
          {options.map(opt => {
            const isSelected = selectedId === opt.id;
            return (
              <div key={opt.id} onClick={() => setSelectedId(opt.id)}
                style={{
                  background: '#fff', borderRadius: 14, padding: 20, cursor: 'pointer',
                  border: isSelected ? `2.5px solid ${AMBER}` : '2.5px solid transparent',
                  boxShadow: isSelected ? '0 4px 16px rgba(224,151,44,0.25)' : '0 1px 4px rgba(0,0,0,0.06)',
                  transition: 'all 0.15s', position: 'relative',
                }}>
                {opt.is_recommended && (
                  <div style={{ position: 'absolute', top: -10, left: 16, background: AMBER, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10 }}>
                    RECOMENDADA
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, marginTop: opt.is_recommended ? 6 : 0 }}>
                  <span style={{ fontWeight: 800, fontSize: 16, color: NAVY }}>{opt.name}</span>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: isSelected ? `6px solid ${AMBER}` : '2px solid #ddd', flexShrink: 0 }} />
                </div>
                {opt.description && <p style={{ fontSize: 12.5, color: '#888', marginBottom: 10 }}>{opt.description}</p>}
                <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 12 }}>{fmt(optionTotal(opt))}</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {(opt.items ?? []).map(it => (
                    <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {it.photo_signed_url && <img src={it.photo_signed_url} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />}
                      <span style={{ fontSize: 12.5, color: '#555' }}>{it.quantity > 1 ? `${it.quantity}× ` : ''}{it.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {proposal.requires_signature && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Firma (escribe tu nombre completo)</label>
              <input value={signedName} onChange={e => setSignedName(e.target.value)} placeholder="Nombre completo"
                style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #ddd', borderRadius: 8, fontSize: 16, fontFamily: 'cursive', marginTop: 6 }} />
            </div>
          )}
          {error && <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 10 }}>{error}</p>}
          <button onClick={handleApprove} disabled={!canApprove || approving}
            style={{ width: '100%', padding: 16, background: canApprove ? '#27ae60' : '#ccc', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: canApprove ? 'pointer' : 'default' }}>
            {approving ? 'Procesando...' : '✓ Aprobar propuesta'}
          </button>
        </div>
      </div>
    </div>
  );
}
