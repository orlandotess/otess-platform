'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { exportPurchaseListCSV } from '../../purchaseListCsv';
import { generatePurchaseOrders } from '../../../lib/generatePurchaseOrders';
import { buildChecklistItemsFromLineItems } from '../../../lib/generateChecklistFromLineItems';
import { openPdfPreview } from '../../../lib/openPdfPreview';
import { localInputToIso } from '../../../lib/datetimeLocal';
import { useTranslations } from 'next-intl';

export default function EstimateActions({ estimateId, status, clientId, clientEmail, estimateNumber, title: initialTitle = '', clientName, clientCompany, billTo: initialBillTo = 'person', clientProperties = [], propertyId: initialPropertyId = null, initialProperty = null, terms: initialTerms = '', notes = '', items = [], clientContacts = [], convertedToJobId = null, archivedAt: initialArchivedAt = null }) {
  const router = useRouter();
  const t = useTranslations('estimados.actions');
  const tPurchaseListCsv = useTranslations('shared.purchaseListCsv');
  const [archivedAt, setArchivedAt] = useState(initialArchivedAt);
  const [archiving, setArchiving] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showEditNumber, setShowEditNumber] = useState(false);
  const [showEditTitle, setShowEditTitle] = useState(false);
  const [showEditBillTo, setShowEditBillTo] = useState(false);
  const [showEditProperty, setShowEditProperty] = useState(false);
  const [showEditTerms, setShowEditTerms] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [newNumber, setNewNumber] = useState(estimateNumber || '');
  const [title, setTitle] = useState(initialTitle || '');
  const [billTo, setBillTo] = useState(initialBillTo);
  const [propertyId, setPropertyId] = useState(initialPropertyId || '');
  const [terms, setTerms] = useState(initialTerms || '');
  const [emailTo, setEmailTo] = useState(clientEmail || '');
  const [emailCc, setEmailCc] = useState([]);
  const [emailCcExtra, setEmailCcExtra] = useState('');
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convScheduledStart, setConvScheduledStart] = useState('');
  const [convScheduledEnd, setConvScheduledEnd] = useState('');

  const billToName = billTo === 'company' && clientCompany ? clientCompany : clientName;

  const toOptions = [
    ...(clientEmail ? [{ label: clientName ? t('emailModal.clientLabelWithName', { name: clientName }) : t('emailModal.clientLabel'), email: clientEmail }] : []),
    ...clientContacts.filter(c => c.email).map(c => ({ label: c.name, email: c.email })),
  ];
  const isCustomEmail = !toOptions.some(o => o.email === emailTo);

  async function handlePdf() {
    setGeneratingPdf(true);
    try {
      await openPdfPreview('estimate-doc', `${estimateNumber}.pdf`);
    } catch (err) {
      console.error('PDF error:', err);
    }
    setGeneratingPdf(false);
  }

  async function updateStatus(newStatus) {
    const patch = { status: newStatus };
    if (newStatus === 'accepted') patch.accepted_at = new Date().toISOString();
    await supabase.from('estimates').update(patch).eq('id', estimateId);
    router.refresh();
  }

  async function convertToJob(e) {
    e.preventDefault();
    setConverting(true);
    try {
      const { data: last } = await supabase.from('jobs').select('job_number').order('created_at', { ascending: false }).limit(1).single();
      let nextNum = 1001;
      if (last?.job_number) {
        const n = parseInt(last.job_number.replace('JOB-', ''));
        if (!isNaN(n)) nextNum = n + 1;
      }
      const jobNumber = `JOB-${nextNum}`;
      const prop = clientProperties.find(p => p.id === propertyId) || (!propertyId ? initialProperty : null);
      const hasSchedule = !!(convScheduledStart && convScheduledEnd);

      const { data: job, error: jobErr } = await supabase.from('jobs').insert([{
        job_number: jobNumber,
        client_id: clientId,
        title: billToName || estimateNumber,
        status: hasSchedule ? 'scheduled' : 'estimate',
        notes: notes || null,
        bill_to: billTo,
        scheduled_start: hasSchedule ? localInputToIso(convScheduledStart) : null,
        scheduled_end: hasSchedule ? localInputToIso(convScheduledEnd) : null,
        property_id: propertyId || null,
        property_name: prop?.name || null,
        street: prop?.street || null,
        city: prop?.city || null,
        state: prop?.state || null,
        zip: prop?.zip || null,
      }]).select().single();
      if (jobErr) { alert(t('errorWithMessage', { error: jobErr.message })); return; }

      let poMessage = null;
      if (items.length) {
        const { data: insertedItems, error: itemsErr } = await supabase.from('job_line_items').insert(items.map(i => ({
          job_id: job.id, type: i.type, title: i.title, description: i.description,
          quantity: i.quantity, unit_price: i.unit_price, msrp: i.msrp,
          supplier_price: i.supplier_price, exempt_reason: i.exempt_reason,
          area: i.area, vendor: i.vendor, photo_url: i.photo_url, sort_order: i.sort_order,
        }))).select();
        if (itemsErr) { alert(t('errorWithMessage', { error: itemsErr.message })); return; }

        try {
          const normalized = (insertedItems ?? []).map(it => ({
            id: it.id, description: it.description, quantity: it.quantity, unit_price: it.unit_price,
            supplier_price: it.supplier_price, vendor: it.vendor, isProduct: it.type === 'product',
          }));
          const { orders } = await generatePurchaseOrders(normalized, {
            sourceType: 'job', sourceId: job.id, sourceLabel: `${jobNumber} — ${billToName || estimateNumber}`,
          });
          if (orders.length) poMessage = t('poGenerated', { count: orders.length });
        } catch (poErr) {
          console.error('Error generando orden de compra automática:', poErr);
        }

        try {
          const checklistItems = buildChecklistItemsFromLineItems(insertedItems, job.id);
          if (checklistItems.length) {
            const { error: checklistErr } = await supabase.from('job_checklist_items').insert(checklistItems);
            if (checklistErr) throw checklistErr;
          }
        } catch (checklistErr) {
          console.error('Error generando checklist automático:', checklistErr);
        }
      }

      if (notes) {
        await supabase.from('job_notes').insert([{ job_id: job.id, note: notes }]);
      }

      await supabase.from('estimates').update({ status: 'converted', converted_to_job_id: job.id }).eq('id', estimateId);
      if (poMessage) alert(poMessage);
      router.push(`/trabajos/${job.id}`);
    } finally {
      setConverting(false);
    }
  }

  function toggleCcContact(email) {
    setEmailCc(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  }

  async function sendEmail(e) {
    e.preventDefault();
    setSending(true);
    const extraCc = emailCcExtra.split(',').map(s => s.trim()).filter(Boolean);
    const cc = [...new Set([...emailCc, ...extraCc])];
    const res = await fetch('/api/send-estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estimateId, toEmail: emailTo, cc }),
    });
    const data = await res.json();
    setSending(false);
    if (data.success) { setEmailSent(true); setShowEmail(false); router.refresh(); }
    else alert(t('errorWithMessage', { error: data.error }));
  }

  async function saveNumber(e) {
    e.preventDefault();
    if (!newNumber.trim()) return;
    await supabase.from('estimates').update({ estimate_number: newNumber.trim() }).eq('id', estimateId);
    setShowEditNumber(false);
    router.refresh();
  }

  async function saveTitle(e) {
    e.preventDefault();
    await supabase.from('estimates').update({ title: title.trim() || null }).eq('id', estimateId);
    setShowEditTitle(false);
    router.refresh();
  }

  async function saveBillTo(e) {
    e.preventDefault();
    await supabase.from('estimates').update({ bill_to: billTo }).eq('id', estimateId);
    setShowEditBillTo(false);
    router.refresh();
  }

  async function saveProperty(e) {
    e.preventDefault();
    await supabase.from('estimates').update({ property_id: propertyId || null }).eq('id', estimateId);
    setShowEditProperty(false);
    router.refresh();
  }

  async function saveTerms(e) {
    e.preventDefault();
    await supabase.from('estimates').update({ terms: terms || null }).eq('id', estimateId);
    setShowEditTerms(false);
    router.refresh();
  }

  async function toggleArchive() {
    setArchiving(true);
    const newValue = archivedAt ? null : new Date().toISOString();
    const { error } = await supabase.from('estimates').update({ archived_at: newValue }).eq('id', estimateId);
    setArchiving(false);
    if (error) { alert(t('archiveError', { error: error.message })); return; }
    setArchivedAt(newValue);
    router.refresh();
  }

  async function deleteEstimate() {
    setDeleting(true);
    await supabase.from('estimate_views').delete().eq('estimate_id', estimateId);
    const { error } = await supabase.from('estimates').delete().eq('id', estimateId);
    if (error) {
      setDeleting(false);
      alert(t('deleteError', { error: error.message }));
      return;
    }
    window.location.href = '/estimados';
  }

  const moreItems = [
    { key: 'purchase', label: `📦 ${t('menu.purchaseList')}`, onClick: () => exportPurchaseListCSV(items, estimateNumber, tPurchaseListCsv) },
    ['draft', 'sent'].includes(status) && { key: 'items', label: `🧾 ${t('menu.editLines')}`, onClick: () => router.push(`/estimados/${estimateId}/editar`) },
    { key: 'number', label: `✏️ ${t('menu.editNumber')}`, onClick: () => { setNewNumber(estimateNumber); setShowEditNumber(true); } },
    { key: 'title', label: `✏️ ${t('menu.editTitle')}`, onClick: () => { setTitle(initialTitle); setShowEditTitle(true); } },
    clientCompany && { key: 'billto', label: `👤 ${t('menu.billTo')}`, onClick: () => setShowEditBillTo(true) },
    clientProperties.length > 0 && { key: 'property', label: `🏠 ${t('menu.property')}`, onClick: () => setShowEditProperty(true) },
    { key: 'terms', label: `📋 ${t('menu.terms')}`, onClick: () => setShowEditTerms(true) },
    { key: 'archive', label: archiving ? `⏳ ${t('saving')}` : archivedAt ? `📤 ${t('menu.unarchive')}` : `📦 ${t('menu.archive')}`, onClick: toggleArchive },
    { key: 'delete', label: `🗑 ${t('menu.deleteEstimate')}`, onClick: () => setShowDelete(true), warn: true },
  ].filter(Boolean);

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', position: 'relative' }}>
      <button className="btn btn-ghost" onClick={handlePdf} disabled={generatingPdf}>
        {generatingPdf ? `⏳ ${t('generatingPdf')}` : '🖨️ PDF'}
      </button>
      <button className="btn btn-ghost" onClick={() => setShowEmail(true)}>📧 {t('emailBtn')}</button>
      {status === 'draft' && <button className="btn btn-primary" onClick={() => updateStatus('sent')}>📤 {t('send')}</button>}
      {status === 'sent' && (
        <>
          <span className="badge badge-blue" style={{ padding: '8px 16px', fontSize: 13 }}>📤 {t('sentBadge')}</span>
          <button className="btn btn-primary" onClick={() => updateStatus('accepted')}>✓ {t('markAsAccepted')}</button>
          <button className="btn btn-ghost" onClick={() => updateStatus('cancelled')}>{t('cancel')}</button>
        </>
      )}
      {status === 'accepted' && (
        <>
          <span className="badge badge-green" style={{ padding: '8px 16px', fontSize: 13 }}>✅ {t('acceptedBadge')}</span>
          <button className="btn btn-amber" onClick={() => setShowConvert(true)} disabled={converting}>
            {converting ? t('converting') : `🔧 ${t('convertToJob')}`}
          </button>
          <button className="btn btn-ghost" onClick={() => updateStatus('cancelled')}>{t('cancel')}</button>
        </>
      )}
      {status === 'converted' && (
        <>
          <span className="badge badge-amber" style={{ padding: '8px 16px', fontSize: 13 }}>🔧 {t('convertedBadge')}</span>
          {convertedToJobId && <Link href={`/trabajos/${convertedToJobId}`} className="btn btn-ghost">{t('viewJob')} →</Link>}
        </>
      )}
      {status === 'cancelled' && (
        <>
          <span className="badge badge-red" style={{ padding: '8px 16px', fontSize: 13 }}>{t('cancelledBadge')}</span>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => updateStatus('sent')}>{t('revertToSent')}</button>
        </>
      )}
      {emailSent && <span className="badge badge-green" style={{ padding: '8px 16px', fontSize: 13 }}>✅ {t('sentEmailBadge')}</span>}
      {archivedAt && <span className="badge badge-gray" style={{ padding: '8px 16px', fontSize: 13 }}>📦 {t('archivedBadge')}</span>}

      <button className="btn btn-ghost" onClick={() => setShowMore(v => !v)}>⋯ {t('more')}</button>
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

      {/* Edit terms */}
      {showEditTerms && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 560, maxHeight: '80vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>{t('termsModal.title')}</h2>
            <form onSubmit={saveTerms}>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={10} style={{ fontSize: 13, lineHeight: 1.7, width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setTerms(t('defaultTerms'))}>
                  {t('termsModal.useDefault')}
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }}>{t('save')}</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowEditTerms(false)}>{t('cancel')}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit property */}
      {showEditProperty && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>{t('propertyModal.title')}</h2>
            <form onSubmit={saveProperty}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer', padding: '12px 16px', borderRadius: 10, border: `2px solid ${!propertyId ? 'var(--navy)' : 'var(--border)'}`, background: !propertyId ? 'var(--info-tint)' : 'var(--surface)' }}>
                  <input type="radio" name="property" value="" checked={!propertyId} onChange={() => setPropertyId('')} />
                  <div>
                    <div style={{ fontWeight: 700 }}>{t('propertyModal.none')}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('propertyModal.noneDesc')}</div>
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
                <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{t('save')}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditProperty(false)}>{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit bill to */}
      {showEditBillTo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>{t('billToModal.title')}</h2>
            <form onSubmit={saveBillTo}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, cursor: 'pointer', padding: '12px 16px', borderRadius: 10, border: `2px solid ${billTo === 'person' ? 'var(--navy)' : 'var(--border)'}`, background: billTo === 'person' ? 'var(--info-tint)' : 'var(--surface)' }}>
                  <input type="radio" name="bill_to" value="person" checked={billTo === 'person'} onChange={() => setBillTo('person')} />
                  <div>
                    <div style={{ fontWeight: 700 }}>{clientName}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('billToModal.person')}</div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, cursor: 'pointer', padding: '12px 16px', borderRadius: 10, border: `2px solid ${billTo === 'company' ? 'var(--navy)' : 'var(--border)'}`, background: billTo === 'company' ? 'var(--info-tint)' : 'var(--surface)' }}>
                  <input type="radio" name="bill_to" value="company" checked={billTo === 'company'} onChange={() => setBillTo('company')} />
                  <div>
                    <div style={{ fontWeight: 700 }}>{clientCompany}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('billToModal.company')}</div>
                  </div>
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{t('save')}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditBillTo(false)}>{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit estimate number */}
      {showEditNumber && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>{t('numberModal.title')}</h2>
            <form onSubmit={saveNumber}>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label>{t('numberModal.label')}</label>
                <input value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="EST-1001" required />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{t('save')}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditNumber(false)}>{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit title */}
      {showEditTitle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 420 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>{t('titleModal.title')}</h2>
            <form onSubmit={saveTitle}>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label>{t('titleModal.label')}</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('titleModal.placeholder')} autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{t('save')}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditTitle(false)}>{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Convert to job */}
      {showConvert && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 420 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 8 }}>{t('convertModal.title')}</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>{t('convertModal.body')}</p>
            <form onSubmit={convertToJob}>
              <div className="form-group">
                <label>{t('convertModal.startLabel')}</label>
                <input type="datetime-local" value={convScheduledStart} onChange={e => setConvScheduledStart(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label>{t('convertModal.endLabel')}</label>
                <input type="datetime-local" value={convScheduledEnd} onChange={e => setConvScheduledEnd(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={converting} style={{ flex: 1, justifyContent: 'center' }}>
                  {converting ? t('converting') : (convScheduledStart && convScheduledEnd) ? t('convertModal.convertAndSchedule') : t('convertModal.convert')}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowConvert(false)} disabled={converting}>{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>{t('deleteModal.title')}</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>{t('deleteModal.body')}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteEstimate} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger-tint)', color: 'var(--warn)', border: 'none' }}>
                {deleting ? t('deleting') : `🗑 ${t('deleteModal.confirm')}`}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Email modal */}
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
                <button type="submit" className="btn btn-primary" disabled={sending} style={{ flex: 1, justifyContent: 'center' }}>
                  {sending ? t('sending') : `📧 ${t('send')}`}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEmail(false)}>{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
