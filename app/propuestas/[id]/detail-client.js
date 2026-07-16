'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { formatDateTimePR, formatDatePR } from '../../../lib/datetimeLocal';
import ProposalDocument, { financialBreakdown, profitBreakdown } from '../ProposalDocument';
import { openPdfPreview } from '../../../lib/openPdfPreview';
import { exportProposalDataCSV } from '../../propuestaDataCsv';
import { generatePurchaseOrders } from '../../../lib/generatePurchaseOrders';

const STATUS_BADGE = { borrador: 'badge-gray', enviada: 'badge-blue', vista: 'badge-amber', cambios_requeridos: 'badge-amber', expirada: 'badge-gray', aprobada: 'badge-green', rechazada: 'badge-red', completada: 'badge-dark' };
const STATUS_LABELS = { borrador: 'Borrador', enviada: 'Enviada', vista: 'Vista', cambios_requeridos: 'Cambios requeridos', expirada: 'Expirada', aprobada: 'Aprobada', rechazada: 'Rechazada', completada: 'Completada' };
const STATUS_ORDER = ['borrador', 'enviada', 'vista', 'cambios_requeridos', 'expirada', 'aprobada', 'rechazada', 'completada'];

export default function PropuestaDetailClient({ proposal, options, taxRules, payments, paymentRequests, companyInfo, primaryAddress }) {
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
  const [cloning, setCloning] = useState(false);
  const [archivedAt, setArchivedAt] = useState(proposal.archived_at);
  const [archiving, setArchiving] = useState(false);
  const [extraPreview, setExtraPreview] = useState(null); // { mode, optId } — see handleExtraPdf
  const [requests, setRequests] = useState(paymentRequests ?? []);
  const [requestingId, setRequestingId] = useState(null);
  const [generatingPO, setGeneratingPO] = useState(false);

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

  // Covers the invoice, installer and pick-list exports — each is a
  // ProposalDocument mode with no visible on-page rendering of its own.
  // Mounted in normal document flow (briefly) so html2canvas measures a
  // real layout — an off-screen/absolute clone reliably captured at 0
  // height in testing, unlike the client PDF, which renders visibly on
  // the page and works fine. setTimeout (not requestAnimationFrame)
  // because openPdfPreview's window.open() backgrounds this tab, and
  // backgrounded tabs can stall rAF entirely.
  async function handleExtraPdf(mode, optId, filenameSuffix) {
    setGeneratingPdf(`${mode}-${optId}`);
    setExtraPreview({ mode, optId });
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      await openPdfPreview(`${mode}-doc-${optId}`, `${proposal.proposal_number}-${filenameSuffix}.pdf`, {
        margin: 0,
        pagebreak: { mode: 'css' },
      });
    } catch (err) {
      console.error(`${mode} PDF error:`, err);
    }
    setExtraPreview(null);
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

  async function cloneProposal() {
    setCloning(true);
    try {
      const { data: last } = await supabase.from('proposals').select('proposal_number').order('created_at', { ascending: false }).limit(1).single();
      let nextNum = 1001;
      if (last?.proposal_number) {
        const n = parseInt(last.proposal_number.replace('PROP-', ''));
        if (!isNaN(n)) nextNum = n + 1;
      }

      const { data: newProposal, error: propErr } = await supabase.from('proposals').insert([{
        proposal_number: `PROP-${nextNum}`,
        client_id: proposal.client_id,
        title: `${proposal.title} (copia)`,
        prepared_by: proposal.prepared_by,
        intro_note: proposal.intro_note,
        project_description: proposal.project_description,
        requires_signature: proposal.requires_signature,
        status: 'borrador',
        tax_client_type: proposal.tax_client_type,
        cover_photo_url: proposal.cover_photo_url,
        terms: proposal.terms,
        valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      }]).select().single();
      if (propErr) throw propErr;

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const { data: newOpt, error: optErr } = await supabase.from('proposal_options').insert([{
          proposal_id: newProposal.id,
          name: opt.name,
          description: opt.description,
          is_recommended: opt.is_recommended,
          sort_order: opt.sort_order ?? i,
        }]).select().single();
        if (optErr) throw optErr;

        const idMap = {};
        const parents = (opt.items ?? []).filter(it => !it.parent_item_id);
        for (const it of parents) {
          const { data: newItem, error: itemErr } = await supabase.from('proposal_line_items').insert([{
            option_id: newOpt.id,
            area: it.area,
            parent_item_id: null,
            item_type: it.item_type,
            description: it.description,
            quantity: it.quantity,
            msrp: it.msrp,
            unit_price: it.unit_price,
            supplier_price: it.supplier_price,
            exempt_reason: it.exempt_reason,
            discount_amount: it.discount_amount,
            vendor: it.vendor,
            photo_url: it.photo_url,
            sort_order: it.sort_order,
          }]).select().single();
          if (itemErr) throw itemErr;
          idMap[it.id] = newItem.id;
        }
        const children = (opt.items ?? []).filter(it => it.parent_item_id);
        for (const it of children) {
          const newParentId = idMap[it.parent_item_id];
          if (!newParentId) continue;
          await supabase.from('proposal_line_items').insert([{
            option_id: newOpt.id,
            area: it.area,
            parent_item_id: newParentId,
            item_type: it.item_type,
            description: it.description,
            quantity: it.quantity,
            msrp: it.msrp,
            unit_price: it.unit_price,
            supplier_price: it.supplier_price,
            exempt_reason: it.exempt_reason,
            discount_amount: it.discount_amount,
            vendor: it.vendor,
            photo_url: it.photo_url,
            sort_order: it.sort_order,
          }]);
        }
      }

      const paymentsToInsert = (payments ?? []).map(p => ({
        proposal_id: newProposal.id,
        label: p.label,
        basis: p.basis,
        percent: p.percent,
        due_trigger: p.due_trigger,
        sort_order: p.sort_order,
      }));
      if (paymentsToInsert.length) await supabase.from('proposal_payments').insert(paymentsToInsert);

      router.push(`/propuestas/${newProposal.id}`);
    } catch (err) {
      alert('Error al clonar la propuesta: ' + err.message);
      setCloning(false);
    }
  }

  async function toggleArchive() {
    setArchiving(true);
    const newValue = archivedAt ? null : new Date().toISOString();
    const { error } = await supabase.from('proposals').update({ archived_at: newValue }).eq('id', proposal.id);
    setArchiving(false);
    if (error) { alert('Error al archivar la propuesta: ' + error.message); return; }
    setArchivedAt(newValue);
    setMenuOpen(false);
    router.refresh();
  }

  function copyLink() {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function solicitarPago(payment, amount) {
    setRequestingId(payment.id);
    try {
      const res = await fetch('/api/propuestas/solicitar-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.id, paymentId: payment.id, amount, label: payment.label }),
      });
      const data = await res.json();
      if (data.error) { alert('Error: ' + data.error); return; }
      if (data.warning) alert(data.warning);
      setRequests(prev => {
        const exists = prev.some(r => r.payment_id === payment.id);
        return exists ? prev.map(r => r.payment_id === payment.id ? data.record : r) : [...prev, data.record];
      });
    } catch (err) {
      alert('Error al solicitar el pago: ' + err.message);
    } finally {
      setRequestingId(null);
    }
  }

  async function marcarPagado(requestId) {
    const now = new Date().toISOString();
    const { error } = await supabase.from('proposal_payment_requests').update({ status: 'pagado', paid_at: now }).eq('id', requestId);
    if (error) { alert('Error al marcar como pagado: ' + error.message); return; }
    setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'pagado', paid_at: now } : r));
  }

  async function generarOrdenCompra() {
    const approvedOption = options.find(o => o.id === proposal.approved_option_id);
    if (!approvedOption) return;
    setGeneratingPO(true);
    try {
      const items = (approvedOption.items ?? []).map(it => ({
        id: it.id,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        supplier_price: it.supplier_price,
        vendor: it.vendor,
        isProduct: it.item_type === 'product',
      }));
      const { orders, reason } = await generatePurchaseOrders(items, {
        sourceType: 'proposal',
        sourceId: proposal.id,
        sourceLabel: `${proposal.proposal_number} — ${proposal.title}`,
      });
      if (reason === 'no-items') {
        alert('No hay productos con proveedor asignado en esta opción.');
      } else {
        alert(`${orders.length} orden(es) de compra generada(s).`);
        router.push('/compras');
      }
    } catch (err) {
      alert('Error al generar la orden de compra: ' + err.message);
    } finally {
      setGeneratingPO(false);
      setMenuOpen(false);
    }
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
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`badge ${STATUS_BADGE[status] ?? 'badge-gray'}`}>
            {STATUS_LABELS[status] ?? status}
          </span>
          {archivedAt && <span className="badge badge-gray">📦 Archivada</span>}
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
                  {proposal.approved_option_id && (
                    <button type="button" disabled={generatingPO} onClick={generarOrdenCompra} style={menuItemStyle}>
                      {generatingPO ? '⏳ Generando...' : '📦 Generar orden de compra'}
                    </button>
                  )}
                  <button type="button" disabled={cloning} onClick={cloneProposal} style={menuItemStyle}>
                    {cloning ? '⏳ Clonando...' : '📄 Clonar propuesta'}
                  </button>
                  <button type="button" disabled={archiving} onClick={toggleArchive} style={menuItemStyle}>
                    {archiving ? '⏳ Guardando...' : archivedAt ? '📤 Desarchivar' : '📦 Archivar'}
                  </button>
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
                        {generatingPdf === opt.id ? '⏳ Generando...' : `🖨️ Cliente — ${opt.name}`}
                      </button>
                    ))}
                    {options.map(opt => (
                      <button key={`inv-${opt.id}`} type="button" disabled={generatingPdf === `invoice-${opt.id}`} onClick={() => handleExtraPdf('invoice', opt.id, 'Factura')} style={menuItemStyle}>
                        {generatingPdf === `invoice-${opt.id}` ? '⏳ Generando...' : `🧾 Factura — ${opt.name}`}
                      </button>
                    ))}
                    {options.map(opt => (
                      <button key={`inst-${opt.id}`} type="button" disabled={generatingPdf === `installer-${opt.id}`} onClick={() => handleExtraPdf('installer', opt.id, 'Instalador')} style={menuItemStyle}>
                        {generatingPdf === `installer-${opt.id}` ? '⏳ Generando...' : `🔧 Instalador — ${opt.name}`}
                      </button>
                    ))}
                    {options.map(opt => (
                      <button key={`pick-${opt.id}`} type="button" disabled={generatingPdf === `picklist-${opt.id}`} onClick={() => handleExtraPdf('picklist', opt.id, 'PickList')} style={menuItemStyle}>
                        {generatingPdf === `picklist-${opt.id}` ? '⏳ Generando...' : `📋 Pick List — ${opt.name}`}
                      </button>
                    ))}
                    <button type="button" onClick={() => { exportProposalDataCSV(options, proposal.proposal_number); setMenuOpen(false); }} style={menuItemStyle}>
                      📊 CSV — Datos de propuesta
                    </button>
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
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
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

      {proposal.project_description && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Descripción del proyecto (interno, no visible al cliente)</p>
          <p style={{ fontSize: 14, margin: 0, whiteSpace: 'pre-line' }}>{proposal.project_description}</p>
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
              Firmada por <strong>{proposal.signed_name}</strong> el {formatDateTimePR(proposal.signed_at)}
            </div>
          )}
          {proposal.approved_at && (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-faint)' }}>
              Aprobada el {formatDateTimePR(proposal.approved_at)}
            </div>
          )}
        </div>
      )}

      {proposal.approved_option_id && payments.length > 0 && (() => {
        const approvedOption = options.find(o => o.id === proposal.approved_option_id);
        if (!approvedOption) return null;
        const fb = financialBreakdown(approvedOption.items, clientType, taxRules ?? []);
        const basisAmount = { parts: fb.parts, labor: fb.labor, subtotal: fb.subtotal };
        return (
          <div className="card" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Solicitudes de pago (interno, no visible al cliente)</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {payments.map(p => {
                const amount = (basisAmount[p.basis] ?? 0) * (p.percent / 100);
                const req = requests.find(r => r.payment_id === p.id);
                return (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {fmt(amount)}
                        {req?.status === 'pagado' && ` · Pagado el ${formatDatePR(req.paid_at)}`}
                        {req?.status === 'solicitado' && ` · Solicitado el ${formatDatePR(req.requested_at)}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {req?.status === 'pagado' ? (
                        <span className="badge badge-green">Pagado</span>
                      ) : (
                        <>
                          <button className="btn btn-ghost" disabled={requestingId === p.id} onClick={() => solicitarPago(p, amount)}>
                            {requestingId === p.id ? 'Enviando...' : req ? '↻ Reenviar solicitud' : 'Solicitar pago'}
                          </button>
                          {req && (
                            <button className="btn btn-ghost" onClick={() => marcarPagado(req.id)}>Marcar pagado</button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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
            {(() => {
              const pb = profitBreakdown(opt.items);
              return (
                <div className="card" style={{ marginBottom: 12, background: 'var(--surface-2)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Profit Analysis (interno, no visible al cliente)</p>
                  <div style={{ display: 'flex', gap: 24, fontSize: 13, flexWrap: 'wrap' }}>
                    <div><span style={{ color: 'var(--muted)' }}>Venta: </span><strong>{fmt(pb.sell)}</strong></div>
                    <div><span style={{ color: 'var(--muted)' }}>Costo: </span><strong>{fmt(pb.cost)}</strong></div>
                    <div><span style={{ color: 'var(--muted)' }}>Ganancia: </span><strong>{fmt(pb.profit)}</strong></div>
                    <div><span style={{ color: 'var(--muted)' }}>Margen: </span><strong>{pb.marginPct != null ? `${pb.marginPct.toFixed(1)}%` : '—'}</strong></div>
                  </div>
                </div>
              );
            })()}
            <div id={`proposal-doc-${opt.id}`} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <ProposalDocument proposal={proposal} option={opt} companyInfo={companyInfo} primaryAddress={primaryAddress} taxRules={taxRules} payments={payments} />
            </div>
          </div>
        ))}
      </div>
      {/* Mounted in normal flow (not hidden) only while a Factura/Instalador/Pick List PDF is being generated — see handleExtraPdf */}
      {extraPreview && (() => {
        const opt = options.find(o => o.id === extraPreview.optId);
        if (!opt) return null;
        return (
          <div id={`${extraPreview.mode}-doc-${opt.id}`} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <ProposalDocument proposal={proposal} option={opt} companyInfo={companyInfo} primaryAddress={primaryAddress} taxRules={taxRules} payments={payments} mode={extraPreview.mode} />
          </div>
        );
      })()}
    </div>
  );
}
