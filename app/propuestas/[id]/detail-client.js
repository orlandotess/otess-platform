'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

const STATUS_COLORS = { borrador: '#888', enviada: '#2a4cb5', vista: '#e0972c', aprobada: '#27ae60', rechazada: '#c0392b' };
const STATUS_LABELS = { borrador: 'Borrador', enviada: 'Enviada', vista: 'Vista', aprobada: 'Aprobada', rechazada: 'Rechazada' };

function financialBreakdown(opt, clientType, taxRules) {
  let parts = 0, labor = 0, taxParts = 0, taxLabor = 0;
  (opt.items ?? []).forEach(it => {
    const base = (it.quantity || 0) * (it.unit_price || 0);
    const lineType = it.item_type === 'product' ? 'product' : 'labor';
    const rule = taxRules.find(r => r.client_type === clientType && r.line_item_type === lineType);
    const rate = rule?.rate ?? 0.115;
    if (lineType === 'product') { parts += base; taxParts += base * rate; }
    else { labor += base; taxLabor += base * rate; }
  });
  return { parts, labor, taxParts, taxLabor, subtotal: parts + labor, tax: taxParts + taxLabor, total: parts + labor + taxParts + taxLabor };
}

export default function PropuestaDetailClient({ proposal, options, taxRules, payments }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(proposal.status);

  const fmt = n => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const optionTotal = opt => (opt.items ?? []).reduce((sum, it) => sum + (it.quantity || 0) * (it.unit_price || 0), 0);

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/propuesta/${proposal.public_token}`
    : '';

  async function handleSend() {
    setSending(true);
    await supabase.from('proposals').update({ status: 'enviada', sent_at: new Date().toISOString() }).eq('id', proposal.id);
    setStatus('enviada');
    setSending(false);
    router.refresh();
  }

  function copyLink() {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{proposal.title}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {proposal.proposal_number} · {proposal.clients?.name}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span className="badge" style={{ color: STATUS_COLORS[status] ?? '#888' }}>
            {STATUS_LABELS[status] ?? status}
          </span>
          {status === 'borrador' && (
            <button className="btn btn-primary" disabled={sending} onClick={handleSend}>
              {sending ? 'Enviando...' : 'Enviar propuesta'}
            </button>
          )}
        </div>
      </div>

      {status !== 'borrador' && (
        <div className="card" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Link público</div>
            <div style={{ fontSize: 13, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{publicUrl}</div>
          </div>
          <button className="btn btn-ghost" onClick={copyLink}>{copied ? 'Copiado' : 'Copiar link'}</button>
        </div>
      )}

      {proposal.intro_note && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Nota para el cliente</p>
          <p style={{ fontSize: 14, margin: 0 }}>{proposal.intro_note}</p>
        </div>
      )}

      {proposal.requires_signature && (
        <div style={{ border: '1px solid var(--border)', borderLeft: '3px solid var(--amber)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--navy)' }}>
          Esta propuesta requiere firma del cliente para aprobarse.
        </div>
      )}

      {proposal.status === 'aprobada' && proposal.signed_name && (
        <div style={{ border: '1px solid var(--border)', borderLeft: '3px solid #27ae60', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#1a7a3d' }}>
          Firmada por <strong>{proposal.signed_name}</strong> el {new Date(proposal.signed_at).toLocaleString('es-PR')}
        </div>
      )}

      <div style={{ display: 'grid', gap: 20 }}>
        {options.map(opt => (
          <div key={opt.id} className="card" style={{ border: opt.is_recommended ? '1.5px solid var(--navy)' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{opt.name}</span>
                {opt.is_recommended && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--amber)' }}>RECOMENDADA</span>}
                {proposal.approved_option_id === opt.id && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#27ae60' }}>ELEGIDA POR CLIENTE</span>}
              </div>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>{fmt(optionTotal(opt))}</span>
            </div>
            {opt.description && <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>{opt.description}</p>}

            {Object.entries(
              (opt.items ?? []).reduce((groups, it) => {
                const area = it.area || 'General';
                (groups[area] = groups[area] || []).push(it);
                return groups;
              }, {})
            ).map(([areaName, areaItems]) => (
              <div key={areaName} style={{ marginBottom: 12 }}>
                {areaName !== 'General' && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6, marginTop: 8 }}>{areaName}</div>
                )}
                {areaItems.map(it => {
                  const margin = (it.unit_price || 0) - (it.supplier_price || 0);
                  return (
                    <div key={it.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                      <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 8, background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {it.photo_signed_url ? (
                          <img src={it.photo_signed_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        ) : (
                          <span style={{ fontSize: 20, color: 'var(--muted)' }}>{it.item_type === 'product' ? '📦' : '🔧'}</span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>
                          {it.description}
                          <span style={{ fontSize: 10, fontWeight: 700, color: it.item_type === 'product' ? '#2a4cb5' : '#888', marginLeft: 8, textTransform: 'uppercase' }}>
                            {it.item_type === 'product' ? 'Producto' : 'Labor'}
                          </span>
                        </div>
                        {it.supplier_price != null && (
                          <div style={{ fontSize: 11, color: '#c0392b', marginTop: 2 }}>
                            Costo suplidor: {fmt(it.supplier_price)} <span style={{ color: '#27ae60', marginLeft: 8 }}>Margen: {fmt(margin)}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, width: 90 }}>
                        {it.msrp != null && <div style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'line-through' }}>msrp {fmt(it.msrp)}</div>}
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(it.unit_price)}</div>
                      </div>
                      <div style={{ width: 40, textAlign: 'center', fontWeight: 600, fontSize: 14, flexShrink: 0 }}>{it.quantity}</div>
                      <div style={{ textAlign: 'right', flexShrink: 0, width: 90 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{fmt(it.quantity * it.unit_price)}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>Combinado</div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 12.5, fontWeight: 700, color: 'var(--navy)', paddingTop: 6 }}>
                  {areaName} Total: {fmt(areaItems.reduce((s, it) => s + it.quantity * it.unit_price, 0))}
                </div>
              </div>
            ))}

            {(() => {
              const fb = financialBreakdown(opt, proposal.tax_client_type ?? proposal.clients?.client_type ?? 'final', taxRules ?? []);
              return (
                <div className="total-line" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'grid', gap: 6 }}>
                  <div className="total-line"><span>Total Parts</span><span>{fmt(fb.parts)}</span></div>
                  <div className="total-line"><span>Total Labor</span><span>{fmt(fb.labor)}</span></div>
                  <div className="total-line" style={{ fontWeight: 700, color: 'var(--text)' }}><span style={{ color: 'var(--text)' }}>Subtotal</span><span>{fmt(fb.subtotal)}</span></div>
                  <div className="total-line">
                    <span>IVU {(proposal.tax_client_type ?? proposal.clients?.client_type) === 'b2b' ? '(Parts 11.5% · Labor 4%)' : '(11.5%)'}</span>
                    <span>{fmt(fb.tax)}</span>
                  </div>
                  <div className="total-final"><span>Total</span><span>{fmt(fb.total)}</span></div>
                </div>
              );
            })()}
          </div>
        ))}
      </div>

      {payments && payments.length > 0 && (() => {
        const mainOpt = options.find(o => proposal.approved_option_id === o.id) ?? options.find(o => o.is_recommended) ?? options[0];
        const fb = financialBreakdown(mainOpt, proposal.tax_client_type ?? proposal.clients?.client_type ?? 'final', taxRules ?? []);
        const basisAmount = { parts: fb.parts, labor: fb.labor, subtotal: fb.subtotal };
        return (
          <div className="card" style={{ marginTop: 20 }}>
            <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', marginBottom: 14 }}>Payment Schedule</p>
            {payments.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{p.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.percent}% de {p.basis === 'parts' ? 'Parts' : p.basis === 'labor' ? 'Labor' : 'Subtotal'}{p.due_trigger ? ` · ${p.due_trigger}` : ''}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{fmt((basisAmount[p.basis] ?? 0) * (p.percent / 100))}</div>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
