import { supabase } from './supabase';

// Groups product line items by vendor and creates one purchase_order per
// distinct vendor found — a PO can't go to two suppliers at once, same
// grouping convention as app/purchaseListCsv.js. Vendors are matched by name
// (case-insensitive) and auto-created if no match exists, so this works
// immediately on top of the existing free-text vendor field without
// requiring the vendor catalog to be pre-populated.
//
// `items` must already be normalized to { description, quantity, unit_price,
// supplier_price, vendor, id, isProduct } — callers own that mapping because
// the source tables disagree on field names (proposal_line_items.item_type
// vs job_line_items.type).
export async function generatePurchaseOrders(items, { sourceType, sourceId, sourceLabel }) {
  const products = (items ?? []).filter(it => it.isProduct && it.vendor && it.vendor.trim());
  if (products.length === 0) return { orders: [], reason: 'no-items' };

  const byVendor = new Map();
  products.forEach(it => {
    const key = it.vendor.trim();
    if (!byVendor.has(key)) byVendor.set(key, []);
    byVendor.get(key).push(it);
  });

  const { data: last } = await supabase.from('purchase_orders').select('order_number').order('created_at', { ascending: false }).limit(1).maybeSingle();
  let nextNum = 1001;
  if (last?.order_number) {
    const n = parseInt(last.order_number.replace('PO-', ''));
    if (!isNaN(n)) nextNum = n + 1;
  }

  const createdOrders = [];
  for (const [vendorName, vendorItems] of byVendor) {
    let { data: vendor } = await supabase.from('vendors').select('id').ilike('name', vendorName).maybeSingle();
    if (!vendor) {
      const { data: newVendor, error: vendorErr } = await supabase.from('vendors').insert([{ name: vendorName }]).select().single();
      if (vendorErr) throw vendorErr;
      vendor = newVendor;
    }

    const { data: po, error: poErr } = await supabase.from('purchase_orders').insert([{
      order_number: `PO-${nextNum}`,
      vendor_id: vendor.id,
      status: 'pendiente',
      source_type: sourceType,
      source_id: sourceId,
      source_label: sourceLabel,
    }]).select().single();
    if (poErr) throw poErr;
    nextNum += 1;

    const { error: itemsErr } = await supabase.from('purchase_order_items').insert(
      vendorItems.map(it => ({
        purchase_order_id: po.id,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.supplier_price ?? null,
        source_line_item_id: it.id ?? null,
      }))
    );
    if (itemsErr) throw itemsErr;

    createdOrders.push(po);
  }

  return { orders: createdOrders, reason: null };
}
