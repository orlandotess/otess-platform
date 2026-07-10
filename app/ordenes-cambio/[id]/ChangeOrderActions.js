'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { openPdfPreview } from '../../../lib/openPdfPreview';

export default function ChangeOrderActions({ orderId, status, clientEmail, orderNumber, publicToken }) {
  const router = useRouter();
  const [showEmail, setShowEmail] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [emailTo, setEmailTo] = useState(clientEmail || '');
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');

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

  async function sendEmail(e) {
    e.preventDefault();
    setSending(true);
    const res = await fetch('/api/ordenes-cambio/enviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, toEmail: emailTo }),
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
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Enviar orden de cambio por email</h2>
            <form onSubmit={sendEmail}>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label>Email del cliente</label>
                <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="cliente@email.com" required />
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
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar orden de cambio?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteOrder} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: '#fdecea', color: 'var(--warn)', border: 'none' }}>
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
