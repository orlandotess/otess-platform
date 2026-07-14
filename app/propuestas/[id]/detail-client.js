'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import ProposalDocument, { financialBreakdown } from '../ProposalDocument';
import { openPdfPreview } from '../../../lib/openPdfPreview';

const STATUS_BADGE = { borrador: 'badge-gray', enviada: 'badge-blue', vista: 'badge-amber', cambios_requeridos: 'badge-amber', expirada: 'badge-gray', aprobada: 'badge-green', rechazada: 'badge-red', completada: 'badge-dark' };
const STATUS_LABELS = { borrador: 'Borrador', enviada: 'Enviada', vista: 'Vista', cambios_requeridos: 'Cambios requeridos', expirada: 'Expirada', aprobada: 'Aprobada', rechazada: 'Rechazada', completada: 'Completada' };
const STATUS_ORDER = ['borrador', 'enviada', 'vista', 'cambios_requeridos', 'expirada', 'aprobada', 'rechazada', 'completada'];

export default function PropuestaDetailClient({ proposal, options, taxRules, payments, companyInfo, primaryAddress }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(proposal.status);
  const [generatingPdf, setGeneratingPdf] = useState(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  const menuItemStyle = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', borderRadius: 6, color: 'var(--navy)' };

  async function handlePdf(optId) {
    setGeneratingPdf(optId);
    try {
      await openPdfPreview(`proposal-doc-${optId}`, `${proposal.proposal_number}.pdf`, {
        margin: 0,
        pagebreak: { mode: 'css' },
      });
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

  async function changeStatus(newStatus) {
    setChangingStatus(true);
    const { error } = await supabase.from('proposals').update({ status: newStatus }).eq('id', proposal.id);
    setChangingStatus(false);
    if (error) { alert('Error al cambiar el estado: ' + error.message); return; }
    setStatus(newStatus);
    setStatusMenuOpen(false);
    setMenuOpen(false);
    router.refresh();
  }

  function copyLink() {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function deleteProposal() {
    setDeleting(true);
    const { data: opts } = await supabase.from('proposal_options').select('id').eq('proposal_id', proposal.id);
    const optionIds = (opts ?? []).map(o => o.id);
    if (optionIds.length) {
      await supabase.from('proposal_line_items').delete().in('option_id', optionIds);
      await supabase.from('proposal_options').delete().eq('proposal_id', proposal.id);
    }
    await supabase.from('proposal_payments').delete().eq('proposal_id', proposal.id);
    const { error } = await supabase.from('proposals').delete().eq('id', proposal.id);
    if (error) {
      setDeleting(false);
      alert('No se pudo eliminar la propuesta: ' + error.message);
      return;
    }
    window.location.href = '/propuestas';
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
          <span className={`badge ${STATUS_BADGE[status] ?? 'badge-gray'}`}>
            {STATUS_LABELS[status] ?? status}
          </span>
          {['borrador', 'enviada', 'vista', 'cambios_requeridos'].includes(status) && (
            <Link href={`/propuestas/${proposal.id}/editar`} className="btn btn-ghost">✏️ Editar</Link>
          )}
          {status === 'borrador' && (
            <button className="btn btn-primary" disabled={sending} onClick={handleSend}>
              {sending ? 'Enviando...' : 'Enviar propuesta'}
            </button>
          )}
          {!['borrador', 'aprobada', 'rechazada', 'completada'].includes(status) && (
            <button className="btn btn-ghost" disabled={sending} onClick={handleSend}>
              {sending ? 'Enviando...' : '↻ Reenviar propuesta'}
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setMenuOpen(o => !o)}>⋮</button>
            {menuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => { setMenuOpen(false); setStatusMenuOpen(false); }} />
                <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 4, minWidth: 210, whiteSpace: 'nowrap' }}>
                  {status !== 'borrador' && (
                    <button type="button" onClick={() => { copyLink(); setMenuOpen(false); }} style={menuItemStyle}>
                      {copied ? '✓ Copiado' : '🔗 Copiar link del cliente'}
                    </button>
                  )}
                  {status !== 'borrador' && (
                    <button type="button" onClick={() => { window.open(publicUrl, '_blank'); setMenuOpen(false); }} style={menuItemStyle}>
                      👁 Vista previa
                    </button>
                  )}
                  <div style={{ position: 'relative' }}>
                    <button type="button" onClick={() => setStatusMenuOpen(o => !o)} style={menuItemStyle}>
                      🏷 Cambiar estado
                    </button>
                    {statusMenuOpen && (
                      <div style={{ position: 'absolute', top: 0, right: '100%', marginRight: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 4, minWidth: 170 }}>
                        {STATUS_ORDER.filter(s => s !== status).map(s => (
                          <button key={s} type="button" disabled={changingStatus} onClick={() => changeStatus(s)} style={menuItemStyle}>
                            <span className={`badge ${STATUS_BADGE[s]}`} style={{ marginRight: 6 }}>{STATUS_LABELS[s]}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ borderTop: status !== 'borrador' ? '1px solid var(--border)' : 'none', marginTop: status !== 'borrador' ? 4 : 0, paddingTop: status !== 'borrador' ? 4 : 0 }}>
                    <div style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Descargar PDF</div>
                    {options.map(opt => (
                      <button key={opt.id} type="button" disabled={generatingPdf === opt.id} onClick={() => handlePdf(opt.id)} style={menuItemStyle}>
                        {generatingPdf === opt.id ? '⏳ Generando...' : `🖨️ ${opt.name}`}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: '#fca5a5' }} onClick={() => setShowDelete(true)}>🗑</button>
        </div>
      </div>

      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar propuesta?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteProposal} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger-tint)', color: 'var(--warn)', border: 'none' }}>
                {deleting ? 'Eliminando...' : '🗑 Sí, eliminar'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

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
        <div style={{ border: '1px solid var(--border)', borderLeft: '3px solid var(--ok)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--ok)' }}>
          {proposal.approved_option_id && (
            <div>Opción elegida: <strong>{options.find(o => o.id === proposal.approved_option_id)?.name ?? '—'}</strong></div>
          )}
          {proposal.signed_name && (
            <div style={{ marginTop: proposal.approved_option_id ? 4 : 0 }}>
              Firmada por <strong>{proposal.signed_name}</strong> el {new Date(proposal.signed_at).toLocaleString('es-PR')}
            </div>
          )}
          {proposal.approved_at && (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-faint)' }}>
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
                {proposal.approved_option_id === opt.id && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--ok)' }}>ELEGIDA POR CLIENTE</span>}
                <span style={{ marginLeft: 12, fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{fmt(optionTotal(opt))}</span>
              </div>
              {generatingPdf === opt.id && <span style={{ fontSize: 12, color: 'var(--muted)' }}>⏳ Generando PDF...</span>}
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
