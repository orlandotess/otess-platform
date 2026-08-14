'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { openPdfPreview } from '../../../lib/openPdfPreview';
import { useTranslations } from 'next-intl';

export default function ChangeOrderActions({ orderId, status, clientEmail, clientName, orderNumber, publicToken, clientContacts = [] }) {
  const t = useTranslations('ordenesCambio.actions');
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
    ...(clientEmail ? [{ label: clientName ? t('emailModal.clientLabelWithName', { name: clientName }) : t('emailModal.clientLabel'), email: clientEmail }] : []),
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
    else alert(t('errorWithMessage', { error: data.error }));
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
      alert(t('deleteError', { error: error.message }));
      return;
    }
    window.location.href = '/ordenes-cambio';
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <button className="btn btn-ghost" onClick={handlePdf} disabled={generatingPdf}>{generatingPdf ? t('generatingPdf') : t('pdf')}</button>
      {['borrador', 'enviada', 'vista'].includes(status) && (
        <Link href={`/ordenes-cambio/${orderId}/editar`} className="btn btn-ghost">{t('edit')}</Link>
      )}
      {status !== 'borrador' && (
        <button className="btn btn-ghost" onClick={copyLink}>{copied ? t('copied') : t('copyLink')}</button>
      )}
      {status === 'borrador' && <button className="btn btn-primary" onClick={() => setShowEmail(true)}>{t('send')}</button>}
      {['enviada', 'vista'].includes(status) && (
        <button className="btn btn-ghost" onClick={() => setShowEmail(true)}>{t('resend')}</button>
      )}
      {status === 'aprobada' && <span className="badge badge-green" style={{ padding: '8px 16px', fontSize: 13 }}>{t('approvedBadge')}</span>}
      {status === 'rechazada' && <span className="badge badge-red" style={{ padding: '8px 16px', fontSize: 13 }}>{t('rejectedBadge')}</span>}
      <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }} onClick={() => setShowDelete(true)}>🗑</button>

      {showEmail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>{t('emailModal.title')}</h2>
            <form onSubmit={sendEmail}>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>{t('emailModal.to')}</label>
                {toOptions.length > 0 && (
                  <select value={isCustomEmail ? '__custom__' : emailTo} onChange={e => setEmailTo(e.target.value === '__custom__' ? '' : e.target.value)}>
                    {toOptions.map(o => <option key={o.email} value={o.email}>{o.label} — {o.email}</option>)}
                    <option value="__custom__">{t('emailModal.other')}</option>
                  </select>
                )}
                {(toOptions.length === 0 || isCustomEmail) && (
                  <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder={t('emailModal.emailPlaceholder')} required autoFocus={toOptions.length > 0} style={toOptions.length > 0 ? { marginTop: 8 } : undefined} />
                )}
              </div>

              {clientContacts.filter(c => c.email).length > 0 && (
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>{t('emailModal.cc')}</label>
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
                <label>{t('emailModal.ccExtra')}</label>
                <input value={emailCcExtra} onChange={e => setEmailCcExtra(e.target.value)} placeholder={t('emailModal.ccExtraPlaceholder')} />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={sending} style={{ flex: 1, justifyContent: 'center' }}>{sending ? t('emailModal.sending') : t('emailModal.sendBtn')}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEmail(false)}>{t('emailModal.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>{t('deleteModal.title')}</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>{t('deleteModal.body')}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteOrder} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger-tint)', color: 'var(--warn)', border: 'none' }}>
                {deleting ? t('deleteModal.deleting') : t('deleteModal.confirm')}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>{t('deleteModal.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
