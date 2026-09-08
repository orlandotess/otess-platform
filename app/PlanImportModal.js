'use client';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '../lib/supabase';
import { getEquipmentType } from './equipmentIcons';
import {
  buildRooms, buildPurchaseList, buildCableTotals, makeCableLengthFeet, planFeetPerPixel,
  isRackMarker, SWITCH_PORTS,
} from './planoItems';

/**
 * PlanImportModal — brings a floor plan's item list into a document as line
 * items. Mounted wherever CableCalculator already is, and it emits the same
 * `onAdd` payload, so the forms that receive prefilled lines need no changes.
 *
 * The list is the same one the plan's CSV exports, computed by the same
 * functions (app/planoItems.js): every article added up across the whole plan —
 * the keystone at the outlet and the keystone at the panel on one line — plus
 * the cable by the box, which the article list deliberately leaves out.
 *
 * Each article lands as its own top-level line (no groupIndex): a plan's list
 * is read article by article, unlike a calculator run, which is one lot.
 *
 * What comes in is a snapshot. Change the plan afterwards and this document
 * does not follow — re-importing and reconciling by hand is a decision, not
 * something to do silently to a quote somebody may already have priced.
 */
export default function PlanImportModal({ catalogItems = [], clientId = null, jobId = null, onAdd, onClose }) {
  const t = useTranslations('shared.planImport');
  const tEquipmentTypes = useTranslations('shared.equipmentTypes');
  const [plans, setPlans] = useState(null);
  const [planId, setPlanId] = useState('');
  const [data, setData] = useState(null); // rows for the chosen plan
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [excluded, setExcluded] = useState(() => new Set()); // lines the user unchecked
  const [quantities, setQuantities] = useState({}); // key -> overridden quantity

  // Plans for this client or job first: a document is nearly always quoting the
  // plan somebody just drew for it.
  useEffect(() => {
    supabase.from('floor_plans')
      .select('id, name, client_id, job_id, patch_panel_ports, cable_managers, scale_points, scale_distance_ft, created_at')
      .order('created_at', { ascending: false })
      .then(({ data: rows, error: err }) => {
        if (err) { setError(err.message); setPlans([]); return; }
        const related = p => (jobId && p.job_id === jobId ? 2 : 0) + (clientId && p.client_id === clientId ? 1 : 0);
        const sorted = (rows ?? []).slice().sort((a, b) => related(b) - related(a));
        setPlans(sorted);
        const best = sorted[0];
        if (best && related(best) > 0) setPlanId(best.id);
      });
  }, [clientId, jobId]);

  useEffect(() => {
    if (!planId) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      const plan = plans.find(p => p.id === planId);
      const [{ data: markers }, { data: elementTypes }, { data: customIcons }, { data: planMaterials }, { data: cableTypes }, { data: cables }] = await Promise.all([
        supabase.from('floor_plan_markers').select('*').eq('floor_plan_id', planId).order('sort_order'),
        // Every element type, not just the active ones: a marker placed under an
        // element that was later retired still has to be bought.
        supabase.from('element_types').select('*'),
        supabase.from('custom_equipment_icons').select('id, name'),
        supabase.from('floor_plan_materials').select('*').eq('floor_plan_id', planId).order('sort_order'),
        supabase.from('cable_types').select('*'),
        supabase.from('floor_plan_cables').select('*').eq('floor_plan_id', planId),
      ]);
      const markerIds = (markers ?? []).map(m => m.id);
      const { data: accessories } = markerIds.length
        ? await supabase.from('floor_plan_marker_accessories').select('*').in('marker_id', markerIds).order('sort_order')
        : { data: [] };
      if (cancelled) return;
      setData({
        plan, markers: markers ?? [], elementTypes: elementTypes ?? [], customIcons: customIcons ?? [],
        planMaterials: planMaterials ?? [], cableTypes: cableTypes ?? [], cables: cables ?? [],
        accessories: accessories ?? [],
      });
      setExcluded(new Set());
      setQuantities({});
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [planId, plans]);

  const { articles, cable } = useMemo(() => {
    if (!data) return { articles: [], cable: [] };
    const { plan, markers, elementTypes, customIcons, planMaterials, accessories, cableTypes, cables } = data;
    const rackName = (rack, i) => rack.label || t('rackFallback', { number: i + 1 });
    const racks = markers.filter(m => isRackMarker(m, elementTypes));
    const rooms = buildRooms({ plan, markers, elementTypes }).map(room => ({
      ...room,
      name: room.marker ? rackName(room.marker, racks.indexOf(room.marker)) : t('unassignedDrops'),
      // Loose gear on the rack itself rides on the marker as accessories, the
      // same way a faceplate rides on a jack.
      items: room.marker
        ? accessories.filter(a => a.marker_id === room.marker.id).map(a => ({
            name: a.name, catalogItemId: a.catalog_item_id || null,
            quantity: (a.quantity ?? 1) * (room.marker.quantity ?? 1),
          }))
        : [],
    }));
    return {
      articles: buildPurchaseList({
        markers, elementTypes, accessories, planMaterials, customIcons,
        catalogProducts: catalogItems, rooms,
        legacyLabel: key => {
          const eqType = key ? getEquipmentType(key) : null;
          return eqType ? tEquipmentTypes(eqType.key) : null;
        },
        labels: {
          noProduct: t('noProduct'),
          extraMaterials: t('extraMaterials'),
          telecomRoom: t('telecomRoom'),
          keystones: t('keystoneJacks'),
          patchPanel: ports => t('patchPanels', { ports }),
          switch: ports => t('switches', { ports }),
          cableManagers: t('cableManagers'),
        },
      }),
      cable: buildCableTotals({
        markers, cables, cableTypes,
        cableLengthFeet: makeCableLengthFeet(plan, markers),
        feetPerPixel: planFeetPerPixel(plan),
      }).filter(c => c.boxes > 0),
    };
  }, [data, catalogItems, t, tEquipmentTypes]);

  // Cable is bought by the box, so that is the line: the article list keeps it
  // out precisely because a box is not a unit.
  const cableLines = cable.map(c => {
    const product = c.catalogItemId ? catalogItems.find(ci => ci.id === c.catalogItemId) : null;
    return {
      key: `cable:${c.cableTypeId}`,
      catalogItemId: c.catalogItemId,
      label: product ? (product.name || product.item_code) : c.name,
      code: product?.item_code || '',
      vendor: (product?.vendor || '').trim(),
      price: product?.price != null ? Number(product.price) : null,
      supplierPrice: product?.supplier_price != null ? Number(product.supplier_price) : null,
      quantity: c.boxes,
      sources: [{ label: t('cableFeet', { feet: Math.round(c.total) }), quantity: c.boxes }],
      isCable: true,
    };
  });

  const allLines = [...articles, ...cableLines];
  const included = allLines.filter(l => !excluded.has(l.key));
  const quantityOf = line => quantities[line.key] ?? line.quantity;
  const total = included.reduce((sum, l) => sum + (l.price != null ? l.price * quantityOf(l) : 0), 0);
  const unpriced = included.filter(l => l.price == null).length;

  function toggle(key) {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function addSelected() {
    for (const line of included) {
      const product = line.catalogItemId ? catalogItems.find(ci => ci.id === line.catalogItemId) : null;
      onAdd({
        // A catalog line carries the catalog's own wording; a free-typed one
        // only ever had the name somebody wrote on the plan. Leaving that
        // title empty is load-bearing, not lazy: the estimate turns a titled
        // line with no catalog_item_id into a new catalog item on save, and an
        // element name ("Fixed Camera") has no business becoming a product.
        title: product ? (product.name || '') : '',
        description: product ? (product.description || product.name || line.label) : line.label,
        vendor: line.vendor || '',
        quantity: quantityOf(line),
        unit_price: line.price ?? 0,
        supplier_price: line.supplierPrice ?? 0,
        msrp: product?.msrp ?? '',
        catalog_item_id: line.catalogItemId || null,
      });
    }
    onClose();
  }

  // Same money formatting the document itself uses — a five-figure total with
  // no separators reads as the wrong number at a glance.
  const money = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const cellStyle = { padding: '5px 6px', fontSize: 12, borderBottom: '1px solid var(--border)' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 760, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 16 }}>📐 {t('title')}</h2>

        {plans === null ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('loadingPlans')}</p>
        ) : plans.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('noPlans')}</p>
        ) : (
          <select value={planId} onChange={e => setPlanId(e.target.value)} style={{ width: '100%', fontSize: 13, marginBottom: 14 }}>
            <option value="">{t('choosePlan')}</option>
            {plans.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{jobId && p.job_id === jobId ? ` · ${t('thisJob')}` : clientId && p.client_id === clientId ? ` · ${t('thisClient')}` : ''}
              </option>
            ))}
          </select>
        )}

        {error && <p style={{ fontSize: 12, color: 'var(--warn)', marginBottom: 10 }}>{error}</p>}
        {loading && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('loadingList')}</p>}

        {!loading && data && allLines.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('emptyPlan')}</p>
        )}

        {!loading && allLines.length > 0 && (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)' }}>
                  <th style={{ ...cellStyle, width: 28 }} />
                  <th style={cellStyle}>{t('columnArticle')}</th>
                  <th style={{ ...cellStyle, width: 110 }}>{t('columnCode')}</th>
                  <th style={{ ...cellStyle, width: 110 }}>{t('columnVendor')}</th>
                  <th style={{ ...cellStyle, width: 70, textAlign: 'right' }}>{t('columnQuantity')}</th>
                  <th style={{ ...cellStyle, width: 80, textAlign: 'right' }}>{t('columnPrice')}</th>
                </tr>
              </thead>
              <tbody>
                {allLines.map(line => {
                  const off = excluded.has(line.key);
                  return (
                    <tr key={line.key} style={{ opacity: off ? 0.45 : 1 }}>
                      <td style={cellStyle}>
                        <input type="checkbox" checked={!off} onChange={() => toggle(line.key)} />
                      </td>
                      <td style={cellStyle}>
                        <div>{line.isCable ? `📦 ${line.label}` : line.label}</div>
                        {/* Where the quantity came from, so a number that looks
                            wrong can be traced without opening the plan. */}
                        {line.sources.length > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                            {line.sources.map(s => `${s.label} ${s.quantity}`).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td style={{ ...cellStyle, color: line.code ? undefined : 'var(--warn)' }}>
                        {line.code || t('noProduct')}
                      </td>
                      <td style={cellStyle}>{line.vendor || '—'}</td>
                      <td style={{ ...cellStyle, textAlign: 'right' }}>
                        <input
                          type="number" min="0" step="1" inputMode="numeric"
                          value={quantityOf(line)}
                          onChange={e => setQuantities(prev => ({ ...prev, [line.key]: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                          style={{ width: 60, fontSize: 12, padding: '2px 4px', textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right' }}>
                        {line.price != null ? money(line.price) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12, fontSize: 13 }}>
              <span style={{ color: 'var(--muted)' }}>
                {t('selectedCount', { count: included.length })}
                {unpriced > 0 && ` · ${t('unpricedCount', { count: unpriced })}`}
              </span>
              <span style={{ fontWeight: 800 }}>{money(total)}</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>{t('snapshotNote')}</p>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button type="button" className="btn btn-primary" disabled={included.length === 0}
            onClick={addSelected} style={{ flex: 1, justifyContent: 'center' }}>
            {t('addLines', { count: included.length })}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} style={{ justifyContent: 'center' }}>{t('cancel')}</button>
        </div>
      </div>
    </div>
  );
}
