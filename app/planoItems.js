// What a floor plan says has to be bought — the math, with no screen and no
// file attached to it.
//
// This used to live in two places at once: the telecom-room sizing inside
// PlanoEditor's render, and the article tally inside exportEquipmentListCSV.
// A third caller (importing a plan's list into an estimate) is what forced the
// split: a room sized twice is a room that will eventually be sized
// differently in each place, and nobody would notice until the wrong number of
// patch panels showed up on a job.
//
// Nothing here reads state, translates a string, or touches the DOM. Callers
// pass rows in and labels for the derived lines, and get plain data back.

// ── Scale ───────────────────────────────────────────────────────────────────
// Marker and bend-point coordinates are fractions of the image, so a traced
// run is only measurable once somebody drew the scale on the plan.

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function planFeetPerPixel(plan) {
  return plan?.scale_points && plan?.scale_distance_ft
    ? plan.scale_distance_ft / dist(plan.scale_points[0], plan.scale_points[1])
    : null;
}

// The length of one traced run, in feet — null when the plan has no scale, or
// when either end of the run is missing.
export function makeCableLengthFeet(plan, markers) {
  const feetPerPixel = planFeetPerPixel(plan);
  const byId = id => markers.find(m => m.id === id);
  return cable => {
    if (!feetPerPixel) return null;
    const from = byId(cable.from_marker_id);
    const to = byId(cable.to_marker_id);
    if (!from || !to) return null;
    const pts = [{ x: from.pos_x, y: from.pos_y }, ...(cable.bend_points || []), { x: to.pos_x, y: to.pos_y }];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) total += dist(pts[i], pts[i + 1]);
    return total * feetPerPixel;
  };
}

export const NO_RACK = '__norack__';
// The switch this shop racks, and the panel size a room starts at. 24s
// sandwich a switch between two panels and save the horizontal cable managers;
// 48 is what this shop specs by default.
export const SWITCH_PORTS = 48;
export const DEFAULT_PATCH_PANEL_PORTS = 48;

export const getMarkerElement = (marker, elementTypes) =>
  marker.element_id ? elementTypes.find(et => et.id === marker.element_id) : null;

// A rack terminates drops; it never is one. That is what keeps the keystone
// count honest (migrations/2026-09-07-racks-per-plan.sql).
export const isRackMarker = (marker, elementTypes) => !!getMarkerElement(marker, elementTypes)?.is_rack;

// What a marker is ordered as: its own product when somebody picked one, and
// otherwise the element's default (migrations/2026-09-07c-purchase-list-catalog.sql).
export const markerProductId = (marker, elementTypes) =>
  marker.catalog_item_id || getMarkerElement(marker, elementTypes)?.default_catalog_item_id || null;

// Panels sized at 24 can sandwich a 48-port switch — one above, one below — so
// every patch cord crosses a single rack unit and the pair needs no horizontal
// cable manager. At 48 the sandwich breaks and a manager goes back between each
// panel and its switch.
export function sizeRoom(drops, ports) {
  const panels = Math.ceil(drops / ports);
  const switches = Math.ceil(drops / SWITCH_PORTS);
  const managers = ports * 2 === SWITCH_PORTS ? 0 : panels;
  return {
    ports, panels, switches, managers,
    spare: panels * ports - drops,
    rackUnits: panels * (ports > 24 ? 2 : 1) + switches + managers,
  };
}

/**
 * One room per rack: a rack with 38 drops is one 48-port panel, not a slice of
 * a plan-wide total. Drops nobody assigned get a room of their own rather than
 * falling off the purchase list.
 *
 * Every drop lands twice — the keystone at the outlet (already counted as the
 * equipment itself) and one at the patch panel — so a room needs exactly one
 * keystone and one panel port per drop. A drop is equipment with a cable run
 * assigned; on a plan where nobody assigned cable yet, every piece of equipment
 * is the number the tech would have counted by hand, so that is the fallback.
 *
 * `markers` is whatever the caller wants counted (the editor passes only the
 * visible layers; an import counts the whole plan).
 */
