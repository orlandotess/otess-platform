'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import ProposalDocument, { financialBreakdown } from '../ProposalDocument';

const STATUS_COLORS = { borrador: '#5b6473', enviada: '#2a4cb5', vista: '#e0972c', aprobada: '#1a7a4a', rechazada: '#b52a2a' };
const STATUS_LABELS = { borrador: 'Borrador', enviada: 'Enviada', vista: 'Vista', aprobada: 'Aprobada', rechazada: 'Rechazada' };

export default function PropuestaDetailClient({ proposal, options, taxRules, payments, companyInfo, primaryAddress }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(proposal.status);
  const [generatingPdf, setGeneratingPdf] = useState(null);

  async function handlePdf(optId) {
    setGeneratingPdf(optId);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const element = document.getElementById(`proposal-doc-${optId}`);
      const opt = {
        margin: 0,
        filename: `${proposal.proposal_number}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: 'css' },
      };
      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error('PDF error:', err);
    }
    setGeneratingPdf(null);
  }

  const fmt = n => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const clientType = proposal.tax_client_type ?? proposal.clients?.client_type ?? 'final';
  const optionTotal = opt => financialBreakdown(opt.items, clientType, taxRules ?? []).total;

  const [publicUrl, setPublicUrl] = useState('');

  useEffect(() => {
    setPublicUrl(`${window.location.origin}/propuesta/${proposal.public_token}`);
  }, [proposal.public_token]);

  async function handleSend() {
    setSending(true);
    try {
      const res = await fetch('/api/propuestas/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.id }),
      });
      const data = await res.json();
      if (data.error) { alert('Error: ' + data.error); return; }
      setStatus('enviada');
      if (data.warning) alert(data.warning);
      router.refresh();
    } catch (err) {
      alert('Error al enviar la propuesta: ' + err.message);
    } finally {
      setSending(false);
    }
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
          {status !== 'borrador' && status !== 'aprobada' && status !== 'rechazada' && (
            <button className="btn btn-ghost" disabled={sending} onClick={handleSend}>
              {sending ? 'Enviando...' : '↻ Reenviar propuesta'}
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

      {proposal.status === 'aprobada' && (
        <div style={{ border: '1px solid var(--border)', borderLeft: '3px solid #1a7a4a', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#1a7a4a' }}>
          {proposal.approved_option_id && (
            <div>Opción elegida: <strong>{options.find(o => o.id === proposal.approved_option_id)?.name ?? '—'}</strong></div>
          )}
          {proposal.signed_name && (
            <div style={{ marginTop: proposal.approved_option_id ? 4 : 0 }}>
              Firmada por <strong>{proposal.signed_name}</strong> el {new Date(proposal.signed_at).toLocaleString('es-PR')}
            </div>
          )}
          {proposal.approved_at && (
            <div style={{ marginTop: 4, fontSize: 12, color: '#888' }}>
              Aprobada el {new Date(proposal.approved_at).toLocaleString('es-PR')}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gap: 20 }}>
        {options.map(opt => (
          <div key={opt.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{opt.name}</span>
                {opt.is_recommended && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--amber)' }}>RECOMENDADA</span>}
                {proposal.approved_option_id === opt.id && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#1a7a4a' }}>ELEGIDA POR CLIENTE</span>}
                <span style={{ marginLeft: 12, fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{fmt(optionTotal(opt))}</span>
              </div>
              <button className="btn btn-ghost" onClick={() => handlePdf(opt.id)} disabled={generatingPdf === opt.id}>
                {generatingPdf === opt.id ? '⏳ Generando...' : '🖨️ PDF'}
              </button>
            </div>
            {opt.description && <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>{opt.description}</p>}
            <div id={`proposal-doc-${opt.id}`} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <ProposalDocument proposal={proposal} option={opt} companyInfo={companyInfo} primaryAddress={primaryAddress} taxRules={taxRules} payments={payments} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
