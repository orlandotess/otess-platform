// Sums a flat list of proposal_line_items rows (id, quantity, unit_price,
// parent_item_id, combine_price — no need for the rest of the columns).
// An accessory (parent_item_id set) only counts on its own when its parent's
// combine_price is explicitly false; otherwise the parent's own price is
// assumed to already include it, matching ProposalDocument.js's billableItems().
export function sumBillableLineItems(lineItems) {
  const list = lineItems ?? [];
  const parentById = new Map(list.filter(li => !li.parent_item_id).map(li => [li.id, li]));
  return list.reduce((sum, li) => {
    if (li.parent_item_id) {
      const parent = parentById.get(li.parent_item_id);
      if (!parent || parent.combine_price !== false) return sum;
    }
    return sum + (li.quantity || 0) * (li.unit_price || 0);
  }, 0);
}