export function buildRooms({ plan, markers, elementTypes }) {
  const dropCandidates = markers.filter(m => !isRackMarker(m, elementTypes));
  const cabledDrops = dropCandidates.filter(m => m.cable_type_id);
  const dropMarkers = cabledDrops.length > 0 ? cabledDrops : dropCandidates;

  const planPorts = plan.patch_panel_ports ?? DEFAULT_PATCH_PANEL_PORTS;
  const dropsByRack = new Map();
  for (const m of dropMarkers) {
    const key = m.rack_marker_id || NO_RACK;
    if (!dropsByRack.has(key)) dropsByRack.set(key, []);
    dropsByRack.get(key).push(m);
  }

  const buildRoom = (key, marker, rackDrops) => {
    const drops = rackDrops.reduce((sum, m) => sum + (m.quantity ?? 1), 0);
    const ports = marker?.rack_patch_panel_ports ?? planPorts;
    const options = [24, 48].map(p => sizeRoom(drops, p));
    const derived = options.find(o => o.ports === ports) ?? options[0];
    // How many cable managers go in depends on the rack the installer draws,
    // so the derived number is only a starting point.
    const overridden = marker ? marker.rack_cable_managers != null : plan.cable_managers != null;
    const managers = overridden
      ? (marker ? marker.rack_cable_managers : plan.cable_managers)
      : derived.managers;
    // The keystones in the room are the ones on the floor — read off the drops
    // themselves rather than picked again here, which is the only way the two
    // ends can't drift apart. Two keystones on one rack stay two lines.
    const keystoneTally = new Map();
    for (const m of rackDrops) {
      const productId = markerProductId(m, elementTypes);
      const k = productId || '__none__';
      if (!keystoneTally.has(k)) keystoneTally.set(k, { key: k, productId, count: 0 });
      keystoneTally.get(k).count += m.quantity ?? 1;
    }
    return {
      key, marker, drops, options, ...derived, managers, managersOverridden: overridden,
      keystones: [...keystoneTally.values()].sort((a, b) => b.count - a.count),
      hidden: marker?.rack_hidden_lines ?? [],
      panelItemId: marker?.rack_patch_panel_item_id ?? null,
      switchItemId: marker?.rack_switch_item_id ?? null,
      managerItemId: marker?.rack_cable_manager_item_id ?? null,
      // The managers the installer chose displace the derived ones in the U count.
      rackUnits: derived.rackUnits - derived.managers + managers,
    };
  };

  return markers
    .filter(m => isRackMarker(m, elementTypes))
    .map(rack => buildRoom(rack.id, rack, dropsByRack.get(rack.id) || []))
    .concat(dropsByRack.has(NO_RACK) ? [buildRoom(NO_RACK, null, dropsByRack.get(NO_RACK))] : []);
}

/**
 * Every article the plan needs, added up across every block it appears in: the
 * keystone at the outlet and the keystone at the panel are one line, one code,
 * one supplier. Keyed on the catalog item, so two products that happen to share
 * a name stay apart — the code is what gets ordered.
 *
 * `labels` names the lines the plan derives rather than stores:
 * `{ keystones, patchPanel(ports), switch(ports), cableManagers, noProduct }`.
 * Cable is not in here on purpose: it is bought by the box, not by the unit.
 */
