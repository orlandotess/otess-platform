'use client';
import { Fragment, useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { displayTitle } from '../../lib/lineItemTitle';

const NAVY = '#16223d';

const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d, locale) => d ? new Date(d + 'T00:00:00').toLocaleDateString(locale === 'en' ? 'en-US' : 'es-PR', { month: 'long', day: '2-digit', year: 'numeric' }).toUpperCase() : null;

function groupByArea(items) {
  const topLevel = items.filter(it => !it.parent_item_id).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const withChildren = topLevel.map(parent => ({
    ...parent,
    children: items.filter(c => c.parent_item_id === parent.id).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  }));
  const areas = [];
  withChildren.forEach(it => {
    const name = it.area || 'General';
    let area = areas.find(a => a.name === name);
    if (!area) { area = { name, items: [] }; areas.push(area); }
    area.items.push(it);
  });
  return areas;
}

function itemTotal(it) {
  return (it.quantity || 0) * (it.unit_price || 0) - (it.discount_amount || 0);
}

// Top-level items always bill. A child (parent_item_id set) only bills on
// its own when its parent's combine_price is explicitly false — the default
// (true/undefined) keeps the legacy behavior where the parent's own price is
// assumed to already include its accessories.
function billableItems(items) {
  const all = items ?? [];
  const parentById = new Map(all.filter(it => !it.parent_item_id).map(it => [it.id, it]));
  return all.filter(it => {
    if (!it.parent_item_id) return true;
    const parent = parentById.get(it.parent_item_id);
    return parent ? parent.combine_price === false : false;
  });
}

// documentDiscount: { type: 'amount'|'percent', value: number } — descuento a
// nivel de propuesta, aplicado DESPUÉS del IVU sobre el total de la opción
// (distinto de discount_amount por línea, que ya se resta antes del IVU en
// itemTotal() y se reporta aparte como totalDiscount).
export function financialBreakdown(items, clientType, taxRules, documentDiscount) {
  let parts = 0, labor = 0, taxParts = 0, taxLabor = 0, totalDiscount = 0;
  billableItems(items).forEach(it => {
    const base = itemTotal(it);
    totalDiscount += it.discount_amount || 0;
    const lineType = it.item_type === 'product' ? 'product' : 'labor';
    const rule = (taxRules ?? []).find(r => r.client_type === clientType && r.line_item_type === lineType);
    const rate = it.exempt_reason ? 0 : (rule?.rate ?? 0.115);
    if (lineType === 'product') { parts += base; taxParts += base * rate; }
    else { labor += base; taxLabor += base * rate; }
  });
  const preDiscountTotal = parts + labor + taxParts + taxLabor;
  const docValue = Number(documentDiscount?.value ?? 0);
  const documentDiscountAmount = docValue > 0
    ? Math.min(documentDiscount.type === 'percent' ? preDiscountTotal * (docValue / 100) : docValue, preDiscountTotal)
    : 0;
  return {
    parts, labor, taxParts, taxLabor, totalDiscount,
    subtotal: parts + labor, tax: taxParts + taxLabor,
    documentDiscountAmount,
    total: preDiscountTotal - documentDiscountAmount,
  };
}

// Margin estimate for internal use only — never rendered inside ProposalDocument,
// so it can't leak into the client PDF or the public proposal link. Mirrors the
// cost convention in app/accounting/rentabilidad/page.js: items without a
// supplier_price are skipped rather than treated as zero cost.
export function profitBreakdown(items) {
  let sell = 0, cost = 0;
  billableItems(items).forEach(it => {
    sell += itemTotal(it);
    if (it.supplier_price == null) return;
    cost += (it.quantity || 0) * it.supplier_price;
  });
  const profit = sell - cost;
  return { sell, cost, profit, marginPct: sell > 0 ? (profit / sell) * 100 : null };
}

const page = { padding: '50px', minHeight: 700, background: '#fff' };
const pageBreak = { ...page, breakBefore: 'page', pageBreakBefore: 'always' };
const h2 = { fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 20 };

