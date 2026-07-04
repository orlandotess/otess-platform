'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

const STATUS_COLORS = { borrador: '#888', enviada: '#2a4cb5', vista: '#e0972c', aprobada: '#27ae60', rechazada: '#c0392b' };
const STATUS_LABELS = { borrador: 'Borrador', enviada: 'Enviada', vista: 'Vista', aprobada: 'Aprobada', rechazada: 'Rechazada' };

export default function PropuestaDetailClient({ proposal, options }) {
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLORS[status] ?? '#888', background: (STATUS_COLORS[status] ?? '#888') + '18', padding: '5px 14px', borderRadius: 20 }}>
            {STATUS_LABELS[status] ?? status}
          </span>
          {status === 'borrador' && (
            <button className="btn btn-primary" disabled={sending} onClick={handleSend}>
              {sending ? 'Enviando...' : '📤 Enviar propuesta'}
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
          <button className="btn btn-ghost" onClick={copyLink}>{copied ? '✓ Copiado' : '🔗 Copiar link'}</button>
        </div>
      )}

      {proposal.intro_note && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Nota para el cliente</p>
          <p style={{ fontSize: 14, margin: 0 }}>{proposal.intro_note}</p>
        </div>
      )}

      {proposal.requires_signature && (
        <div style={{ background: '#fff8ee', border: '1.5px solid var(--amber)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--navy)' }}>
          ✍️ Esta propuesta requiere firma del cliente para aprobarse.
        </div>
      )}

      {proposal.status === 'aprobada' && proposal.signed_name && (
        <div style={{ background: '#eafaf0', border: '1.5px solid #27ae60', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#1a7a3d' }}>
          ✓ Firmada por <strong>{proposal.signed_name}</strong> el {new Date(proposal.signed_at).toLocaleString('es-PR')}
        </div>
      )}

      <div style={{ display: 'grid', gap: 20 }}>
        {options.map(opt => (
          <div key={opt.id} className="card" style={{ border: opt.is_recommended ? '2px solid var(--amber)' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{opt.name}</span>
                {opt.is_recommended && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--amber)' }}>★ RECOMENDADA</span>}
                {proposal.approved_option_id === opt.id && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#27ae60' }}>✓ ELEGIDA POR CLIENTE</span>}
              </div>
              <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--navy)' }}>{fmt(optionTotal(opt))}</span>
            </div>
            {opt.description && <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>{opt.description}</p>}

            {(opt.items ?? []).map(it => (
              <div key={it.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                {it.photo_signed_url && (
                  <img src={it.photo_signed_url} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{it.description}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{it.quantity} × {fmt(it.unit_price)}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(it.quantity * it.unit_price)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
