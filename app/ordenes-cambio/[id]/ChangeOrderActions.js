'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { openPdfPreview } from '../../../lib/openPdfPreview';

export default function ChangeOrderActions({ orderId, status, clientEmail, clientName, orderNumber, publicToken, clientContacts = [] }) {
  const router = useRouter();
  const [showEmail, setShowEmail] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [emailTo, setEmailTo] = useState(clientEmail || '');
  const [emailCc, setEmailCc] = useState([]);
  const [emailCcExtra, setEmailCcExtra] = useState('');
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');

  const toOptions = [
    ...(clientEmail ? [{ label: clientName ? `${clientName} (cliente)` : 'Cliente', email: clientEmail }] : []),
    ...clientContacts.filter(c => c.email).map(c => ({ label: c.name, email: c.email })),
  ];
  const isCustomEmail = !toOptions.some(o => o.email === emailTo);

  useEffect(() => {
    setPublicUrl(`${window.location.origin}/orden-cambio/${publicToken}`);
  }, [publicToken]);

  async function handlePdf() {
    setGeneratingPdf(true);
    try {
      await openPdfPreview('change-order-doc', `${orderNumber}.pdf`);
    } catch (err) {
      console.error('PDF error:', err);
    }
    setGeneratingPdf(false);
  }

  function toggleCcContact(email) {
    setEmailCc(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  }

  async function sendEmail(e) {
    e.preventDefault();
    setSending(true);
    const extraCc = emailCcExtra.split(',').map(s => s.trim()).filter(Boolean);
    const cc = [...new Set([...emailCc, ...extraCc])];
    const res = await fetch('/api/ordenes-cambio/enviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, toEmail: emailTo, cc }),
    });
    const data = await res.json();
    setSending(false);
    if (data.success) { setShowEmail(false); router.refresh(); }
    else alert('Error: ' + data.error);
  }

  function copyLink() {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function updateStatus(newStatus) {
    await supabase.from('change_orders').update({ status: newStatus }).eq('id', orderId);
    router.refresh();
  }

  async function deleteOrder() {
    setDeleting(true);
    await supabase.from('change_order_line_items').delete().eq('change_order_id', orderId);
    const { error } = await supabase.from('change_orders').delete().eq('id', orderId);
    if (error) {
      setDeleting(false);
      alert('No se pudo eliminar: ' + error.message);
      return;
    }
    window.location.href = '/ordenes-cambio';
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <button className="btn btn-ghost" onClick={handlePdf} disabled={generatingPdf}>{generatingPdf ? '⏳ Generando...' : '🖨️ PDF'}</button>
      {['borrador', 'enviada', 'vista'].includes(status) && (
        <Link href={`/ordenes-cambio/${orderId}/editar`} className="btn btn-ghost">✏️ Editar</Link>
      )}
      {status !== 'borrador' && (
        <button className="btn btn-ghost" onClick={copyLink}>{copied ? '✅ Copiado' : '🔗 Copiar link'}</button>
      )}
      {status === 'borrador' && <button className="btn btn-primary" onClick={() => setShowEmail(true)}>📤 Enviar</button>}
      {['enviada', 'vista'].includes(status) && (
        <button className="btn btn-ghost" onClick={() => setShowEmail(true)}>↻ Reenviar</button>
      )}
      {status === 'aprobada' && <span className="badge badge-green" style={{ padding: '8px 16px', fontSize: 13 }}>✅ Aprobada</span>}
      {status === 'rechazada' && <span className="badge badge-red" style={{ padding: '8px 16px', fontSize: 13 }}>Rechazada</span>}
      <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: '#fca5a5' }} onClick={() => setShowDelete(true)}>🗑</button>

      {showEmail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Enviar orden de cambio por email</h2>
            <form onSubmit={sendEmail}>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Para</label>
                {toOptions.length > 0 && (
                  <select value={isCustomEmail ? '__custom__' : emailTo} onChange={e => setEmailTo(e.target.value === '__custom__' ? '' : e.target.value)}>
                    {toOptions.map(o => <option key={o.email} value={o.email}>{o.label} — {o.email}</option>)}
                    <option value="__custom__">Otro correo...</option>
                  </select>
                )}
                {(toOptions.length === 0 || isCustomEmail) && (
                  <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="cliente@email.com" required autoFocus={toOptions.length > 0} style={toOptions.length > 0 ? { marginTop: 8 } : undefined} />
                )}
              </div>

              {clientContacts.filter(c => c.email).length > 0 && (
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Copiar a (CC)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, border: '1.5px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                    {clientContacts.filter(c => c.email).map(c => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" checked={emailCc.includes(c.email)} onChange={() => toggleCcContact(c.email)} />
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        <span style={{ color: 'var(--muted)' }}>{c.email}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 20 }}>
                <label>Otros correos en copia (opcional)</label>
                <input value={emailCcExtra} onChange={e => setEmailCcExtra(e.target.value)} placeholder="correo1@ejemplo.com, correo2@ejemplo.com" />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={sending} style={{ flex: 1, justifyContent: 'center' }}>{sending ? 'Enviando...' : '📧 Enviar'}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEmail(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar orden de cambio?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteOrder} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger-tint)', color: 'var(--warn)', border: 'none' }}>
                {deleting ? 'Eliminando...' : '🗑 Sí, eliminar'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
