'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import NuevaRetencionForm from '../../accounting/retenciones/NuevaRetencionForm';
import { openPdfPreview } from '../../../lib/openPdfPreview';
import { formatDateTimePR, formatDatePR } from '../../../lib/datetimeLocal';

const methodLabel = { cash: 'Efectivo', check: 'Cheque', card: 'Tarjeta', transfer: 'Transferencia' };
const fmtMoney = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DEFAULT_TERMS = `Garantía del Servicio: OTESS se compromete a brindar soporte técnico y mantenimiento correctivo sobre la instalación y configuración de los sistemas implementados por un período de un (1) año a partir de la fecha de finalización del proyecto.

Garantía de los Equipos: La garantía de los equipos y dispositivos instalados está sujeta a los términos y condiciones establecidos por el fabricante o suplidor. OTESS gestionará el proceso de garantía con el proveedor correspondiente en caso de defectos de fabricación dentro del período estipulado por el fabricante. No obstante, los tiempos de respuesta y el alcance de dicha garantía dependerán exclusivamente de la política del suplidor.`;

const TERMS_TEMPLATES = [
  { key: 'standard', label: 'Garantía estándar', text: DEFAULT_TERMS },
];

export default function InvoiceActions({ invoiceId, status, clientEmail, invoiceNumber, showPaymentOnly = false, balance = 0, clientName, clientCompany, billTo: initialBillTo = 'person', clientProperties = [], propertyId: initialPropertyId = null, terms: initialTerms = '', jobId = null, attachedNoteIds: initialAttached = [], internalNotes: initialInternalNotes = '', internalAttachments: initialInternalAttachments = [], clientId = null, subtotalLabor = 0, existingRetenciones = [], issuedAt = null }) {
  const router = useRouter();
  const [showPayment, setShowPayment] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showEditNumber, setShowEditNumber] = useState(false);
  const [showEditBillTo, setShowEditBillTo] = useState(false);
  const [showEditProperty, setShowEditProperty] = useState(false);
  const [showEditTerms, setShowEditTerms] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showInternalNotes, setShowInternalNotes] = useState(false);
  const [showCheckPhotos, setShowCheckPhotos] = useState(false);
  const [showRetencion, setShowRetencion] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [jobNotes, setJobNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState(initialAttached || []);
  const [savingAttachments, setSavingAttachments] = useState(false);
  const [newNumber, setNewNumber] = useState(invoiceNumber || '');
  const [billTo, setBillTo] = useState(initialBillTo);
  const [propertyId, setPropertyId] = useState(initialPropertyId || '');
  const [terms, setTerms] = useState(initialTerms || DEFAULT_TERMS);
  const [internalNotes, setInternalNotes] = useState(initialInternalNotes);
  const [savingInternalNotes, setSavingInternalNotes] = useState(false);
  const [checkPhotos, setCheckPhotos] = useState(initialInternalAttachments);
  const [checkPhotoUrls, setCheckPhotoUrls] = useState({});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [retenciones, setRetenciones] = useState(existingRetenciones);
  const [payment, setPayment] = useState({ amount: balance || '', method: 'cash', reference: '', notes: '', paid_at: new Date().toISOString().split('T')[0] });
  const [emailTo, setEmailTo] = useState(clientEmail || '');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  async function handlePdf() {
    setGeneratingPdf(true);
    try {
      await openPdfPreview('invoice-doc', `${invoiceNumber}.pdf`);
    } catch (err) {
      console.error('PDF error:', err);
    }
    setGeneratingPdf(false);
  }

  async function restoreInventoryForInvoice(reason) {
    const { data: lineItems } = await supabase.from('invoice_line_items').select('catalog_item_id, quantity, type, catalog_items(default_location_id)').eq('invoice_id', invoiceId);
    for (const li of (lineItems ?? []).filter(li => li.type === 'product' && li.catalog_item_id)) {
      await supabase.rpc('adjust_catalog_stock', {
        p_catalog_item_id: li.catalog_item_id,
        p_delta: li.quantity,
        p_invoice_id: invoiceId,
        p_reason: reason,
        p_location_id: li.catalog_items?.default_location_id ?? null,
      });
    }
  }

  async function updateStatus(newStatus) {
    if (newStatus === 'cancelled') await restoreInventoryForInvoice('invoice_cancelled');
    await supabase.from('invoices').update({ status: newStatus }).eq('id', invoiceId);
    router.refresh();
  }

  async function savePayment(e) {
    e.preventDefault();
    const amount = parseFloat(payment.amount);
    const remaining = Number(balance) - amount;
    if (remaining < -0.01 && !confirm(`Este monto excede el balance pendiente (${fmtMoney(balance)}) por ${fmtMoney(-remaining)}. ¿Registrar el pago de todas formas?`)) {
      return;
    }
    setSaving(true);
    await supabase.from('payments').insert([{
      invoice_id: invoiceId,
      amount,
      method: payment.method,
      reference: payment.reference || null,
      notes: payment.notes || null,
      paid_at: payment.paid_at,
    }]);
    // Only flip to paid once this payment covers the remaining balance —
    // partial payments leave the invoice as-is so more can be registered later.
    if (remaining <= 0.01) {
      await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoiceId);
    }
    setSaving(false);
    setShowPayment(false);
    router.refresh();
  }

  async function sendEmail(e) {
    e.preventDefault();
    setSending(true);
    const res = await fetch('/api/send-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId, toEmail: emailTo }),
    });
    const data = await res.json();
    setSending(false);
    if (data.success) { setEmailSent(true); setShowEmail(false); router.refresh(); }
    else alert('Error: ' + data.error);
  }

  async function saveNumber(e) {
    e.preventDefault();
    if (!newNumber.trim()) return;
    await supabase.from('invoices').update({ invoice_number: newNumber.trim() }).eq('id', invoiceId);
    setShowEditNumber(false);
    router.refresh();
  }

  async function saveBillTo(e) {
    e.preventDefault();
    await supabase.from('invoices').update({ bill_to: billTo }).eq('id', invoiceId);
    setShowEditBillTo(false);
    router.refresh();
  }

  async function saveProperty(e) {
    e.preventDefault();
    await supabase.from('invoices').update({ property_id: propertyId || null }).eq('id', invoiceId);
    setShowEditProperty(false);
    router.refresh();
  }

  async function saveTerms(e) {
    e.preventDefault();
    await supabase.from('invoices').update({ terms: terms || null }).eq('id', invoiceId);
    setShowEditTerms(false);
    router.refresh();
  }

  async function saveInternalNotes(e) {
    e.preventDefault();
    setSavingInternalNotes(true);
    await supabase.from('invoices').update({ internal_notes: internalNotes || null }).eq('id', invoiceId);
    setSavingInternalNotes(false);
    setShowInternalNotes(false);
    router.refresh();
  }

  async function openCheckPhotos() {
    setShowCheckPhotos(true);
    const missing = checkPhotos.filter(p => !checkPhotoUrls[p.id]);
    if (missing.length) {
      const entries = await Promise.all(missing.map(async p => {
        const { data } = await supabase.storage.from('Job-photos').createSignedUrl(p.photo_url, 3600);
        return [p.id, data?.signedUrl ?? null];
      }));
      setCheckPhotoUrls(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    }
  }

  async function uploadCheckPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    const ext = file.name.split('.').pop();
    const path = `invoice-checks/${invoiceId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('Job-photos').upload(path, file);
    if (!uploadErr) {
      const { data } = await supabase.from('invoice_internal_attachments').insert([{ invoice_id: invoiceId, photo_url: path }]).select().single();
      if (data) {
        setCheckPhotos(prev => [data, ...prev]);
        const { data: signed } = await supabase.storage.from('Job-photos').createSignedUrl(path, 3600);
        setCheckPhotoUrls(prev => ({ ...prev, [data.id]: signed?.signedUrl ?? null }));
      }
    }
    setUploadingPhoto(false);
    e.target.value = '';
  }

  async function deleteCheckPhoto(attachment) {
    if (!confirm('¿Eliminar esta foto?')) return;
    await supabase.from('invoice_internal_attachments').delete().eq('id', attachment.id);
    await supabase.storage.from('Job-photos').remove([attachment.photo_url]);
    setCheckPhotos(prev => prev.filter(p => p.id !== attachment.id));
  }

  function handleRetencionSaved(newRow) {
    setRetenciones(prev => [...prev, newRow]);
    setShowRetencion(false);
    router.refresh();
  }

  async function deleteInvoice() {
    setDeleting(true);
    await restoreInventoryForInvoice('invoice_deleted');
    const photoPaths = checkPhotos.map(p => p.photo_url).filter(Boolean);
    if (photoPaths.length) await supabase.storage.from('Job-photos').remove(photoPaths);
    await supabase.from('invoice_internal_attachments').delete().eq('invoice_id', invoiceId);
    await supabase.from('invoice_views').delete().eq('invoice_id', invoiceId);
    await supabase.from('retenciones').delete().eq('invoice_id', invoiceId);
    await supabase.from('payments').delete().eq('invoice_id', invoiceId);
    await supabase.from('invoice_line_items').delete().eq('invoice_id', invoiceId);
    const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);
    if (error) {
      setDeleting(false);
      alert('No se pudo eliminar la factura: ' + error.message);
      return;
    }
    // Full reload (not router.push) so the facturas list and client balance
    // don't serve a stale cached render of the just-deleted invoice.
    window.location.href = '/facturas';
  }

  async function openAttachments() {
    setShowAttachments(true);
    if (jobNotes.length === 0 && jobId) {
      setLoadingNotes(true);
      const { data } = await supabase.from('job_notes').select('*').eq('job_id', jobId).order('created_at', { ascending: false });
      const withSigned = await Promise.all((data ?? []).map(async n => {
        const paths = n.photo_urls && n.photo_urls.length > 0 ? n.photo_urls : (n.photo_url ? [n.photo_url] : []);
        const signedUrls = await Promise.all(paths.map(async p => {
          const { data: sd } = await supabase.storage.from('Job-photos').createSignedUrl(p, 3600);
          return sd?.signedUrl ?? null;
        }));
        return { ...n, signedUrls: signedUrls.filter(Boolean) };
      }));
      setJobNotes(withSigned);
      setLoadingNotes(false);
    }
  }

  function toggleNoteSelection(noteId) {
    setSelectedNoteIds(prev => prev.includes(noteId) ? prev.filter(id => id !== noteId) : [...prev, noteId]);
  }

  async function saveAttachments() {
    setSavingAttachments(true);
    await supabase.from('invoices').update({ attached_note_ids: selectedNoteIds }).eq('id', invoiceId);
    setSavingAttachments(false);
    setShowAttachments(false);
    router.refresh();
  }

  async function clearAttachments() {
    if (!confirm('¿Quitar todos los adjuntos de esta factura?')) return;
    setSelectedNoteIds([]);
    await supabase.from('invoices').update({ attached_note_ids: [] }).eq('id', invoiceId);
    router.refresh();
  }

  if (showPaymentOnly) {
    return (
      <>
        <button className="btn btn-amber" onClick={() => setShowPayment(true)}>+ Registrar pago</button>
        {showPayment && <PaymentModal payment={payment} setPayment={setPayment} onSave={savePayment} onClose={() => setShowPayment(false)} saving={saving} balance={balance} />}
      </>
    );
  }

  const moreItems = [
    { key: 'number', label: '✏️ Editar # de factura', onClick: () => { setNewNumber(invoiceNumber); setShowEditNumber(true); } },
    clientCompany && { key: 'billto', label: '👤 Facturar a', onClick: () => setShowEditBillTo(true) },
    clientProperties.length > 0 && { key: 'property', label: '🏠 Propiedad', onClick: () => setShowEditProperty(true) },
    { key: 'terms', label: '📋 Términos', onClick: () => setShowEditTerms(true) },
    { key: 'notes', label: '📝 Notas internas', onClick: () => setShowInternalNotes(true) },
    { key: 'checks', label: `📷 Fotos de cheques${checkPhotos.length > 0 ? ` (${checkPhotos.length})` : ''}`, onClick: openCheckPhotos },
    jobId && { key: 'attach', label: `📎 Adjuntos${selectedNoteIds.length > 0 ? ` (${selectedNoteIds.length})` : ''}`, onClick: openAttachments },
    selectedNoteIds.length > 0 && { key: 'clearattach', label: '🗑 Quitar adjuntos', onClick: clearAttachments, warn: true },
    status === 'sent' && { key: 'cancel', label: '✕ Cancelar factura', onClick: () => updateStatus('cancelled'), warn: true },
    status === 'paid' && { key: 'revert', label: '↩ Revertir a enviada', onClick: () => updateStatus('sent') },
    { key: 'delete', label: '🗑 Eliminar factura', onClick: () => setShowDelete(true), warn: true },
  ].filter(Boolean);

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', position: 'relative' }}>
      <button className="btn btn-ghost" onClick={handlePdf} disabled={generatingPdf}>
        {generatingPdf ? '⏳ Generando...' : '🖨️ PDF'}
      </button>
      <button className="btn btn-ghost" onClick={() => setShowEmail(true)}>📧 Email</button>
      <button className={`btn ${retenciones.length > 0 ? 'btn-amber' : 'btn-ghost'}`} onClick={() => setShowRetencion(true)}>
        📋 {retenciones.length > 0 ? `Retención: ${fmtMoney(retenciones.reduce((a, r) => a + Number(r.retencion_aplicada ?? 0), 0))}` : 'Registrar retención'}
      </button>
      {status === 'draft' && <button className="btn btn-primary" onClick={() => setShowEmail(true)}>📤 Enviar</button>}
      {status === 'sent' && <button className="btn btn-amber" onClick={() => setShowPayment(true)}>💰 Pago</button>}
      {status === 'paid' && <span className="badge badge-green" style={{ padding: '8px 16px', fontSize: 13 }}>✅ Pagada</span>}
      {emailSent && <span className="badge badge-green" style={{ padding: '8px 16px', fontSize: 13 }}>✅ Enviado</span>}

      <button className="btn btn-ghost" onClick={() => setShowMore(v => !v)}>⋯ Más</button>
      {showMore && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setShowMore(false)} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', minWidth: 220, zIndex: 1000, overflow: 'hidden' }}>
            {moreItems.map((item, i) => (
              <button
                key={item.key}
                className="dropdown-item"
                onClick={() => { setShowMore(false); item.onClick(); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', borderBottom: i < moreItems.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13.5, fontWeight: 600, color: item.warn ? 'var(--warn)' : 'var(--text)', cursor: 'pointer' }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Attachments modal */}
      {showAttachments && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 600, maxHeight: '80vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 6 }}>📎 Adjuntos del trabajo</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Selecciona qué fotos, videos o documentos compartir con el cliente en esta factura.</p>

            {loadingNotes ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>Cargando...</p>
            ) : jobNotes.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>No hay notas ni archivos en este trabajo.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {jobNotes.map(n => {
                  const isSelected = selectedNoteIds.includes(n.id);
                  return (
                    <label key={n.id} style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10, border: `2px solid ${isSelected ? 'var(--navy)' : 'var(--border)'}`, background: isSelected ? 'var(--info-tint)' : 'var(--surface)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleNoteSelection(n.id)} style={{ marginTop: 4 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                          {formatDateTimePR(n.created_at, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {n.signedUrls && n.signedUrls.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: n.note ? 8 : 0 }}>
                            {n.signedUrls.map((url, idx) => {
                              const isVideo = /\.(mp4|mov|webm|avi)(\?|$)/i.test(url);
                              const isPdf = /\.pdf(\?|$)/i.test(url);
                              if (isPdf) return <div key={idx} style={{ width: 60, height: 60, background: 'var(--surface-2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📄</div>;
                              if (isVideo) return <div key={idx} style={{ width: 60, height: 60, background: '#000', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🎥</div>;
                              return <img key={idx} src={url} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }} />;
                            })}
                          </div>
                        )}
                        {n.note && <p style={{ fontSize: 13, margin: 0, color: 'var(--text)' }}>{n.note}</p>}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={saveAttachments} disabled={savingAttachments} style={{ flex: 1, justifyContent: 'center' }}>
                {savingAttachments ? 'Guardando...' : `💾 Guardar (${selectedNoteIds.length} seleccionados)`}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowAttachments(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit terms */}
      {showEditTerms && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 560, maxHeight: '80vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Términos del Proyecto</h2>
            <form onSubmit={saveTerms}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12 }}>Plantilla de términos</label>
                <select
                  value=""
                  onChange={e => {
                    const tpl = TERMS_TEMPLATES.find(t => t.key === e.target.value);
                    if (tpl) setTerms(tpl.text);
                  }}
                >
                  <option value="">— Elegir plantilla —</option>
                  {TERMS_TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={10} style={{ fontSize: 13, lineHeight: 1.7, width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Guardar</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditTerms(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Internal notes (never shown on the printed invoice) */}
      {showInternalNotes && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 480 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 6 }}>📝 Notas internas</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>Solo visibles para el equipo — nunca aparecen en la factura impresa ni por email.</p>
            <form onSubmit={saveInternalNotes}>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={6} placeholder="Notas internas de contabilidad..." style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={savingInternalNotes} style={{ flex: 1, justifyContent: 'center' }}>
                  {savingInternalNotes ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowInternalNotes(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Check photos (internal only, stored in Job-photos bucket) */}
      {showCheckPhotos && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 560, maxHeight: '80vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 6 }}>📷 Fotos de cheques</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Internas — nunca se comparten con el cliente.</p>

            <label className="btn btn-primary" style={{ display: 'inline-block', marginBottom: 20, cursor: 'pointer' }}>
              {uploadingPhoto ? 'Subiendo...' : '+ Subir foto'}
              <input type="file" accept="image/*" onChange={uploadCheckPhoto} disabled={uploadingPhoto} style={{ display: 'none' }} />
            </label>

            {checkPhotos.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>No hay fotos guardadas.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {checkPhotos.map(p => (
                  <div key={p.id} style={{ position: 'relative', width: 140 }}>
                    {checkPhotoUrls[p.id] ? (
                      <img src={checkPhotoUrls[p.id]} style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 8 }} />
                    ) : (
                      <div style={{ width: 140, height: 140, background: 'var(--surface-2)', borderRadius: 8 }} />
                    )}
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      {formatDatePR(p.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <button onClick={() => deleteCheckPhoto(p)} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '2px 6px' }}>🗑</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setShowCheckPhotos(false)} style={{ flex: 1, justifyContent: 'center' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Registrar retención */}
      {showRetencion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20, overflow: 'auto' }}>
          <div style={{ width: 640 }}>
            {retenciones.length > 0 && (
              <div style={{ background: 'var(--amber-tint)', border: '1.5px solid var(--amber)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: 'var(--navy)' }}>
                ⚠️ Esta factura ya tiene {retenciones.length} retención(es) registrada(s) por un total de {fmtMoney(retenciones.reduce((a, r) => a + Number(r.retencion_aplicada ?? 0), 0))}. Puedes registrar otra si es necesario.
              </div>
            )}
            <NuevaRetencionForm
              clientIdLocked={clientId}
              clientNameLocked={clientName}
              invoiceLocked={{ id: invoiceId, invoice_number: invoiceNumber, subtotal_labor: subtotalLabor, issued_at: issuedAt || new Date().toISOString().slice(0, 10) }}
              onSaved={handleRetencionSaved}
              onCancel={() => setShowRetencion(false)}
            />
          </div>
        </div>
      )}

      {/* Edit property */}
      {showEditProperty && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Propiedad del servicio</h2>
            <form onSubmit={saveProperty}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer', padding: '12px 16px', borderRadius: 10, border: `2px solid ${!propertyId ? 'var(--navy)' : 'var(--border)'}`, background: !propertyId ? 'var(--info-tint)' : 'var(--surface)' }}>
                  <input type="radio" name="property" value="" checked={!propertyId} onChange={() => setPropertyId('')} />
                  <div>
                    <div style={{ fontWeight: 700 }}>Sin propiedad</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>No asignar propiedad</div>
                  </div>
                </label>
                {clientProperties.map(p => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer', padding: '12px 16px', borderRadius: 10, border: `2px solid ${propertyId === p.id ? 'var(--navy)' : 'var(--border)'}`, background: propertyId === p.id ? 'var(--info-tint)' : 'var(--surface)' }}>
                    <input type="radio" name="property" value={p.id} checked={propertyId === p.id} onChange={() => setPropertyId(p.id)} />
                    <div>
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      {p.street && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.street}{p.city ? `, ${p.city}` : ''}</div>}
                    </div>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Guardar</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditProperty(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit bill to */}
      {showEditBillTo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Facturar a</h2>
            <form onSubmit={saveBillTo}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, cursor: 'pointer', padding: '12px 16px', borderRadius: 10, border: `2px solid ${billTo === 'person' ? 'var(--navy)' : 'var(--border)'}`, background: billTo === 'person' ? 'var(--info-tint)' : 'var(--surface)' }}>
                  <input type="radio" name="bill_to" value="person" checked={billTo === 'person'} onChange={() => setBillTo('person')} />
                  <div>
                    <div style={{ fontWeight: 700 }}>{clientName}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Persona</div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, cursor: 'pointer', padding: '12px 16px', borderRadius: 10, border: `2px solid ${billTo === 'company' ? 'var(--navy)' : 'var(--border)'}`, background: billTo === 'company' ? 'var(--info-tint)' : 'var(--surface)' }}>
                  <input type="radio" name="bill_to" value="company" checked={billTo === 'company'} onChange={() => setBillTo('company')} />
                  <div>
                    <div style={{ fontWeight: 700 }}>{clientCompany}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Empresa</div>
                  </div>
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Guardar</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditBillTo(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit invoice number */}
      {showEditNumber && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Editar número de factura</h2>
            <form onSubmit={saveNumber}>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label>Número de factura</label>
                <input value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="INV-1001" required />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Guardar</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditNumber(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar factura?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Se eliminarán también los pagos, retenciones, adjuntos y fotos de cheques asociados a esta factura. Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteInvoice} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger-tint)', color: 'var(--warn)', border: 'none' }}>
                {deleting ? 'Eliminando...' : '🗑 Sí, eliminar'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Email modal */}
      {showEmail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Enviar factura por email</h2>
            <form onSubmit={sendEmail}>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label>Email del cliente</label>
                <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="cliente@email.com" required />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={sending} style={{ flex: 1, justifyContent: 'center' }}>
                  {sending ? 'Enviando...' : '📧 Enviar'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEmail(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPayment && <PaymentModal payment={payment} setPayment={setPayment} onSave={savePayment} onClose={() => setShowPayment(false)} saving={saving} balance={balance} />}
    </div>
  );
}

function PaymentModal({ payment, setPayment, onSave, onClose, saving, balance }) {
  const set = (k, v) => setPayment(p => ({ ...p, [k]: v }));
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 420 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Registrar pago</h2>
        <form onSubmit={onSave}>
          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label>Monto *</label>
              <input type="number" value={payment.amount} onChange={e => set('amount', e.target.value)} step="0.01" min="0.01" placeholder={`Máx $${Number(balance).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} required />
            </div>
            <div className="form-group">
              <label>Fecha</label>
              <input type="date" value={payment.paid_at} onChange={e => set('paid_at', e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Método de pago</label>
            <select value={payment.method} onChange={e => set('method', e.target.value)}>
              {Object.entries(methodLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Referencia</label>
            <input value={payment.reference} onChange={e => set('reference', e.target.value)} placeholder="Cheque #, confirmación, etc." />
          </div>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>Notas</label>
            <textarea value={payment.notes} onChange={e => set('notes', e.target.value)} placeholder="Opcional" style={{ minHeight: 60 }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
              {saving ? 'Guardando...' : '💾 Guardar pago'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
