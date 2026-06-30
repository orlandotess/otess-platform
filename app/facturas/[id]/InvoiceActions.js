'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';

const methodLabel = { cash: 'Efectivo', check: 'Cheque', card: 'Tarjeta', transfer: 'Transferencia' };

const DEFAULT_TERMS = `Garantía del Servicio: OTESS se compromete a brindar soporte técnico y mantenimiento correctivo sobre la instalación y configuración de los sistemas implementados por un período de un (1) año a partir de la fecha de finalización del proyecto.

Garantía de los Equipos: La garantía de los equipos y dispositivos instalados está sujeta a los términos y condiciones establecidos por el fabricante o suplidor. OTESS gestionará el proceso de garantía con el proveedor correspondiente en caso de defectos de fabricación dentro del período estipulado por el fabricante. No obstante, los tiempos de respuesta y el alcance de dicha garantía dependerán exclusivamente de la política del suplidor.`;

export default function InvoiceActions({ invoiceId, status, clientEmail, invoiceNumber, showPaymentOnly = false, balance = 0, clientName, clientCompany, billTo: initialBillTo = 'person', clientProperties = [], propertyId: initialPropertyId = null, terms: initialTerms = '' }) {
  const router = useRouter();
  const [showPayment, setShowPayment] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showEditNumber, setShowEditNumber] = useState(false);
  const [showEditBillTo, setShowEditBillTo] = useState(false);
  const [showEditProperty, setShowEditProperty] = useState(false);
  const [showEditTerms, setShowEditTerms] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [newNumber, setNewNumber] = useState(invoiceNumber || '');
  const [billTo, setBillTo] = useState(initialBillTo);
  const [propertyId, setPropertyId] = useState(initialPropertyId || '');
  const [terms, setTerms] = useState(initialTerms || DEFAULT_TERMS);
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
      const html2pdf = (await import('html2pdf.js')).default;
      const element = document.getElementById('invoice-doc');
      const opt = {
        margin: 0.5,
        filename: `${invoiceNumber}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
      };
      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error('PDF error:', err);
    }
    setGeneratingPdf(false);
  }

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

  async function deleteInvoice() {
    setDeleting(true);
    await supabase.from('payments').delete().eq('invoice_id', invoiceId);
    await supabase.from('invoice_line_items').delete().eq('invoice_id', invoiceId);
    await supabase.from('invoices').delete().eq('id', invoiceId);
    router.push('/facturas');
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
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <button className="btn btn-ghost" onClick={handlePdf} disabled={generatingPdf}>
        {generatingPdf ? '⏳ Generando...' : '🖨️ PDF'}
      </button>
      <button className="btn btn-ghost" onClick={() => setShowEmail(true)}>📧 Email</button>
      <button className="btn btn-ghost" onClick={() => { setNewNumber(invoiceNumber); setShowEditNumber(true); }}>✏️ # Factura</button>
      {clientCompany && (
        <button className="btn btn-ghost" onClick={() => setShowEditBillTo(true)}>👤 Facturar a</button>
      )}
      {clientProperties.length > 0 && (
        <button className="btn btn-ghost" onClick={() => setShowEditProperty(true)}>🏠 Propiedad</button>
      )}
      <button className="btn btn-ghost" onClick={() => setShowEditTerms(true)}>📋 Términos</button>
      {status === 'draft' && <button className="btn btn-primary" onClick={() => updateStatus('sent')}>📤 Enviar</button>}
      {status === 'sent' && (
        <>
          <button className="btn btn-amber" onClick={() => setShowPayment(true)}>💰 Pago</button>
          <button className="btn btn-ghost" onClick={() => updateStatus('cancelled')}>Cancelar</button>
        </>
      )}
      {status === 'paid' && <span className="badge badge-green" style={{ padding: '8px 16px', fontSize: 13 }}>✅ Pagada</span>}
      {emailSent && <span className="badge badge-green" style={{ padding: '8px 16px', fontSize: 13 }}>✅ Enviado</span>}
      <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: '#fca5a5' }} onClick={() => setShowDelete(true)}>🗑</button>

      {/* Edit terms */}
      {showEditTerms && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 560, maxHeight: '80vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Términos del Proyecto</h2>
            <form onSubmit={saveTerms}>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={10} style={{ fontSize: 13, lineHeight: 1.7, width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setTerms(DEFAULT_TERMS)}>
                  Restaurar predeterminado
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }}>Guardar</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowEditTerms(false)}>Cancelar</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit property */}
      {showEditProperty && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Propiedad del servicio</h2>
            <form onSubmit={saveProperty}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer', padding: '12px 16px', borderRadius: 10, border: `2px solid ${!propertyId ? 'var(--navy)' : 'var(--border)'}`, background: !propertyId ? '#f0f4ff' : '#fff' }}>
                  <input type="radio" name="property" value="" checked={!propertyId} onChange={() => setPropertyId('')} />
                  <div>
                    <div style={{ fontWeight: 700 }}>Sin propiedad</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>No asignar propiedad</div>
                  </div>
                </label>
                {clientProperties.map(p => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer', padding: '12px 16px', borderRadius: 10, border: `2px solid ${propertyId === p.id ? 'var(--navy)' : 'var(--border)'}`, background: propertyId === p.id ? '#f0f4ff' : '#fff' }}>
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
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Facturar a</h2>
            <form onSubmit={saveBillTo}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, cursor: 'pointer', padding: '12px 16px', borderRadius: 10, border: `2px solid ${billTo === 'person' ? 'var(--navy)' : 'var(--border)'}`, background: billTo === 'person' ? '#f0f4ff' : '#fff' }}>
                  <input type="radio" name="bill_to" value="person" checked={billTo === 'person'} onChange={() => setBillTo('person')} />
                  <div>
                    <div style={{ fontWeight: 700 }}>{clientName}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Persona</div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, cursor: 'pointer', padding: '12px 16px', borderRadius: 10, border: `2px solid ${billTo === 'company' ? 'var(--navy)' : 'var(--border)'}`, background: billTo === 'company' ? '#f0f4ff' : '#fff' }}>
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
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 380 }}>
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
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar factura?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Se eliminarán también los pagos asociados. Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteInvoice} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: '#fdecea', color: 'var(--warn)', border: 'none' }}>
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
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400 }}>
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
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 420 }}>
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
