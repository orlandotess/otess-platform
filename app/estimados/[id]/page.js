export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { Fragment } from 'react';
import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import EstimateActions from './EstimateActions';

// Materials added by the cable/tubo calculator share a `title` (set per calculator
// run) so multiple materials for the same area collapse into one client-facing row,
// while the underlying rows stay separate for the purchase list / purchase orders.
// Items without a title, or whose title doesn't repeat for that area, always render
// on their own with their real quantity/price — only an actual repeated title collapses.
function groupItemsForDisplay(items) {
  const rows = items ?? [];
  const titleCounts = new Map();
  for (const item of rows) {
    if (!item.title) continue;
    const key = `${item.area || ''}|||${item.title}`;
    titleCounts.set(key, (titleCounts.get(key) || 0) + 1);
  }

  const groups = new Map();
  const display = [];
  for (const item of rows) {
    const key = item.title ? `${item.area || ''}|||${item.title}` : null;
    if (!key || titleCounts.get(key) === 1) { display.push({ kind: 'single', item }); continue; }
    let group = groups.get(key);
    if (!group) {
      group = { kind: 'group', key, title: item.title, area: item.area, type: item.type, tax_rate: item.tax_rate, photo_signed_url: item.photo_signed_url ?? null, parts: [], line_total: 0, tax_amount: 0, supplier_total: 0 };
      groups.set(key, group);
      display.push(group);
    }
    group.parts.push(`${item.quantity}x ${item.description}`);
    group.line_total += Number(item.line_total) || 0;
    group.tax_amount += Number(item.tax_amount) || 0;
    if (item.supplier_price != null) group.supplier_total += (Number(item.supplier_price) || 0) * (Number(item.quantity) || 0);
  }
  return display;
}

// Buckets the already-consolidated display rows into area sections, in the
// order each area first appears — mirrors ProposalDocument.js's groupByArea()
// so estimates render the same "Área / Área Total" sectioned layout.
function groupDisplayByArea(displayItems) {
  const areas = [];
  for (const entry of displayItems) {
    const name = (entry.kind === 'group' ? entry.area : entry.item.area) || 'General';
    let area = areas.find(a => a.name === name);
    if (!area) { area = { name, entries: [] }; areas.push(area); }
    area.entries.push(entry);
  }
  return areas;
}
// A parent's line_total/tax_amount already reflects its own price only; its
// accessories' own rows are summed in separately here. Bundled accessories
// don't need special-casing — their line_total/tax_amount were already
// persisted as 0 at save time (see EstimateForm.js's itemLineTotal), so
// summing them in unconditionally is safe either way.
function entryTotal(entry) {
  if (entry.kind === 'group') return entry.line_total + entry.tax_amount;
  const own = Number(entry.item.line_total) + Number(entry.item.tax_amount);
  const childrenTotal = (entry.item.children ?? []).reduce((s, c) => s + Number(c.line_total) + Number(c.tax_amount), 0);
  return own + childrenTotal;
}

