'use client';
import { useState } from 'react';

const NAVY = '#16223d';
const AMBER = '#e0972c';

function financialBreakdown(opt, clientType, taxRules) {
  let parts = 0, labor = 0, taxParts = 0, taxLabor = 0;
  (opt.items ?? []).forEach(it => {
    const base = (it.quantity || 0) * (it.unit_price || 0);
    const lineType = it.item_type === 'product' ? 'product' : 'labor';
    const rule = (taxRules ?? []).find(r => r.client_type === clientType && r.line_item_type === lineType);
    const rate = rule?.rate ?? 0.115;
    if (lineType === 'product') { parts += base; taxParts += base * rate; }
    else { labor += base; taxLabor += base * rate; }
  });
  return { parts, labor, tax: taxParts + taxLabor, subtotal: parts + labor, total: parts + labor + taxParts + taxLabor };
}

export default function PropuestaPublicClient({ proposal, options, coverPhotoUrl, taxRules, payments }) {
  const [selectedId, setSelectedId] = useState(
    options.find(o => o.is_recommended)?.id ?? options[0]?.id ?? null
  );
  const [signedName, setSignedName] = useState('');
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(proposal.status === 'aprobada');
  const [error, setError] = useState('');

  const clientType = proposal.tax_client_type ?? proposal.clients?.client_type ?? 'final';
  const fmt = n => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const optionTotal = opt => financialBreakdown(opt, clientType, taxRules).total;

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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', fontFamily: '-apple-system,sans-serif', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, maxWidth: 420, textAlign: 'center', border: '1px solid #eee' }}>
          <div style={{ fontSize: 32, marginBottom: 12, color: '#27ae60' }}>✓</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Propuesta aprobada</div>
          <p style={{ fontSize: 14, color: '#888' }}>Gracias — nos pondremos en contacto para coordinar los próximos pasos.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: '-apple-system,sans-serif' }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #eee', background: '#fff' }}>
        <img src="/otess-logo.png" alt="OTESS" style={{ height: 26 }} />
      </div>

      {coverPhotoUrl && (
        <div style={{ width: '100%', height: 220, overflow: 'hidden', position: 'relative' }}>
          <img src={coverPhotoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}

      <div style={{ padding: '32px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: '#999', fontWeight: 600, letterSpacing: '0.03em' }}>{proposal.proposal_number}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: NAVY, marginTop: 6, letterSpacing: '-0.3px' }}>{proposal.title}</div>
          <div style={{ fontSize: 14, color: '#999', marginTop: 4 }}>Para {proposal.clients?.name}</div>
        </div>

        {proposal.intro_note && (
          <div style={{ background: '#fff', borderRadius: 10, padding: 20, marginBottom: 20, border: '1px solid #eee' }}>
            <p style={{ fontSize: 14, margin: 0, color: '#444', lineHeight: 1.6 }}>{proposal.intro_note}</p>
          </div>
        )}

        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: options.length > 1 ? `repeat(${Math.min(options.length, 3)}, 1fr)` : '1fr', marginBottom: 20 }}>
          {options.map(opt => {
            const isSelected = selectedId === opt.id;
            return (
              <div key={opt.id} onClick={() => setSelectedId(opt.id)}
                style={{
                  background: '#fff', borderRadius: 10, padding: 20, cursor: 'pointer',
                  border: isSelected ? `1.5px solid ${NAVY}` : '1.5px solid #eee',
                  transition: 'border-color 0.15s', position: 'relative',
                }}>
                {opt.is_recommended && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: AMBER, letterSpacing: '0.05em', marginBottom: 6 }}>
                    RECOMENDADA
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{opt.name}</span>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: isSelected ? `5px solid ${NAVY}` : '1.5px solid #ddd', flexShrink: 0 }} />
                </div>
                {opt.description && <p style={{ fontSize: 12.5, color: '#999', marginBottom: 10 }}>{opt.description}</p>}
                <div style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 12 }}>{fmt(optionTotal(opt))}</div>
                <div style={{ display: 'grid', gap: 16 }}>
                  {Object.entries(
                    (opt.items ?? []).reduce((groups, it) => {
                      const area = it.area || 'General';
                      (groups[area] = groups[area] || []).push(it);
                      return groups;
                    }, {})
                  ).map(([areaName, areaItems]) => {
                    const areaTotal = areaItems.reduce((s, it) => s + (it.quantity || 0) * (it.unit_price || 0), 0);
                    return (
                      <div key={areaName}>
                        {areaName !== 'General' && (
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: NAVY, marginBottom: 8 }}>{areaName}</div>
                        )}
                        <div style={{ display: 'flex', fontSize: 10, fontWeight: 600, color: '#bbb', textTransform: 'uppercase', paddingBottom: 6, borderBottom: '1px solid #f0f0f0', marginBottom: 8 }}>
                          <span style={{ flex: 1 }}>Items</span>
                          <span style={{ width: 60, textAlign: 'right' }}>Precio</span>
                          <span style={{ width: 30, textAlign: 'center' }}>Cant</span>
                          <span style={{ width: 70, textAlign: 'right' }}>Total</span>
                        </div>
                        <div style={{ display: 'grid', gap: 10 }}>
                          {areaItems.map(it => (
                            <div key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                              <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 6, background: '#f6f6f6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                {it.photo_signed_url ? (
                                  <img src={it.photo_signed_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                ) : (
                                  <span style={{ fontSize: 13 }}>{it.item_type === 'product' ? '📦' : '🔧'}</span>
                                )}
                              </div>
                              <span style={{ fontSize: 12.5, color: '#555', flex: 1 }}>{it.description}</span>
                              <span style={{ width: 60, textAlign: 'right', fontSize: 12, color: '#999' }}>{fmt(it.unit_price)}</span>
                              <span style={{ width: 30, textAlign: 'center', fontSize: 12, color: '#999' }}>x{it.quantity}</span>
                              <span style={{ width: 70, textAlign: 'right', fontSize: 13, fontWeight: 600, color: NAVY }}>{fmt(it.quantity * it.unit_price)}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f0f0', fontSize: 12.5, fontWeight: 700, color: NAVY }}>
                          {areaName} Total: {fmt(areaTotal)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {selectedId && (() => {
          const opt = options.find(o => o.id === selectedId);
          if (!opt) return null;
          const fb = financialBreakdown(opt, clientType, taxRules);
          return (
            <div style={{ background: '#fff', borderRadius: 10, padding: 24, marginBottom: 14, border: '1px solid #eee' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Resumen — {opt.name}</div>
              <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#999' }}>Subtotal</span><span>{fmt(fb.subtotal)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#999' }}>IVU</span><span>{fmt(fb.tax)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 17, color: NAVY, marginTop: 6, paddingTop: 10, borderTop: '1px solid #eee' }}>
                  <span>Total</span><span>{fmt(fb.total)}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {selectedId && payments && payments.length > 0 && (() => {
          const opt = options.find(o => o.id === selectedId);
          if (!opt) return null;
          const fb = financialBreakdown(opt, clientType, taxRules);
          const basisAmount = { parts: fb.parts, labor: fb.labor, subtotal: fb.subtotal };
          return (
            <div style={{ background: '#fff', borderRadius: 10, padding: 24, marginBottom: 14, border: '1px solid #eee' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Payment Schedule</div>
              {payments.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f4f4f4' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.label}</div>
                    <div style={{ fontSize: 11.5, color: '#999' }}>{p.percent}% de {p.basis === 'parts' ? 'Parts' : p.basis === 'labor' ? 'Labor' : 'Subtotal'}{p.due_trigger ? ` · ${p.due_trigger}` : ''}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>{fmt((basisAmount[p.basis] ?? 0) * (p.percent / 100))}</div>
                </div>
              ))}
            </div>
          );
        })()}

        <div style={{ background: '#fff', borderRadius: 10, padding: 24, border: '1px solid #eee' }}>
          {proposal.requires_signature && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Firma (escribe tu nombre completo)</label>
              <input value={signedName} onChange={e => setSignedName(e.target.value)} placeholder="Nombre completo"
                style={{ width: '100%', padding: '12px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 16, fontFamily: 'cursive', marginTop: 6 }} />
            </div>
          )}
          {error && <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 10 }}>{error}</p>}
          <button onClick={handleApprove} disabled={!canApprove || approving}
            style={{ width: '100%', padding: 15, background: canApprove ? NAVY : '#ddd', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: canApprove ? 'pointer' : 'default' }}>
            {approving ? 'Procesando...' : 'Aprobar propuesta'}
          </button>
        </div>

        {(proposal.terms || proposal.valid_until) && (
          <div style={{ marginTop: 20, padding: '0 4px' }}>
            {proposal.valid_until && (
              <p style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>
                Esta propuesta es válida hasta el {new Date(proposal.valid_until + 'T00:00:00').toLocaleDateString('es-PR', { year: 'numeric', month: 'long', day: 'numeric' })}.
              </p>
            )}
            {proposal.terms && (
              <p style={{ fontSize: 11.5, color: '#bbb', lineHeight: 1.6 }}>{proposal.terms}</p>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