export function buildPurchaseList({
  markers, elementTypes, accessories = [], planMaterials = [], customIcons = [],
  catalogProducts = [], rooms = [], legacyLabel = () => null, labels,
}) {
  const productById = id => (id ? catalogProducts.find(p => p.id === id) : null);
  const productName = product => product.name || product.item_code || '';
  const normalize = name => (name || '').trim().toLowerCase().replace(/\s+/g, ' ');

  // A free-typed name with no product falls back to matching the catalog by
  // name, so "Rack 42U" typed by hand lands on the catalog's own line. Only an
  // unambiguous name can be matched back: two products sharing one is exactly
  // the case where guessing would put the wrong code on the order.
  const productByName = new Map();
  for (const p of catalogProducts) {
    const key = normalize(productName(p));
    productByName.set(key, productByName.has(key) ? null : p);
  }

  const lines = new Map();
  const add = (product, name, qty, source) => {
    const units = Number(qty) || 0;
    if (units <= 0) return;
    const item = product || productByName.get(normalize(name)) || null;
    const key = item ? `id:${item.id}` : `name:${normalize(name)}`;
    if (!lines.has(key)) {
      lines.set(key, {
        key,
        catalogItemId: item?.id ?? null,
        label: item ? productName(item) : (name || labels.noProduct),
        code: item?.item_code || '',
        vendor: (item?.vendor || '').trim(),
        price: item?.price != null ? Number(item.price) : null,
        supplierPrice: item?.supplier_price != null ? Number(item.supplier_price) : null,
        system: null,
        quantity: 0,
        sources: [],
      });
    }
    const line = lines.get(key);
    line.quantity += units;
    // The system the article first showed up under — what an estimate groups by.
    if (!line.system && source?.system) line.system = source.system;
    const where = source?.label || '';
    const seen = line.sources.find(s => s.label === where);
    if (seen) seen.quantity += units;
    else line.sources.push({ label: where, quantity: units });
  };

  for (const m of markers) {
    const qty = m.quantity ?? 1;
    if (m.custom_icon_id) continue; // counted below, off the icon itself
    const el = getMarkerElement(m, elementTypes);
    if (el) {
      add(productById(markerProductId(m, elementTypes)), el.name, qty, { label: el.name, system: el.system_name });
    } else if (m.equipment_type) {
      const label = legacyLabel(m.equipment_type);
      if (label) add(null, label, qty, { label });
    }
  }
  for (const ic of customIcons) {
    const count = markers.filter(m => m.custom_icon_id === ic.id).length;
    add(null, ic.name, count, { label: ic.name });
  }

  // A rack's accessories are its room's items, counted in the room block below
  // — counting them here too would order every patch cord twice.
  for (const m of markers) {
    if (isRackMarker(m, elementTypes)) continue;
    const markerQty = m.quantity ?? 1;
    const source = getMarkerElement(m, elementTypes)?.name
      || customIcons.find(ic => ic.id === m.custom_icon_id)?.name
      || legacyLabel(m.equipment_type)
      || labels.noProduct;
    for (const a of accessories.filter(ac => ac.marker_id === m.id)) {
      add(productById(a.catalog_item_id), a.name, (a.quantity ?? 1) * markerQty, { label: source });
    }
  }

  for (const mat of planMaterials) {
    add(productById(mat.catalog_item_id), mat.name, mat.quantity ?? 1, { label: labels.extraMaterials });
  }

  for (const room of rooms) {
    // A line the rack doesn't need was excluded on purpose; leaving it out of
    // the purchase list is the whole point of excluding it.
    const shows = line => !(room.hidden || []).includes(line);
    const where = room.name || labels.telecomRoom;
    if (shows('keystones')) {
      for (const k of room.keystones || []) {
        add(productById(k.productId), labels.keystones, k.count, { label: where });
      }
    }
    if (shows('panels')) add(productById(room.panelItemId), labels.patchPanel(room.ports), room.panels, { label: where });
    if (shows('switches')) add(productById(room.switchItemId), labels.switch(SWITCH_PORTS), room.switches, { label: where });
    if (shows('managers')) add(productById(room.managerItemId), labels.cableManagers, room.managers, { label: where });
    for (const item of room.items || []) {
      add(productById(item.catalogItemId), item.name, item.quantity, { label: where });
    }
  }

  // Whatever has no supplier goes last: it is the part of the order that still
  // needs a decision, not the part you can send out.
  return [...lines.values()].sort((a, b) =>
    (a.vendor ? 0 : 1) - (b.vendor ? 0 : 1)
    || a.vendor.localeCompare(b.vendor)
    || a.label.localeCompare(b.label));
}

/**
 * Cable by type: the feet each equipment estimates plus whatever was traced on
 * the plan, and the boxes to order for the sum — rounded up, because 2.8 boxes
 * of Cat6 is three boxes. Kept apart from the article list because a box is
 * not a unit and the two must never be added together.
 */
export function buildCableTotals({ markers, cables = [], cableTypes, cableLengthFeet, feetPerPixel }) {
  const totals = new Map();
  const entry = ct => {
    if (!totals.has(ct.id)) {
      totals.set(ct.id, {
        key: ct.id, cableTypeId: ct.id, name: ct.name, color: ct.color,
        catalogItemId: ct.catalog_item_id ?? null,
        feetPerBox: ct.feet_per_box || 1000, estimated: 0, traced: 0,
      });
    }
    return totals.get(ct.id);
  };
  for (const m of markers) {
    const ct = m.cable_type_id ? cableTypes.find(x => x.id === m.cable_type_id) : null;
    if (!ct || !m.cable_feet) continue;
    entry(ct).estimated += m.cable_feet * (m.quantity ?? 1);
  }
  if (feetPerPixel) {
    for (const c of cables) {
      const ct = c.cable_type_id ? cableTypes.find(x => x.id === c.cable_type_id) : null;
      if (!ct) continue;
      entry(ct).traced += cableLengthFeet(c) || 0;
    }
  }
  return [...totals.values()].map(e => {
    const total = e.estimated + e.traced;
    const boxes = Math.ceil(total / e.feetPerBox);
    return { ...e, total, boxes, leftover: boxes * e.feetPerBox - total };
  });
}
