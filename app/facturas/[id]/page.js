export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { Fragment } from 'react';
import Link from 'next/link';
import { supabaseServer as supabase } from '../../../lib/supabase';
import { fallbackLineItems } from '../../../lib/ivu';
import { displayTitle } from '../../../lib/lineItemTitle';
import Sidebar from '../../Sidebar';
import InvoiceActions from './InvoiceActions';
import PaymentsTable from './PaymentsTable';
import { getTranslations } from 'next-intl/server';

export default async function FacturaDetail(props) {
  const params = await props.params;
  const { id } = params;
  const t = await getTranslations('facturas.detail');

  const [{ data: inv }, { data: items }, { data: payments }, { data: internalAttachments }, { data: invoiceRetenciones }] = await Promise.all([
    supabase.from('invoices').select('*, client_id, clients(name, email, phone, company, client_type, client_addresses(*), client_properties(*)), jobs(id, title, client_properties(*))').eq('id', id).single(),
    supabase.from('invoice_line_items').select('*').eq('invoice_id', id).order('sort_order'),
    supabase.from('payments').select('*').eq('invoice_id', id).order('paid_at'),
    supabase.from('invoice_internal_attachments').select('*').eq('invoice_id', id).order('created_at', { ascending: false }),
    supabase.from('retenciones').select('id, retencion_aplicada, fecha').eq('invoice_id', id),
  ]);



  if (!inv) return <div style={{ padding: 40 }}>{t('notFound')}</div>;

  let attachedNotes = [];
  if (inv.attached_note_ids && inv.attached_note_ids.length > 0) {
    const { data: notes } = await supabase.from('job_notes').select('*').in('id', inv.attached_note_ids);
    attachedNotes = await Promise.all((notes ?? []).map(async n => {
      const paths = n.photo_urls && n.photo_urls.length > 0 ? n.photo_urls : (n.photo_url ? [n.photo_url] : []);
      const signedUrls = await Promise.all(paths.map(async p => {
        const { data: sd } = await supabase.storage.from('Job-photos').createSignedUrl(p, 86400);
        return sd?.signedUrl ?? null;
      }));
      return { ...n, signedUrls: signedUrls.filter(Boolean) };
    }));
  }

  const { data: clientContacts } = inv.client_id
    ? await supabase.from('client_contacts').select('id, name, email').eq('client_id', inv.client_id)
    : { data: [] };

  const totalPaid = payments?.reduce((a, p) => a + Number(p.amount), 0) ?? 0;
  const totalRetained = invoiceRetenciones?.reduce((a, r) => a + Number(r.retencion_aplicada ?? 0), 0) ?? 0;
  const balance = Number(inv.total) - totalPaid - totalRetained;

  // Account balance — all pending invoices for this client, net of their own
  // payments and retenciones (so it reflects what the client actually still owes).
  const clientId = inv?.client_id ?? null;
  const { data: clientInvoices } = clientId ? await supabase
    .from('invoices')
    .select('id, total, status')
    .eq('client_id', clientId)
    .in('status', ['sent', 'draft'])
    .neq('id', id) : { data: [] };
  const otherIds = (clientInvoices ?? []).map(i => i.id);
  const [{ data: otherPayments }, { data: otherRetenciones }] = await Promise.all([
    otherIds.length ? supabase.from('payments').select('invoice_id, amount').in('invoice_id', otherIds) : Promise.resolve({ data: [] }),
    otherIds.length ? supabase.from('retenciones').select('invoice_id, retencion_aplicada').in('invoice_id', otherIds) : Promise.resolve({ data: [] }),
  ]);
  const paidByInvoice = {};
  (otherPayments ?? []).forEach(p => { paidByInvoice[p.invoice_id] = (paidByInvoice[p.invoice_id] ?? 0) + Number(p.amount ?? 0); });
  const retainedByInvoice = {};
  (otherRetenciones ?? []).forEach(r => { retainedByInvoice[r.invoice_id] = (retainedByInvoice[r.invoice_id] ?? 0) + Number(r.retencion_aplicada ?? 0); });
  const otherBalance = (clientInvoices ?? []).reduce((a, i) => {
    const remaining = Number(i.total ?? 0) - (paidByInvoice[i.id] ?? 0) - (retainedByInvoice[i.id] ?? 0);
    return a + Math.max(remaining, 0);
  }, 0);
  const accountBalance = otherBalance + balance;
  const primaryAddr = inv.clients?.client_addresses?.find(a => a.is_primary) ?? inv.clients?.client_addresses?.[0];
  const clientProperties = inv.clients?.client_properties ?? [];
  const property = inv.property_id
    ? clientProperties.find(p => p.id === inv.property_id) ?? null
    : inv.jobs?.client_properties ?? null;

  const billToName = inv.bill_to === 'company' && inv.clients?.company
    ? inv.clients.company
    : inv.clients?.name;

  const rawItems = items?.length ? items : fallbackLineItems(inv);
  const isFallbackItems = !items?.length && rawItems.length > 0;
  const displayItems = await Promise.all(rawItems.map(async item => {
    if (!item.photo_url) return item;
    const { data } = await supabase.storage.from('Job-photos').createSignedUrl(item.photo_url, 3600);
    return { ...item, photo_signed_url: data?.signedUrl ?? null };
  }));
  const statusLabel = { draft: t('status.draft'), sent: t('status.sent'), paid: t('status.paid'), cancelled: t('status.cancelled') };
  const statusCls = { draft: 'badge-gray', sent: 'badge-blue', paid: 'badge-green', cancelled: 'badge-red' };
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = inv.status === 'sent' && inv.due_at && inv.due_at < today;
  const fmt = n => Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Groups top-level items into named area sections (Piso 1, Piso 2...) and links
  // each accessory (parent_item_id child) under its parent — same shape as
  // app/estimados/[id]/page.js so Facturas renders the same sectioned layout.
  const topLevelItems = displayItems.filter(it => !it.parent_item_id);
  const childrenByParentId = new Map();
  for (const it of displayItems) {
    if (!it.parent_item_id) continue;
    if (!childrenByParentId.has(it.parent_item_id)) childrenByParentId.set(it.parent_item_id, []);
    childrenByParentId.get(it.parent_item_id).push(it);
  }
  const generalAreaName = t('generalArea');
  const displayAreas = [];
  topLevelItems.forEach(it => {
    const name = it.area || generalAreaName;
    let area = displayAreas.find(a => a.name === name);
    if (!area) { area = { name, items: [] }; displayAreas.push(area); }
    area.items.push(it);
  });
  const multiArea = displayAreas.length > 1 || (displayAreas[0]?.name && displayAreas[0].name !== generalAreaName);
  // Every line — parent or accessory — always carries its own real
  // line_total/tax_amount (InvoiceForm.js's itemLineTotal no longer zeroes
  // bundled accessories), so a row's true total is always its own plus its
  // children's, whether or not "Combinar precio" is on.
  function entryTotal(item) {
    const own = Number(item.line_total) + Number(item.tax_amount);
    const childrenTotal = (childrenByParentId.get(item.id) ?? []).reduce((s, c) => s + Number(c.line_total) + Number(c.tax_amount), 0);
    return own + childrenTotal;
  }

  return (
    <div className="admin-shell ds-facturas">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">{inv.invoice_number}</div>
            <span className={`badge ${isOverdue ? 'badge-red' : statusCls[inv.status]}`} style={{ marginTop: 6, display: 'inline-block' }}>
              {isOverdue ? t('overdue') : statusLabel[inv.status]}
            </span>
            {isOverdue && inv.reminders_paused_at && (
              <span className="badge badge-gray" style={{ marginTop: 6, marginLeft: 6, display: 'inline-block' }}>
                {t('remindersPaused')}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {inv.job_id && (
              <Link href={`/trabajos/${inv.job_id}`} className="btn btn-ghost">
                {inv.jobs?.title ? t('viewJobWithTitle', { title: inv.jobs.title }) : t('viewJob')}
              </Link>
            )}
            <InvoiceActions
              invoiceId={id}
              status={inv.status}
              isOverdue={isOverdue}
              remindersPausedAt={inv.reminders_paused_at ?? null}
              balance={balance}
              invoiceNumber={inv.invoice_number}
              clientEmail={inv.clients?.email}
              clientContacts={clientContacts ?? []}
              clientName={inv.clients?.name}
              clientCompany={inv.clients?.company}
              billTo={inv.bill_to ?? 'person'}
              clientProperties={clientProperties}
              propertyId={inv.property_id ?? null}
              terms={inv.terms ?? ''}
              jobId={inv.job_id ?? null}
              attachedNoteIds={inv.attached_note_ids ?? []}
              internalNotes={inv.internal_notes ?? ''}
              internalAttachments={internalAttachments ?? []}
              clientId={inv.client_id ?? null}
              subtotalLabor={inv.subtotal_labor ?? 0}
              existingRetenciones={invoiceRetenciones ?? []}
              issuedAt={inv.issued_at ?? null}
            />
          </div>
        </div>

        <div className="card" id="invoice-doc" style={{ marginBottom: 20, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--navy)', letterSpacing: -1 }}>OTESS</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{t('companyTagline')}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('companyAddressLine1')}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('companyAddressLine2')}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('companyContact')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--navy)', letterSpacing: -1 }}>{t('invoiceHeading')}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--amber)', fontFamily: 'monospace' }}>{inv.invoice_number}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>{t('issuedLabel')} <strong>{inv.issued_at}</strong></div>
              {inv.due_at && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('dueLabel')} <strong>{inv.due_at}</strong></div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: property ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 28 }}>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>{t('billTo')}</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{billToName}</div>
              {inv.bill_to !== 'company' && inv.clients?.company && (
                <div style={{ color: 'var(--muted)', fontSize: 14 }}>{inv.clients.company}</div>
              )}
              {primaryAddr && (
                <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                  {primaryAddr.line1}, {primaryAddr.city} {primaryAddr.zip}
                </div>
              )}
              {inv.clients?.email && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{inv.clients.email}</div>}
              {inv.clients?.phone && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{inv.clients.phone}</div>}
              {inv.clients?.client_type === 'b2b' && (
                <span className="badge badge-blue" style={{ marginTop: 6, display: 'inline-block' }}>{t('b2bBadge')}</span>
              )}
            </div>

            {property && (
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '16px 20px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>{t('serviceProperty')}</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{property.name}</div>
                {property.street && <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>{property.street}</div>}
                {property.city && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{property.city}{property.zip ? `, PR ${property.zip}` : ''}</div>}
              </div>
            )}
          </div>

          {displayAreas.map(area => (
            <div key={area.name} style={{ marginBottom: 24 }}>
              {multiArea && (
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>📍 {area.name}</div>
              )}
              {!multiArea && (
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{t('itemsHeader')}</div>
              )}
              <table style={{ marginBottom: multiArea ? 6 : 0 }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 0', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('table.description')}</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('table.quantity')}</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('table.price')}</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('table.tax')}</th>
                    <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('table.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {area.items.map(item => {
                    const children = childrenByParentId.get(item.id) ?? [];
                    const showTitle = displayTitle(item.title, item.description);
                    return (
                    <Fragment key={item.id}>
                      <tr style={{ borderBottom: children.length ? 'none' : '1px solid var(--border)', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                        <td style={{ padding: '14px 10px 14px 0' }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                              {item.photo_signed_url ? <img src={item.photo_signed_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span>{item.type === 'labor' ? '🔧' : '📦'}</span>}
                            </div>
                            <div>
                              {showTitle && <div style={{ fontWeight: 700, fontSize: 14 }}>{item.title}</div>}
                              <div style={{ fontWeight: showTitle ? 400 : 700, fontSize: showTitle ? 13 : 14, color: showTitle ? 'var(--muted)' : undefined, whiteSpace: 'pre-wrap' }}>{item.description}</div>
                              {item.note?.trim() && <div style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic', fontWeight: 400, whiteSpace: 'pre-wrap', margin: '3px 0' }}>{item.note}</div>}
                              <span style={{ fontSize: 10.5, fontWeight: 600, color: item.type === 'labor' ? 'var(--amber)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {item.type === 'labor' ? t('itemType.labor') : t('itemType.product')}
                              </span>
                              {children.length > 0 && (
                                <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                                  {t('accessoriesIncluded', { count: children.length })}
                                  {item.combine_price !== false && ` — ${t('combinedPriceNote')}`}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '14px 12px', textAlign: 'center', fontSize: 13.5, color: 'var(--muted)', verticalAlign: 'top' }}>x{item.quantity}</td>
                        <td style={{ padding: '14px 12px', textAlign: 'right', fontSize: 13.5, color: 'var(--muted)', verticalAlign: 'top' }}>
                          {item.msrp != null && (
                            <div style={{ fontSize: 10, color: 'var(--muted)', textDecoration: 'line-through' }}>${fmt(item.msrp)}</div>
                          )}
                          ${fmt(item.unit_price)}
                          {item.supplier_price != null && (
                            <div style={{ fontSize: 10, color: 'var(--warn)' }}>{t('costLabel')} ${fmt(item.supplier_price)}</div>
                          )}
                        </td>
                        <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--muted)', fontSize: 12, verticalAlign: 'top' }}>
                          {item.tax_rate === 0 ? t('exempt') : `${(item.tax_rate * 100).toFixed(1)}%`}
                        </td>
                        <td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 700, fontSize: 14, verticalAlign: 'top' }}>${fmt(entryTotal(item))}</td>
                      </tr>
                      {/* Bundled accessories (the default — "Combinar precios" on) stay off this
                          client-facing document entirely: their cost is already folded into
                          entryTotal() above, but the itemized list is kept internal until the
                          invoice's line items are next edited. */}
                      {item.combine_price === false && children.map((child, ci) => (
                        <tr key={child.id} style={{ borderBottom: ci === children.length - 1 ? '1px solid var(--border)' : 'none', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                          <td style={{ padding: '8px 10px 8px 52px' }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                              <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 6, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                {child.photo_signed_url ? <img src={child.photo_signed_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 11 }}>{child.type === 'labor' ? '🔧' : '📦'}</span>}
                              </div>
                              <div>
                                <div style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>{child.description}</div>
                                {child.note?.trim() && <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', whiteSpace: 'pre-wrap', marginTop: 3 }}>{child.note}</div>}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12.5, color: 'var(--muted)' }}>x{child.quantity}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12.5, color: 'var(--muted)' }}>${fmt(child.unit_price)}</td>
                          <td />
                          <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, fontSize: 12.5 }}>${fmt(Number(child.line_total) + Number(child.tax_amount))}</td>
                        </tr>
                      ))}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {multiArea && (
                <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--muted)' }}>
                  {t('areaTotal', { name: area.name, amount: fmt(area.items.reduce((s, it) => s + entryTotal(it), 0)) })}
                </div>
              )}
            </div>
          ))}
          {isFallbackItems && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -14, marginBottom: 24 }}>
              {t('fallbackWarning')}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 320 }}>
              {[
                { label: t('subtotalProducts'), value: inv.subtotal_products },
                { label: t('taxProducts'), value: inv.tax_products },
                { label: t('subtotalLabor'), value: inv.subtotal_labor },
                { label: t('taxLabor', { rate: inv.clients?.client_type === 'b2b' ? '4%' : '11.5%' }), value: inv.tax_labor },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
                  <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                  <span>${fmt(row.value)}</span>
                </div>
              ))}
              {inv.discount_value > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
                  <span style={{ color: 'var(--muted)' }}>{inv.discount_type === 'percent' ? t('discountLabelWithPercent', { percent: Number(inv.discount_value) }) : t('discountLabel')}</span>
                  <span>-${fmt(Number(inv.subtotal_products) + Number(inv.tax_products) + Number(inv.subtotal_labor) + Number(inv.tax_labor) - Number(inv.total))}</span>
                </div>
              )}
              {inv.discount_value > 0 && inv.discount_note && (
                <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', textAlign: 'right', margin: '0 0 4px' }}>{inv.discount_note}</p>
              )}
              <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: '10px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18, color: 'var(--navy)' }}>
                <span>{t('totalLabel')}</span>
                <span>${fmt(inv.total)}</span>
              </div>
              {(totalPaid > 0 || totalRetained > 0) && (
                <>
                  {totalPaid > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', fontSize: 14, color: 'var(--ok)' }}>
                      <span>{t('paidLabel')}</span><span>-${fmt(totalPaid)}</span>
                    </div>
                  )}
                  {totalRetained > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14, color: 'var(--amber)' }}>
                      <span>{t('retentionAppliedLabel')}</span><span>-${fmt(totalRetained)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 16, fontWeight: 700, color: balance > 0 ? 'var(--warn)' : 'var(--ok)' }}>
                    <span>{t('balanceLabel')}</span><span>${fmt(balance)}</span>
                  </div>
                </>
              )}
              {accountBalance > balance && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14, fontWeight: 600, color: 'var(--muted)', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                  <span>{t('accountBalanceLabel')}</span><span>${fmt(accountBalance)}</span>
                </div>
              )}
            </div>
          </div>

          {inv.notes && (
            <div style={{ marginTop: 24, padding: '14px 18px', background: 'var(--surface-2)', borderRadius: 10, fontSize: 13, color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--navy)' }}>{t('notesLabel')}</strong> {inv.notes}
            </div>
          )}

          {attachedNotes.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 14 }}>{t('jobPhotosDocuments')}</div>
              {attachedNotes.map(n => (
                <div key={n.id} style={{ marginBottom: 20 }}>
                  {n.signedUrls.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: n.signedUrls.length === 1 ? '1fr' : n.signedUrls.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: n.note ? 10 : 0 }}>
                      {n.signedUrls.map((url, idx) => {
                        const isVideo = /\.(mp4|mov|webm|avi)(\?|$)/i.test(url);
                        const isPdf = /\.pdf(\?|$)/i.test(url);
                        if (isPdf) return (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, background: 'var(--surface-2)', borderRadius: 8 }}>
                            <span style={{ fontSize: 32 }}>📄</span>
                            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 6 }}>{t('pdfDocument')}</span>
                          </div>
                        );
                        if (isVideo) return (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, background: 'var(--surface-2)', borderRadius: 8 }}>
                            <span style={{ fontSize: 32 }}>🎬</span>
                            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 6 }}>{t('video')}</span>
                          </div>
                        );
                        return (
                          <img key={idx} src={url} alt={t('jobPhotoAlt')} style={{ width: '100%', height: 'auto', maxHeight: 420, objectFit: 'contain', borderRadius: 8, background: 'var(--surface-2)', display: 'block' }} />
                        );
                      })}
                    </div>
                  )}
                  {n.note && <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>{n.note}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{t('paymentsRegistered')}</h2>
            {balance > 0 && <InvoiceActions invoiceId={id} status={inv.status} showPaymentOnly balance={balance} />}
          </div>
          <PaymentsTable
            payments={payments ?? []}
            invoiceId={id}
            invoiceStatus={inv.status}
            invoiceTotal={inv.total}
            totalRetained={totalRetained}
          />
        </div>

        {inv.terms && (
          <div className="card" style={{ marginTop: 20 }}>
            <strong style={{ color: 'var(--navy)', display: 'block', marginBottom: 10, fontSize: 13 }}>{t('projectTerms')}</strong>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
              {inv.terms.split('\n').map((line, i) => line.trim() ? <p key={i} style={{ margin: '0 0 8px' }}>{line}</p> : null)}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