export default function ProposalDocument({ proposal, option, companyInfo, primaryAddress, taxRules, payments, mode = 'client' }) {
  const t = useTranslations('propuestas.document');
  const locale = useLocale();
  // Attachments render collapsed by default (Portal.io-style "N Attachments
  // Included" toggle). The PDF export only ever captures what's on screen at
  // capture time, so openPdfPreview fires otess:print-start/-end around the
  // html2canvas snapshot — force every attachment open for that window so the
  // exported PDF still has the full item list, then restore whatever the
  // viewer had expanded. Declared before the picklist early-return below so
  // hook order stays fixed regardless of `mode` (Rules of Hooks).
  const [expandedIds, setExpandedIds] = useState({});
  const [printMode, setPrintMode] = useState(false);
  useEffect(() => {
    function onStart() { setPrintMode(true); }
    function onEnd() { setPrintMode(false); }
    window.addEventListener('otess:print-start', onStart);
    window.addEventListener('otess:print-end', onEnd);
    return () => {
      window.removeEventListener('otess:print-start', onStart);
      window.removeEventListener('otess:print-end', onEnd);
    };
  }, []);
  function toggleExpanded(id) {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  }

  if (mode === 'picklist') return <PickListDocument proposal={proposal} option={option} />;

  const clientType = proposal.tax_client_type ?? proposal.clients?.client_type ?? 'final';
  const areas = groupByArea(option.items ?? []);
  const fb = financialBreakdown(option.items, clientType, taxRules, { type: proposal.discount_type, value: proposal.discount_value });
  const basisAmount = { parts: fb.parts, labor: fb.labor, subtotal: fb.subtotal };
  const partsRate = fb.parts > 0 ? (fb.taxParts / fb.parts * 100).toFixed(1) : '11.5';
  const laborRate = fb.labor > 0 ? (fb.taxLabor / fb.labor * 100).toFixed(1) : (clientType === 'b2b' ? '4' : '11.5');
  const hidePricing = mode === 'installer';
  const clientAsCompany = proposal.clients?.report_name_source === 'company' && proposal.clients?.company;
  const clientPrimaryName = clientAsCompany ? proposal.clients?.company : proposal.clients?.name;
  const clientSecondaryName = clientAsCompany ? null : proposal.clients?.company;
  const basisLabels = { parts: t('basisPartsLabel'), labor: t('basisLaborLabel'), subtotal: t('basisSubtotalLabel') };

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", color: '#1a1a1a', minWidth: 700 }}>
      {mode === 'invoice' ? (
        /* Invoice header — mirrors the Facturas module's letterhead so this
           reads as a real invoice, not a proposal cover page. */
        <div style={page}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: NAVY, letterSpacing: -1 }}>OTESS</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{t('companyTagline')}</div>
              <div style={{ fontSize: 12, color: '#999' }}>{t('companyAddressLine1')}</div>
              <div style={{ fontSize: 12, color: '#999' }}>{t('companyAddressLine2')}</div>
              <div style={{ fontSize: 12, color: '#999' }}>{t('companyContact')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: NAVY, letterSpacing: -1 }}>{t('invoiceHeading')}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#e0972c', fontFamily: 'monospace' }}>{proposal.proposal_number}</div>
              <div style={{ fontSize: 13, color: '#999', marginTop: 8 }}>{t('dateLabel')} <strong>{new Date().toLocaleDateString('en-CA')}</strong></div>
              {proposal.valid_until && <div style={{ fontSize: 13, color: '#999' }}>{t('dueLabel')} <strong>{proposal.valid_until}</strong></div>}
            </div>
          </div>
          <div style={{ background: '#f6f7fa', borderRadius: 10, padding: '16px 20px', marginBottom: 28 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#999', marginBottom: 8, textTransform: 'uppercase' }}>{t('billTo')}</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{clientPrimaryName}</div>
            {clientSecondaryName && <div style={{ color: '#999', fontSize: 14 }}>{clientSecondaryName}</div>}
            {primaryAddress && (
              <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>
                {primaryAddress.street && <div>{primaryAddress.street}</div>}
                <div>{primaryAddress.city}{primaryAddress.state ? `, ${primaryAddress.state}` : ''} {primaryAddress.zip ?? ''}</div>
              </div>
            )}
            {proposal.clients?.email && <div style={{ color: '#999', fontSize: 13 }}>{proposal.clients.email}</div>}
            {proposal.clients?.phone && <div style={{ color: '#999', fontSize: 13 }}>{proposal.clients.phone}</div>}
          </div>
        </div>
      ) : mode === 'installer' ? (
        /* Installer header — no pricing, just what/where/how much, for the
           crew doing the physical work rather than the client or accounting. */
        <div style={page}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: NAVY, letterSpacing: -1 }}>OTESS</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{t('installerSubtitle')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: NAVY, letterSpacing: -1 }}>{t('installerHeading')}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#e0972c', fontFamily: 'monospace' }}>{proposal.proposal_number}</div>
            </div>
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: NAVY, marginBottom: 6 }}>{proposal.title}</div>
          <div style={{ fontSize: 13, color: '#666' }}>
            {proposal.clients?.name}{proposal.clients?.phone ? ` · ${proposal.clients.phone}` : ''}
          </div>
          {primaryAddress && (
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
              {primaryAddress.street && `${primaryAddress.street}, `}{primaryAddress.city}{primaryAddress.state ? `, ${primaryAddress.state}` : ''} {primaryAddress.zip ?? ''}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Cover */}
          <div style={{ ...page, display: 'flex', flexDirection: 'column', minHeight: 850 }}>
            <div style={{ flex: 1 }} />
            <div>
              <div style={{ fontSize: 40, fontWeight: 900, marginBottom: 36, letterSpacing: -1 }}>{proposal.title}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#999', letterSpacing: '0.08em', marginBottom: 6 }}>{t('aProposalFor')}</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: NAVY, marginBottom: 10 }}>{clientPrimaryName}</div>
              <div style={{ fontSize: 14, lineHeight: 1.8 }}>
                {clientSecondaryName && <div>{clientSecondaryName}</div>}
                {proposal.clients?.email && <div>{proposal.clients?.email}</div>}
                {proposal.clients?.phone && <div>{proposal.clients?.phone}</div>}
              </div>
              {primaryAddress && (
                <div style={{ fontSize: 14, lineHeight: 1.8, marginTop: 14 }}>
                  {primaryAddress.street && <div>{primaryAddress.street}</div>}
                  <div>{primaryAddress.city}{primaryAddress.state ? `, ${primaryAddress.state}` : ''} {primaryAddress.zip ?? ''}</div>
                </div>
              )}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ borderTop: '1px solid #eee', paddingTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#999', letterSpacing: '0.05em', marginBottom: 14 }}>
                {proposal.prepared_by ? t('preparedByLabel', { name: proposal.prepared_by.toUpperCase() }) : ''}
                {proposal.prepared_by && proposal.valid_until ? ' • ' : ''}
                {proposal.valid_until ? t('expiresLabel', { date: fmtDate(proposal.valid_until, locale) }) : ''}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src="/otess-logo.png" alt="OTESS" style={{ height: 26 }} />
                <span style={{ fontSize: 13, color: '#999', fontWeight: 600 }}>{t('companyFooterTagline')}</span>
              </div>
            </div>
          </div>

          {/* About Us */}
          <div style={pageBreak}>
            <div style={h2}>{t('aboutUsHeading')}</div>
            <p style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{companyInfo?.about_us || t('defaultAboutUs')}</p>
          </div>
        </>
      )}

      {/* Areas & Items */}
      {areas.map((area, areaIdx) => {
        const areaTotal = area.items.reduce((s, it) => {
          const childrenTotal = it.combine_price === false ? it.children.reduce((cs, c) => cs + itemTotal(c), 0) : 0;
          return s + itemTotal(it) + childrenTotal;
        }, 0);
        return (
          <div key={area.name} style={pageBreak}>
            {areaIdx === 0 && <div style={h2}>{t('areasItemsHeading')}</div>}
            <div style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 14 }}>{area.name}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #eee' }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase' }}>{t('itemsColumnHeader')}</th>
                  {!hidePricing && <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase' }}>{t('sellPriceColumnHeader')}</th>}
                  <th style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase' }}>{t('qtyColumnHeader')}</th>
                  {!hidePricing && <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase' }}>{t('totalColumnHeader')}</th>}
                </tr>
              </thead>
              <tbody>
                {area.items.map(it => {
                  const combined = it.children.length > 0 && it.combine_price !== false;
                  const bundled = combined || it.discount_amount > 0;
                  // A calculator group is quoted as one lot and stays that way
                  // here: the materials behind it are internal takeoff detail,
                  // listed on the Pick List, not on the document the client
                  // reads. So no "N adjuntos incluidos" toggle, no itemized
                  // children, and no "precio combinado" note — from the
                  // client's side there is nothing to combine, just the lot.
                  const hideChildren = !!it.from_calculator;
                  const isExpanded = !hideChildren && (printMode || !!expandedIds[it.id]);
                  const colCount = hidePricing ? 2 : 4;
                  const shownTitle = displayTitle(it.title, it.description);
                  return (
                    <Fragment key={it.id}>
                      <tr style={{ borderBottom: it.children.length && !hideChildren ? 'none' : '1px solid #f4f4f4', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                        <td style={{ padding: '14px 10px 14px 0', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {it.photo_signed_url ? <img src={it.photo_signed_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span>{it.item_type === 'product' ? '📦' : '🔧'}</span>}
                          </div>
                          <div>
                            {shownTitle && <div style={{ fontWeight: 700, fontSize: 14 }}>{shownTitle}</div>}
                            <div style={{ fontWeight: shownTitle ? 400 : 700, fontSize: shownTitle ? 13 : 14, color: shownTitle ? '#555' : undefined, whiteSpace: 'pre-wrap' }}>{it.description}</div>
                          </div>
                        </td>
                        {!hidePricing && <td style={{ textAlign: 'right', fontSize: 13.5, color: '#333', verticalAlign: 'top', paddingTop: 14 }}>{bundled ? '' : fmt(it.unit_price)}</td>}
                        <td style={{ textAlign: 'center', fontSize: 13.5, color: '#333', verticalAlign: 'top', paddingTop: 14 }}>x{it.quantity}</td>
                        {!hidePricing && (
                          <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: 14 }}>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(itemTotal(it))}</div>
                            {combined && !hideChildren && <div style={{ fontSize: 10.5, color: '#999' }}>{t('combinedPriceNote')}</div>}
                            {it.discount_amount > 0 && <div style={{ fontSize: 11, color: '#1a7a4a', fontWeight: 600 }}>{t('lineDiscountNote', { amount: fmt(it.discount_amount) })}</div>}
                          </td>
                        )}
                      </tr>
                      {it.children.length > 0 && !hideChildren && (
                        <tr style={{ borderBottom: 'none' }}>
                          <td colSpan={colCount} style={{ padding: '0 0 8px 52px' }}>
                            <button
                              type="button"
                              onClick={() => toggleExpanded(it.id)}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: '#999' }}
                            >
                              <span style={{ fontSize: 9 }}>{isExpanded ? '▾' : '▸'}</span>
                              {t('attachmentsIncluded', { count: it.children.length })}
                            </button>
                          </td>
                        </tr>
                      )}
                      {isExpanded && it.children.map((child, ci) => (
                        <tr key={child.id} style={{ borderBottom: ci === it.children.length - 1 ? '1px solid #f4f4f4' : 'none', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                          <td style={{ padding: '10px 10px 10px 52px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                              {child.photo_signed_url ? <img src={child.photo_signed_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span>{child.item_type === 'product' ? '📦' : '🔧'}</span>}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 400, color: '#555', whiteSpace: 'pre-wrap' }}>{child.description}</div>
                          </td>
                          {!hidePricing && <td style={{ textAlign: 'right', fontSize: 13.5, color: '#333', verticalAlign: 'top', paddingTop: 10 }}>{it.combine_price === false ? fmt(child.unit_price) : ''}</td>}
                          <td style={{ textAlign: 'center', fontSize: 13.5, color: '#333', verticalAlign: 'top', paddingTop: 10 }}>x{child.quantity}</td>
                          {!hidePricing && (
                            <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: 10 }}>
                              {it.combine_price === false && <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(itemTotal(child))}</div>}
                            </td>
                          )}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {!hidePricing && (
              <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, color: NAVY, marginTop: 14, paddingTop: 12, borderTop: '1px solid #eee' }}>
                {t('areaTotalLabel', { name: area.name, amount: fmt(areaTotal) })}
              </div>
            )}
          </div>
        );
      })}

      {/* Financial Summary — skipped for the installer sheet, which has no pricing */}
      {!hidePricing && (
      <>
      <div style={pageBreak}>
        <div style={h2}>{t('financialSummaryHeading')}</div>
        <div style={{ display: 'flex', gap: 40 }}>
          <div style={{ flex: 1 }}>
            {fb.totalDiscount > 0 && (
              <div style={{ background: '#e7f3ee', borderRadius: 8, padding: '14px 16px', fontSize: 13, color: '#1a7a4a', lineHeight: 1.6 }}>
                {t.rich('lineDiscountsReceived', { amount: fmt(fb.totalDiscount), strong: chunks => <strong>{chunks}</strong> })}
              </div>
            )}
          </div>
          <div style={{ width: 300 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}><span style={{ color: '#666' }}>{t('totalParts')}</span><span style={{ fontWeight: 700 }}>{fmt(fb.parts)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}><span style={{ color: '#666' }}>{t('totalLabor')}</span><span style={{ fontWeight: 700 }}>{fmt(fb.labor)}</span></div>
            <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}><span>{t('subtotal')}</span><span style={{ fontWeight: 700 }}>{fmt(fb.subtotal)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}><span>{t('salesTaxParts', { rate: partsRate })}</span><span>{fmt(fb.taxParts)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}><span>{t('salesTaxLabor', { rate: laborRate })}</span><span>{fmt(fb.taxLabor)}</span></div>
            {fb.documentDiscountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
                <span>{proposal.discount_type === 'percent' ? t('discountLabelWithPercent', { percent: Number(proposal.discount_value) }) : t('discountLabel')}</span>
                <span>-{fmt(fb.documentDiscountAmount)}</span>
              </div>
            )}
            {fb.documentDiscountAmount > 0 && proposal.discount_note && (
              <p style={{ fontSize: 12, color: '#999', fontStyle: 'italic', textAlign: 'right', margin: '0 0 4px' }}>{proposal.discount_note}</p>
            )}
            <hr style={{ border: 'none', borderTop: '1.5px solid #ddd', margin: '10px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18, color: NAVY }}><span>{t('proposalTotal')}</span><span>{fmt(fb.total)}</span></div>
          </div>
        </div>
      </div>

      {/* Payment Schedule + Terms */}
      <div style={pageBreak}>
        {payments && payments.length > 0 && (
          <>
            <div style={h2}>{t('paymentScheduleHeading')}</div>
            <div style={{ border: '1px solid #eee', borderRadius: 8, marginBottom: 36 }}>
              {payments.map((p, i) => (
                <div key={p.id ?? i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: i < payments.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{p.label}</span>
                    <span style={{ fontSize: 13, color: '#777', marginLeft: 8 }}>
                      {t('paymentPercentOfBasis', { percent: p.percent, basis: basisLabels[p.basis] ?? basisLabels.subtotal })}{p.due_trigger ? t('dueSuffix', { trigger: p.due_trigger }) : ''}
                    </span>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{fmt((basisAmount[p.basis] ?? 0) * (p.percent / 100))}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div style={h2}>{t('projectTermsHeading')}</div>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: '#444', whiteSpace: 'pre-line' }}>{proposal.terms}</p>
        {proposal.valid_until && (
          <p style={{ fontSize: 12, color: '#999', marginTop: 16 }}>{t('validUntilNote', { date: fmtDate(proposal.valid_until, locale) })}</p>
        )}
      </div>
      </>
      )}
    </div>
  );
}

// Warehouse Pick List — a flat, aggregated checklist of the products needed
// for one option (quantities summed across areas; labor lines excluded).
// Deliberately its own render path rather than a mode branch further up:
// it isn't area-grouped and has no financial section at all, so bolting it
// onto the area-by-area layout above would mean threading hidePricing-style
// conditionals through code that doesn't otherwise apply to it.
function PickListDocument({ proposal, option }) {
  const t = useTranslations('propuestas.document');
  // Includes attachments/accessories too — the warehouse still needs to pull
  // a bundled part (e.g. a junction box) regardless of how it's priced.
  // A calculator group header ("Pipe, Box and Miscellaneous") is a price
  // bucket, not something anyone can pull off a shelf — the materials it
  // stands for are its children, which are listed here on their own. A parent
  // that is a real material with real accessories still belongs on the sheet,
  // so "has children" isn't the test; the header carries its own mark.
  const products = (option.items ?? []).filter(it => it.item_type === 'product' && !(it.from_calculator && !it.parent_item_id));
  const grouped = new Map();
  products.forEach(it => {
    const key = it.description;
    const existing = grouped.get(key);
    if (existing) existing.quantity += it.quantity || 0;
    else grouped.set(key, { description: it.description, quantity: it.quantity || 0, photo_signed_url: it.photo_signed_url });
  });
  const rows = [...grouped.values()].sort((a, b) => a.description.localeCompare(b.description));

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", color: '#1a1a1a' }}>
      <div style={page}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: NAVY, letterSpacing: -1 }}>OTESS</div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{t('pickListSubtitle')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e0972c', fontFamily: 'monospace' }}>{proposal.proposal_number}</div>
          </div>
        </div>
        <div style={{ fontSize: 19, fontWeight: 800, color: NAVY, marginBottom: 20 }}>{proposal.title}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid #eee' }}>
              <th style={{ width: 28, padding: '8px 0' }}></th>
              <th style={{ textAlign: 'left', padding: '8px 0', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase' }}>{t('productColumnHeader')}</th>
              <th style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase' }}>{t('quantityColumnHeader')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f4f4f4', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                <td style={{ padding: '12px 0' }}>
                  <div style={{ width: 16, height: 16, border: '1.5px solid #ccc', borderRadius: 3 }} />
                </td>
                <td style={{ padding: '12px 10px 12px 0' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 6, background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {r.photo_signed_url ? <img src={r.photo_signed_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span>📦</span>}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{r.description}</span>
                  </div>
                </td>
                <td style={{ textAlign: 'center', fontSize: 15, fontWeight: 700 }}>x{r.quantity}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3} style={{ padding: '20px 0', color: '#999', fontSize: 13, textAlign: 'center' }}>{t('noProductsInOption')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