export default async function EstimaDetail({ params }) {
  const { id } = params;

  const { data: est } = await supabase
    .from('estimates')
    .select('*, client_id, clients(name, email, phone, company, client_type, client_addresses(*), client_properties(*)), jobs!estimates_job_id_fkey(id, title, client_properties(*))')
    .eq('id', id)
    .single();

  if (!est) return <div style={{ padding: 40 }}>Estimado no encontrado</div>;

  const { data: rawItems } = await supabase.from('estimate_line_items').select('*').eq('estimate_id', id).order('sort_order');
  const items = await Promise.all(
    (rawItems ?? []).map(async it => {
      if (!it.photo_url) return it;
      const { data } = await supabase.storage.from('Job-photos').createSignedUrl(it.photo_url, 3600);
      return { ...it, photo_signed_url: data?.signedUrl ?? null };
    })
  );
  const topLevelItems = items.filter(it => !it.parent_item_id);
  const childrenByParentId = new Map();
  for (const it of items) {
    if (!it.parent_item_id) continue;
    if (!childrenByParentId.has(it.parent_item_id)) childrenByParentId.set(it.parent_item_id, []);
    childrenByParentId.get(it.parent_item_id).push(it);
  }
  const displayItems = groupItemsForDisplay(topLevelItems);
  for (const entry of displayItems) {
    if (entry.kind === 'single') entry.item.children = childrenByParentId.get(entry.item.id) ?? [];
  }
  const displayAreas = groupDisplayByArea(displayItems);
  const multiArea = displayAreas.length > 1 || (displayAreas[0]?.name && displayAreas[0].name !== 'General');

  const { data: clientContacts } = est.client_id
    ? await supabase.from('client_contacts').select('id, name, email').eq('client_id', est.client_id)
    : { data: [] };

  const primaryAddr = est.clients?.client_addresses?.find(a => a.is_primary) ?? est.clients?.client_addresses?.[0];
  const clientProperties = est.clients?.client_properties ?? [];
  const property = est.property_id
    ? clientProperties.find(p => p.id === est.property_id) ?? null
    : est.jobs?.client_properties ?? null;

  const billToName = est.bill_to === 'company' && est.clients?.company
    ? est.clients.company
    : est.clients?.name;

  const statusLabel = { draft: 'Borrador', sent: 'Enviado', accepted: 'Aceptado', cancelled: 'Cancelado', converted: 'Convertido a trabajo' };
  const statusCls = { draft: 'badge-gray', sent: 'badge-blue', accepted: 'badge-green', cancelled: 'badge-red', converted: 'badge-amber' };

  return (
    <div className="admin-shell ds-estimados">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">{est.estimate_number}</div>
            {est.title && <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>{est.title}</div>}
            <span className={`badge ${statusCls[est.status]}`} style={{ marginTop: 6, display: 'inline-block' }}>
              {statusLabel[est.status]}
            </span>
          </div>
          <EstimateActions
            estimateId={id}
            status={est.status}
            clientId={est.client_id}
            clientEmail={est.clients?.email}
            estimateNumber={est.estimate_number}
            title={est.title ?? ''}
            clientName={est.clients?.name}
            clientCompany={est.clients?.company}
            billTo={est.bill_to ?? 'person'}
            clientProperties={clientProperties}
            propertyId={est.property_id ?? null}
            initialProperty={property}
            terms={est.terms ?? ''}
            notes={est.notes ?? ''}
            items={items ?? []}
            clientContacts={clientContacts ?? []}
            convertedToJobId={est.converted_to_job_id ?? null}
            archivedAt={est.archived_at ?? null}
          />
        </div>

        <div className="card" id="estimate-doc" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--navy)', letterSpacing: -1 }}>OTESS</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>OT Electrical & Security Solutions</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Calle 56, #2D8 Lomas de Carolina</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Carolina, PR 00987</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>(787) 513-8352 · info@otesspr.com</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--navy)', letterSpacing: -1 }}>ESTIMADO</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--amber)', fontFamily: 'monospace' }}>{est.estimate_number}</div>
              {est.title && <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', marginTop: 4 }}>{est.title}</div>}
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Fecha: <strong>{est.issued_at}</strong></div>
              {est.valid_until && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Válida hasta: <strong>{est.valid_until}</strong></div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: property ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 28 }}>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Preparado para</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{billToName}</div>
              {est.bill_to !== 'company' && est.clients?.company && (
                <div style={{ color: 'var(--muted)', fontSize: 14 }}>{est.clients.company}</div>
              )}
              {primaryAddr && (
                <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                  {primaryAddr.line1}, {primaryAddr.city} {primaryAddr.zip}
                </div>
              )}
              {est.clients?.email && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{est.clients.email}</div>}
              {est.clients?.phone && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{est.clients.phone}</div>}
              {est.clients?.client_type === 'b2b' && (
                <span className="badge badge-blue" style={{ marginTop: 6, display: 'inline-block' }}>Comerciante Registrado B2B</span>
              )}
            </div>

            {property && (
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '16px 20px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Propiedad del servicio</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{property.name}</div>
                {property.street && <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>{property.street}</div>}
                {property.city && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{property.city}{property.zip ? `, PR ${property.zip}` : ''}</div>}
              </div>
            )}
          </div>

          {displayAreas.map(area => (
          <div key={area.name} style={{ marginBottom: 24 }}>
            {multiArea && (
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>📍 {area.name}</div>
            )}
          <table style={{ marginBottom: multiArea ? 8 : 0 }}>
            <thead>
              <tr style={{ background: 'var(--navy)' }}>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'left', fontSize: 11 }}>Descripción</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'center', fontSize: 11 }}>Tipo</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'right', fontSize: 11 }}>Cant.</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'right', fontSize: 11 }}>Precio</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'right', fontSize: 11 }}>IVU</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'right', fontSize: 11 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {area.entries.map(entry => entry.kind === 'group' ? (
                <tr key={entry.key}>
                  <td style={{ padding: '12px 14px', fontWeight: 500 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {entry.photo_signed_url ? <img src={entry.photo_signed_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span>{entry.type === 'labor' ? '🔧' : '📦'}</span>}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>{entry.title}</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{entry.parts.join(', ')}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span className={`badge ${entry.type === 'labor' ? 'badge-amber' : 'badge-gray'}`} style={{ fontSize: 10 }}>
                      {entry.type === 'labor' ? 'Labor' : 'Producto'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--muted)' }}>—</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--muted)' }}>
                    —
                    {entry.supplier_total > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--warn)' }}>Costo: ${entry.supplier_total.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--muted)', fontSize: 12 }}>
                    {entry.tax_rate === 0 ? 'Exento' : `${(entry.tax_rate * 100).toFixed(1)}%`}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700 }}>${(entry.line_total + entry.tax_amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                </tr>
              ) : (
                <Fragment key={entry.item.id}>
                <tr>
                  <td style={{ padding: '12px 14px', fontWeight: 500 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {entry.item.photo_signed_url ? <img src={entry.item.photo_signed_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span>{entry.item.type === 'labor' ? '🔧' : '📦'}</span>}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        {entry.item.title && <div style={{ fontWeight: 700, marginBottom: 2 }}>{entry.item.title}</div>}
                        <div style={{ whiteSpace: 'pre-wrap' }}>{entry.item.description}</div>
                        {childrenByParentId.get(entry.item.id)?.length > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginTop: 2 }}>
                            {childrenByParentId.get(entry.item.id).length} accesorio{childrenByParentId.get(entry.item.id).length > 1 ? 's' : ''} incluido{childrenByParentId.get(entry.item.id).length > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span className={`badge ${entry.item.type === 'labor' ? 'badge-amber' : 'badge-gray'}`} style={{ fontSize: 10 }}>
                      {entry.item.type === 'labor' ? 'Labor' : 'Producto'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--muted)' }}>{entry.item.quantity}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--muted)' }}>
                    {entry.item.msrp != null && (
                      <div style={{ fontSize: 10, color: 'var(--muted)', textDecoration: 'line-through' }}>${Number(entry.item.msrp).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    )}
                    ${Number(entry.item.unit_price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    {entry.item.supplier_price != null && (
                      <div style={{ fontSize: 10, color: 'var(--warn)' }}>Costo: ${Number(entry.item.supplier_price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--muted)', fontSize: 12 }}>
                    {entry.item.tax_rate === 0 ? 'Exento' : `${(entry.item.tax_rate * 100).toFixed(1)}%`}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700 }}>${(Number(entry.item.line_total) + Number(entry.item.tax_amount)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                </tr>
                {(childrenByParentId.get(entry.item.id) ?? []).map(child => {
                  const bundled = entry.item.combine_price !== false;
                  return (
                    <tr key={child.id} style={{ background: 'var(--surface-2)' }}>
                      <td style={{ padding: '8px 14px 8px 46px', fontWeight: 400, fontSize: 12.5 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 6, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {child.photo_signed_url ? <img src={child.photo_signed_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 11 }}>{child.type === 'labor' ? '🔧' : '📦'}</span>}
                          </div>
                          <div style={{ whiteSpace: 'pre-wrap' }}>{child.description}</div>
                        </div>
                      </td>
                      <td />
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: 'var(--muted)', fontSize: 12.5 }}>{child.quantity}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: 'var(--muted)', fontSize: 12.5 }}>{bundled ? '—' : `$${Number(child.unit_price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}</td>
                      <td />
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12.5 }}>{bundled ? '—' : `$${(Number(child.line_total) + Number(child.tax_amount)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}</td>
                    </tr>
                  );
                })}
                </Fragment>
              ))}
            </tbody>
          </table>
          {multiArea && (
            <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--muted)' }}>
              {area.name} Total: ${area.entries.reduce((s, e) => s + entryTotal(e), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
          </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 320 }}>
              {[
                { label: 'Subtotal productos', value: est.subtotal_products },
                { label: 'IVU productos (11.5%)', value: est.tax_products },
                { label: 'Subtotal labor', value: est.subtotal_labor },
                { label: `IVU labor (${est.clients?.client_type === 'b2b' ? '4%' : '11.5%'})`, value: est.tax_labor },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                  <span>${Number(row.value).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 20, fontWeight: 900, color: 'var(--navy)' }}>
                <span>TOTAL</span>
                <span>${Number(est.total).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
            </div>
          </div>

          {est.notes && (
            <div style={{ marginTop: 24, padding: '14px 18px', background: 'var(--surface-2)', borderRadius: 10, fontSize: 13, color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--navy)' }}>Notas:</strong> {est.notes}
            </div>
          )}

          {est.terms && (
            <div style={{ marginTop: 16, padding: '14px 18px', background: 'var(--surface-2)', borderRadius: 10, fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--navy)', display: 'block', marginBottom: 8, fontSize: 13 }}>Términos del Proyecto</strong>
              {est.terms.split('\n').map((line, i) => line.trim() ? <p key={i} style={{ margin: '0 0 8px' }}>{line}</p> : null)}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
