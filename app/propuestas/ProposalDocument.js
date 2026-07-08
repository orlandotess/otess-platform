import { Fragment } from 'react';

const NAVY = '#16223d';

const DEFAULT_ABOUT_US = `Somos especialistas en la integración de tecnología para crear espacios inteligentes, seguros y eficientes. Nos dedicamos al diseño, instalación y automatización de sistemas de audio, video, iluminación, cableado estructurado, redes y seguridad, brindando así soluciones personalizadas para hogares, oficinas y negocios.

En OTESS transformamos el entorno en un espacio moderno, funcional y seguro.`;

const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' }).toUpperCase() : null;

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

export function financialBreakdown(items, clientType, taxRules) {
  let parts = 0, labor = 0, taxParts = 0, taxLabor = 0, totalDiscount = 0;
  (items ?? []).filter(it => !it.parent_item_id).forEach(it => {
    const base = itemTotal(it);
    totalDiscount += it.discount_amount || 0;
    const lineType = it.item_type === 'product' ? 'product' : 'labor';
    const rule = (taxRules ?? []).find(r => r.client_type === clientType && r.line_item_type === lineType);
    const rate = it.exempt_reason ? 0 : (rule?.rate ?? 0.115);
    if (lineType === 'product') { parts += base; taxParts += base * rate; }
    else { labor += base; taxLabor += base * rate; }
  });
  return { parts, labor, taxParts, taxLabor, totalDiscount, subtotal: parts + labor, tax: taxParts + taxLabor, total: parts + labor + taxParts + taxLabor };
}

const page = { padding: '50px', minHeight: 700, background: '#fff' };
const pageBreak = { ...page, breakBefore: 'page', pageBreakBefore: 'always' };
const h2 = { fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 20 };

