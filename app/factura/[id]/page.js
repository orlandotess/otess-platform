export const dynamic = 'force-dynamic';

import { Fragment } from 'react';
import Link from 'next/link';
import { supabaseServer as supabase } from '../../../lib/supabase';
import { fallbackLineItems } from '../../../lib/ivu';
import { displayTitle } from '../../../lib/lineItemTitle';
import { formatDateTimePR } from '../../../lib/datetimeLocal';
import { getTranslations } from 'next-intl/server';

export default async function FacturaPublica({ params }) {
  const { id } = params;
  const t = await getTranslations('facturas.public');

  const [{ data: inv }, { data: items }, { data: payments }, { data: retenciones }] = await Promise.all([
    supabase.from('invoices').select('*, clients(name, email, phone, company, client_type, client_addresses(*), client_properties(*)), jobs(id, title, client_properties(*))').eq('id', id).single(),
    supabase.from('invoice_line_items').select('*').eq('invoice_id', id).order('sort_order'),
    supabase.from('payments').select('*').eq('invoice_id', id).order('paid_at'),
    supabase.from('retenciones').select('retencion_aplicada').eq('invoice_id', id),
  ]);

  // Trackear vista + notificar por email — nunca debe impedir que el cliente
  // vea su factura, así que cualquier fallo (incluyendo Resend sin configurar) se ignora.
  if (inv) {
    await supabase.from('invoice_views').insert([{ invoice_id: id }]);
    await supabase.from('inbox_notifications').insert([{
      type: 'invoice_viewed',
      title: `👁️ Factura ${inv.invoice_number} fue abierta`,
      body: `${inv.clients?.name ?? 'Un cliente'} abrió la factura.`,
      link: `/facturas/${id}`,
    }]);

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'OTESS <info@otesspr.com>',
        to: 'services@otesspr.com',
        subject: `👁️ Factura ${inv.invoice_number} fue abierta`,
        html: `
          <div style="font-family:Arial,sans-serif;padding:20px">
            <p style="font-size:15px;color:#16223d"><strong>${inv.clients?.name ?? 'Un cliente'}</strong> abrió la factura <strong>${inv.invoice_number}</strong>.</p>
            <p style="font-size:13px;color:#888">Fecha: ${formatDateTimePR(new Date(), { dateStyle: 'medium', timeStyle: 'short' })}</p>
            <a href="https://app.otesspr.com/facturas/${id}" style="color:#e0972c;font-size:13px">Ver factura en el dashboard →</a>
          </div>
        `,
      });
    } catch (err) {
      console.error('Error notificando vista:', err);
    }
  }

  // Fetch attached job notes (photos/videos/PDFs selected by admin)
  let attachedNotes = [];
  if (inv?.attached_note_ids && inv.attached_note_ids.length > 0) {
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

  if (!inv) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2 style={{ color: '#16223d' }}>{t('notFoundTitle')}</h2>
        <p style={{ color: '#888' }}>{t('notFoundBody')}</p>
      </div>
    </div>
  );

  const totalPaid = payments?.reduce((a, p) => a + Number(p.amount), 0) ?? 0;
  const totalRetained = retenciones?.reduce((a, r) => a + Number(r.retencion_aplicada ?? 0), 0) ?? 0;
  const balance = Number(inv.total) - totalPaid - totalRetained;
  const primaryAddr = inv.clients?.client_addresses?.find(a => a.is_primary) ?? inv.clients?.client_addresses?.[0];
  const clientProperties = inv.clients?.client_properties ?? [];
  const property = inv.property_id
    ? clientProperties.find(p => p.id === inv.property_id) ?? null
    : inv.jobs?.client_properties ?? null;
  const billToName = inv.bill_to === 'company' && inv.clients?.company ? inv.clients.company : inv.clients?.name;
  const displayItems = await Promise.all((items?.length ? items : fallbackLineItems(inv)).map(async item => {
    if (!item.photo_url) return item;
    const { data } = await supabase.storage.from('Job-photos').createSignedUrl(item.photo_url, 3600);
    return { ...item, photo_signed_url: data?.signedUrl ?? null };
  }));
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = inv.status === 'sent' && inv.due_at && inv.due_at < today;
  const statusLabel = { draft: t('status.draft'), sent: t('status.sent'), paid: t('status.paid'), cancelled: t('status.cancelled') };
  const statusColor = { draft: '#5b6473', sent: '#2a4cb5', paid: '#1a7a4a', cancelled: '#b52a2a' };
  const displayStatus = isOverdue ? t('status.overdue') : statusLabel[inv.status];
  const displayColor = isOverdue ? '#b52a2a' : statusColor[inv.status];

  // Groups top-level items into named area sections and links each accessory
  // (parent_item_id child) under its parent — mirrors app/facturas/[id]/page.js.
  const topLevelItems = displayItems.filter(it => !it.parent_item_id);
  const childrenByParentId = new Map();
  for (const it of displayItems) {
    if (!it.parent_item_id) continue;
    if (!childrenByParentId.has(it.parent_item_id)) childrenByParentId.set(it.parent_item_id, []);
    childrenByParentId.get(it.parent_item_id).push(it);
  }
  const displayAreas = [];
  topLevelItems.forEach(it => {
    const name = it.area || 'General';
    let area = displayAreas.find(a => a.name === name);
    if (!area) { area = { name, items: [] }; displayAreas.push(area); }
    area.items.push(it);
  });
  const multiArea = displayAreas.length > 1 || (displayAreas[0]?.name && displayAreas[0].name !== 'General');
  function entryTotal(item) {
    const own = Number(item.line_total) + Number(item.tax_amount);
    const childrenTotal = (childrenByParentId.get(item.id) ?? []).reduce((s, c) => s + Number(c.line_total) + Number(c.tax_amount), 0);
    return own + childrenTotal;
  }

  return (
    <div style={{ background: '#fafafa', minHeight: '100vh', padding: '32px 16px', fontFamily: '-apple-system,sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Invoice card */}
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #eee', marginBottom: 20 }}>

          {/* Header */}
          <div style={{ padding: '28px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #eee' }}>
            <div>
              <img src="/otess-logo.png" alt="OTESS" style={{ width: 130, height: 'auto', display: 'block' }} />
              <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>OT Electrical & Security Solutions</div>
              <div style={{ color: '#999', fontSize: 12 }}>Calle 56, #2D8 Lomas de Carolina, PR 00987</div>
              <div style={{ color: '#999', fontSize: 12 }}>(787) 513-8352 · info@otesspr.com</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#16223d', fontSize: 18, fontWeight: 700, letterSpacing: '0.02em' }}>{t('invoiceTitle')}</div>
              <div style={{ color: '#999', fontSize: 15, fontWeight: 600, fontFamily: 'monospace', marginTop: 2 }}>{inv.invoice_number}</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: displayColor, background: displayColor + '18', padding: '3px 10px', borderRadius: 20, marginTop: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: displayColor }} />{displayStatus}
              </div>
              <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>{t('dateLabel')} <strong style={{ color: '#555' }}>{inv.issued_at}</strong></div>
              {inv.due_at && <div style={{ color: '#999', fontSize: 12 }}>{t('dueLabel')} <strong style={{ color: isOverdue ? '#b52a2a' : '#555' }}>{inv.due_at}</strong></div>}
            </div>
          </div>

          <div style={{ padding: '28px 32px' }}>
            {/* Bill to */}
            <div style={{ background: '#fafafa', borderRadius: 8, padding: '16px 20px', marginBottom: 24, border: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.08em' }}>{t('billTo')}</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{billToName}</div>
              {inv.bill_to !== 'company' && inv.clients?.company && <div style={{ color: '#999', fontSize: 13 }}>{inv.clients.company}</div>}
              {primaryAddr && <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>{primaryAddr.line1}, {primaryAddr.city} {primaryAddr.zip}</div>}
              {inv.clients?.email && <div style={{ color: '#999', fontSize: 13 }}>{inv.clients.email}</div>}
            </div>

            {property && (
              <div style={{ background: '#fafafa', borderRadius: 8, padding: '16px 20px', marginBottom: 24, border: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.08em' }}>{t('serviceProperty')}</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{property.name}</div>
                {property.street && <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>{property.street}{property.city ? `, ${property.city}` : ''}{property.zip ? ` ${property.zip}` : ''}</div>}
              </div>
            )}

            {inv.work_description && (
              <div style={{ background: '#fafafa', borderRadius: 8, padding: '16px 20px', marginBottom: 24, border: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.08em' }}>{t('workPerformed')}</div>
                <p style={{ color: '#555', fontSize: 13.5, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{inv.work_description}</p>
              </div>
            )}

            {/* Line items */}
            {displayAreas.map(area => (
              <div key={area.name} style={{ marginBottom: 24 }}>
                {multiArea && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#16223d', marginBottom: 8 }}>📍 {area.name}</div>
                )}
                {!multiArea && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{t('items')}</div>
                )}
                <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: multiArea ? 6 : 0, minWidth: 480 }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid #eee' }}>
                      <th style={{ color: '#aaa', fontWeight: 700, padding: '8px 0', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: 200 }}>{t('table.description')}</th>
                      <th style={{ color: '#aaa', fontWeight: 700, padding: '8px 12px', textAlign: 'center', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('table.qty')}</th>
                      <th style={{ color: '#aaa', fontWeight: 700, padding: '8px 12px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('table.price')}</th>
                      <th style={{ color: '#aaa', fontWeight: 700, padding: '8px 12px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('table.tax')}</th>
                      <th style={{ color: '#aaa', fontWeight: 700, padding: '8px 0', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('table.total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {area.items.map(item => {
                      const children = childrenByParentId.get(item.id) ?? [];
                      const showTitle = displayTitle(item.title, item.description);
                      return (
                      <Fragment key={item.id}>
                        <tr style={{ borderBottom: children.length ? 'none' : '1px solid #f4f4f4' }}>
                          <td style={{ padding: '14px 10px 14px 0' }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                              <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                {item.photo_signed_url ? <img src={item.photo_signed_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span>{item.type === 'labor' ? '🔧' : '📦'}</span>}
                              </div>
                              <div>
                                {showTitle && <div style={{ fontWeight: 700, fontSize: 14 }}>{item.title}</div>}
                                <div style={{ fontWeight: showTitle ? 400 : 700, fontSize: showTitle ? 13 : 14, color: showTitle ? '#555' : undefined, whiteSpace: 'pre-wrap' }}>{item.description}</div>
                                <span style={{ fontSize: 10.5, fontWeight: 600, color: item.type === 'labor' ? '#92600a' : '#999', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  {item.type === 'labor' ? t('table.laborType') : t('table.productType')}
                                </span>
                                {children.length > 0 && (
                                  <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>
                                    {t('accessoriesIncluded', { count: children.length })}
                                    {item.combine_price !== false && ` — ${t('combinedPrice')}`}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '14px 12px', textAlign: 'center', color: '#999', fontSize: 13.5, verticalAlign: 'top' }}>x{item.quantity}</td>
                          <td style={{ padding: '14px 12px', textAlign: 'right', color: '#999', fontSize: 13.5, verticalAlign: 'top' }}>{fmt(item.unit_price)}</td>
                          <td style={{ padding: '14px 12px', textAlign: 'right', color: '#999', fontSize: 12, verticalAlign: 'top' }}>{item.tax_rate === 0 ? t('exempt') : `${(item.tax_rate * 100).toFixed(1)}%`}</td>
                          <td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 700, fontSize: 14, verticalAlign: 'top' }}>{fmt(entryTotal(item))}</td>
                        </tr>
                        {/* Bundled accessories (the default — "Combinar precios" on) stay off this
                            client-facing document entirely: their cost is already folded into
                            entryTotal() above, but the itemized list is kept internal. */}
                        {item.combine_price === false && children.map((child, ci) => (
                          <tr key={child.id} style={{ borderBottom: ci === children.length - 1 ? '1px solid #f4f4f4' : 'none' }}>
                            <td style={{ padding: '8px 10px 8px 52px' }}>
                              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 6, background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                  {child.photo_signed_url ? <img src={child.photo_signed_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 11 }}>{child.type === 'labor' ? '🔧' : '📦'}</span>}
                                </div>
                                <div style={{ fontSize: 12.5, color: '#999', whiteSpace: 'pre-wrap' }}>{child.description}</div>
                              </div>
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12.5, color: '#999' }}>x{child.quantity}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12.5, color: '#999' }}>{fmt(child.unit_price)}</td>
                            <td />
                            <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, fontSize: 12.5 }}>{fmt(Number(child.line_total) + Number(child.tax_amount))}</td>
                          </tr>
                        ))}
                      </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                {multiArea && (
                  <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#999' }}>
                    {t('areaTotal', { area: area.name, total: fmt(area.items.reduce((s, it) => s + entryTotal(it), 0)) })}
                  </div>
                )}
              </div>
            ))}

            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ width: 300 }}>
                {[
                  { label: t('totals.subtotalProducts'), value: inv.subtotal_products },
                  { label: t('totals.taxProducts'), value: inv.tax_products },
                  { label: t('totals.subtotalLabor'), value: inv.subtotal_labor },
                  { label: t('totals.taxLabor', { rate: inv.clients?.client_type === 'b2b' ? '4%' : '11.5%' }), value: inv.tax_labor },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                    <span style={{ color: '#999' }}>{row.label}</span>
                    <span>{fmt(row.value)}</span>
                  </div>
                ))}
                {inv.discount_value > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                    <span style={{ color: '#999' }}>{t('totals.discount')}{inv.discount_type === 'percent' ? ` (${Number(inv.discount_value)}%)` : ''}</span>
                    <span>-{fmt(Number(inv.subtotal_products) + Number(inv.tax_products) + Number(inv.subtotal_labor) + Number(inv.tax_labor) - Number(inv.total))}</span>
                  </div>
                )}
                {inv.discount_value > 0 && inv.discount_note && (
                  <p style={{ fontSize: 12, color: '#999', fontStyle: 'italic', textAlign: 'right', margin: '0 0 4px' }}>{inv.discount_note}</p>
                )}
                <hr style={{ border: 'none', borderTop: '1.5px solid #ddd', margin: '10px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18, color: '#16223d' }}>
                  <span>{t('totals.total')}</span>
                  <span>{fmt(inv.total)}</span>
                </div>
                {(totalPaid > 0 || totalRetained > 0) && (
                  <>
                    {totalPaid > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', fontSize: 13, color: '#1a7a4a' }}>
                        <span>{t('totals.paid')}</span><span>-{fmt(totalPaid)}</span>
                      </div>
                    )}
                    {totalRetained > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: '#92600a' }}>
                        <span>{t('totals.retained')}</span><span>-{fmt(totalRetained)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 15, fontWeight: 700, color: balance > 0 ? '#92600a' : '#1a7a4a' }}>
                      <span>{t('totals.balance')}</span><span>{fmt(balance)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {inv.notes && (
              <div style={{ marginTop: 24, padding: '14px 18px', background: '#fafafa', borderRadius: 8, fontSize: 13, color: '#999', border: '1px solid #f0f0f0' }}>
                <strong style={{ color: '#16223d' }}>{t('notesLabel')}</strong> {inv.notes}
              </div>
            )}
          </div>
        </div>

        {attachedNotes.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee', padding: '28px 32px', marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#16223d', marginBottom: 18 }}>{t('workPhotosTitle')}</div>
            {attachedNotes.map(n => (
              <div key={n.id} style={{ marginBottom: 20 }}>
                {n.signedUrls.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: n.signedUrls.length === 1 ? '1fr' : n.signedUrls.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: n.note ? 10 : 0 }}>
                    {n.signedUrls.map((url, idx) => {
                      const isVideo = /\.(mp4|mov|webm|avi)(\?|$)/i.test(url);
                      const isPdf = /\.pdf(\?|$)/i.test(url);
                      if (isPdf) return (
                        <a key={idx} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, background: '#fafafa', borderRadius: 8, textDecoration: 'none', border: '1px solid #eee' }}>
                          <span style={{ fontSize: 32 }}>📄</span>
                          <span style={{ fontSize: 12, color: '#999', fontWeight: 600, marginTop: 6 }}>{t('viewPdf')}</span>
                        </a>
                      );
                      if (isVideo) return (
                        <video key={idx} src={url} controls style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 8, background: '#000' }} />
                      );
                      return (
                        <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={t('workPhotoAlt')} style={{ width: '100%', height: 'auto', maxHeight: 420, objectFit: 'contain', borderRadius: 8, background: '#fafafa', display: 'block' }} />
                        </a>
                      );
                    })}
                  </div>
                )}
                {n.note && <p style={{ fontSize: 14, color: '#666', margin: 0 }}>{n.note}</p>}
              </div>
            ))}
          </div>
        )}

        {inv.terms && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee', padding: '28px 32px', marginBottom: 20 }}>
            <strong style={{ color: '#16223d', display: 'block', marginBottom: 10, fontSize: 15 }}>{t('termsTitle')}</strong>
            <div style={{ fontSize: 12.5, color: '#999', lineHeight: 1.7 }}>
              {inv.terms.split('\n').map((line, i) => line.trim() ? <p key={i} style={{ margin: '0 0 8px' }}>{line}</p> : null)}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', color: '#bbb', fontSize: 12, padding: '16px 0' }}>
          <p>{t('footer.questions')} <a href="mailto:info@otesspr.com" style={{ color: '#e0972c' }}>info@otesspr.com</a> {t('footer.orCall', { phone: '(787) 513-8352' })}</p>
        </div>
      </div>
    </div>
  );
}
