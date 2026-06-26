'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';

const methodLabel = { cash: 'Efectivo', check: 'Cheque', card: 'Tarjeta', transfer: 'Transferencia' };

export default function InvoiceActions({ invoiceId, status, clientEmail, showPaymentOnly = false, balance = 0 }) {
  const router = useRouter();
  const [showPayment, setShowPayment] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [payment, setPayment] = useState({ amount: balance || '', method: 'cash', reference: '', notes: '', paid_at: new Date().toISOString().split('T')[0] });
  const [emailTo, setEmailTo] = useState(clientEmail || '');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function updateStatus(newStatus) {
    await supabase.from('invoices').update({ status: newStatus }).eq('id', invoiceId);
    router.refresh();
  }

  async function savePayment(e) {
    e.preventDefault();
    setSaving(true);
    await supabase.from('payments').insert([{
      invoice_id: invoiceId,
      amount: parseFloat(payment.amount),
      method: payment.method,
      reference: payment.reference || null,
      notes: payment.notes || null,
      paid_at: payment.paid_at,
    }]);
    const { data: allPayments } = await supabase.from('payments').select('amount').eq('invoice_id', invoiceId);
    const { data: inv } = await supabase.from('invoices').select('total').eq('id', invoiceId).single();
    const totalPaid = allPayments?.reduce((a, p) => a + Number(p.amount), 0) ?? 0;
    if (totalPaid >= Number(inv?.total)) {
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
    if (data.success) {
      setEmailSent(true);
      setShowEmail(false);
      router.refresh();
    } else {
      alert('Error: ' + data.error);
    }
  }

  if (showPaymentOnly) {
    return (
      <>
        <button className="btn btn-amber" onClick={() => setShowPayment(true)}>+ Registrar pago</button>
        {showPayment && <PaymentModal payment={payment} setPayment={setPayment} onSave={savePayment} onClose={() => setShowPayment(false)} saving={saving} balance={balance} />}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <button className="btn btn-ghost" onClick={() => window.print()}>🖨️ PDF</button>
      <button className="btn btn-ghost" onClick={() => setShowEmail(true)}>📧 Enviar email</button>
      {status === 'draft' && <button className="btn btn-primary" onClick={() => updateStatus('sent')}>📤 Marcar enviada</button>}
      {status === 'sent' && (
        <>
          <button className="btn btn-amber" onClick={() => setShowPayment(true)}>💰 Registrar pago</button>
          <button className="btn btn-ghost" onClick={() => updateStatus('cancelled')}>Cancelar</button>
        </>
      )}
      {status === 'paid' && <span className="badge badge-green" style={{ padding: '8px 16px', fontSize: 13 }}>✅ Pagada</span>}
      {emailSent && <span className="badge badge-green" style={{ padding: '8px 16px', fontSize: 13 }}>✅ Email enviado</span>}

      {showEmail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
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
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Registrar pago</h2>
        <form onSubmit={onSave}>
          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label>Monto *</label>
              <input type="number" value={payment.amount} onChange={e => set('amount', e.target.value)} step="0.01" min="0.01" placeholder={`Máx $${Number(balance).toFixed(2)}`} required />
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