export default function ProposalDocument({ proposal, option, companyInfo, primaryAddress, taxRules, payments }) {
  const clientType = proposal.tax_client_type ?? proposal.clients?.client_type ?? 'final';
  const areas = groupByArea(option.items ?? []);
  const fb = financialBreakdown(option.items, clientType, taxRules);
  const basisAmount = { parts: fb.parts, labor: fb.labor, subtotal: fb.subtotal };
  const partsRate = fb.parts > 0 ? (fb.taxParts / fb.parts * 100).toFixed(1) : '11.5';
  const laborRate = fb.labor > 0 ? (fb.taxLabor / fb.labor * 100).toFixed(1) : (clientType === 'b2b' ? '4' : '11.5');

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', color: '#1a1a1a' }}>
      {/* Cover */}
      <div style={{ ...page, display: 'flex', flexDirection: 'column', minHeight: 850 }}>
        <div style={{ flex: 1 }} />
        <div>
          <div style={{ fontSize: 40, fontWeight: 900, marginBottom: 36, letterSpacing: -1 }}>{proposal.title}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#999', letterSpacing: '0.08em', marginBottom: 6 }}>A PROPOSAL FOR</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: NAVY, marginBottom: 10 }}>{proposal.clients?.company || proposal.clients?.name}</div>
          <div style={{ fontSize: 14, lineHeight: 1.8 }}>
            {proposal.clients?.company && <div>{proposal.clients?.name}</div>}
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
            {proposal.prepared_by ? `PREPARED BY ${proposal.prepared_by.toUpperCase()}` : ''}
            {proposal.prepared_by && proposal.valid_until ? ' • ' : ''}
            {proposal.valid_until ? `EXPIRES ${fmtDate(proposal.valid_until)}` : ''}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/otess-logo.png" alt="OTESS" style={{ height: 26 }} />
            <span style={{ fontSize: 13, color: '#999', fontWeight: 600 }}>OT Electrical And Security Solutions</span>
          </div>
        </div>
      </div>

      {/* About Us */}
      <div style={pageBreak}>
        <div style={h2}>About Us</div>
        <p style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{companyInfo?.about_us || DEFAULT_ABOUT_US}</p>
      </div>

      {/* Areas & Items */}
      {areas.map((area, areaIdx) => {
        const areaTotal = area.items.reduce((s, it) => s + itemTotal(it), 0);
        return (
          <div key={area.name} style={pageBreak}>
            {areaIdx === 0 && <div style={h2}>Areas & Items</div>}
            <div style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 14 }}>{area.name}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #eee' }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase' }}>Items</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase' }}>Sell Price</th>
                  <th style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase' }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {area.items.map(it => {
                  const bundled = it.children.length > 0 || it.discount_amount > 0;
                  return (
                    <Fragment key={it.id}>
                      <tr style={{ borderBottom: it.children.length ? 'none' : '1px solid #f4f4f4' }}>
                        <td style={{ padding: '14px 10px 14px 0', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {it.photo_signed_url ? <img src={it.photo_signed_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span>{it.item_type === 'product' ? '📦' : '🔧'}</span>}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{it.description}</div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 13.5, color: '#333', verticalAlign: 'top', paddingTop: 14 }}>{bundled ? '' : fmt(it.unit_price)}</td>
                        <td style={{ textAlign: 'center', fontSize: 13.5, color: '#333', verticalAlign: 'top', paddingTop: 14 }}>x{it.quantity}</td>
                        <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: 14 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(itemTotal(it))}</div>
                          {it.children.length > 0 && <div style={{ fontSize: 10.5, color: '#999' }}>Combined Price</div>}
                          {it.discount_amount > 0 && <div style={{ fontSize: 11, color: '#1a7a4a', fontWeight: 600 }}>{fmt(it.discount_amount)} Discount</div>}
                        </td>
                      </tr>
                      {it.children.map((child, ci) => (
                        <tr key={child.id} style={{ borderBottom: ci === it.children.length - 1 ? '1px solid #f4f4f4' : 'none' }}>
                          <td style={{ padding: '2px 10px 10px 52px', display: 'flex', gap: 12, alignItems: 'center' }}>
                            <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 6, background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                              {child.photo_signed_url ? <img src={child.photo_signed_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 12 }}>🔩</span>}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#444' }}>{child.description}</div>
                          </td>
                          <td></td>
                          <td style={{ textAlign: 'center', fontSize: 13, color: '#999' }}>x{child.quantity}</td>
                          <td></td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, color: NAVY, marginTop: 14, paddingTop: 12, borderTop: '1px solid #eee' }}>
              {area.name} Total: {fmt(areaTotal)}
            </div>
          </div>
        );
      })}

      {/* Financial Summary */}
      <div style={pageBreak}>
        <div style={h2}>Financial Summary</div>
        <div style={{ display: 'flex', gap: 40 }}>
          <div style={{ flex: 1 }}>
            {fb.totalDiscount > 0 && (
              <div style={{ background: '#e7f3ee', borderRadius: 8, padding: '14px 16px', fontSize: 13, color: '#1a7a4a', lineHeight: 1.6 }}>
                You received <strong>{fmt(fb.totalDiscount)}</strong> in line item discounts on this proposal.
              </div>
            )}
          </div>
          <div style={{ width: 300 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}><span style={{ color: '#666' }}>Total Parts</span><span style={{ fontWeight: 700 }}>{fmt(fb.parts)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}><span style={{ color: '#666' }}>Total Labor</span><span style={{ fontWeight: 700 }}>{fmt(fb.labor)}</span></div>
            <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}><span>Subtotal</span><span style={{ fontWeight: 700 }}>{fmt(fb.subtotal)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}><span>Sales Tax</span><span>{fmt(fb.tax)}</span></div>
            <div style={{ fontSize: 10.5, color: '#999', textAlign: 'right' }}>Parts: {partsRate}% Labor: {laborRate}%</div>
            <hr style={{ border: 'none', borderTop: '1.5px solid #ddd', margin: '10px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18, color: NAVY }}><span>Proposal Total</span><span>{fmt(fb.total)}</span></div>
          </div>
        </div>
      </div>

      {/* Payment Schedule + Terms */}
      <div style={pageBreak}>
        {payments && payments.length > 0 && (
          <>
            <div style={h2}>Payment Schedule</div>
            <div style={{ border: '1px solid #eee', borderRadius: 8, marginBottom: 36 }}>
              {payments.map((p, i) => (
                <div key={p.id ?? i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: i < payments.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{p.label}</span>
                    <span style={{ fontSize: 13, color: '#777', marginLeft: 8 }}>
                      {p.percent}% of {p.basis === 'parts' ? 'Parts' : p.basis === 'labor' ? 'Labor' : 'Subtotal'} Total{p.due_trigger ? ` • Due ${p.due_trigger}` : ''}
                    </span>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{fmt((basisAmount[p.basis] ?? 0) * (p.percent / 100))}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div style={h2}>Project Terms</div>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: '#444', whiteSpace: 'pre-line' }}>{proposal.terms}</p>
        {proposal.valid_until && (
          <p style={{ fontSize: 12, color: '#999', marginTop: 16 }}>Esta propuesta es válida hasta el {fmtDate(proposal.valid_until)}.</p>
        )}
      </div>
    </div>
  );
}
