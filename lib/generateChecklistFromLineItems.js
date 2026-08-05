// Builds job_checklist_items rows from job_line_items that were just inserted
// into a job (via Estimado→Trabajo, Solicitud→Trabajo, or an approved Orden de
// Cambio). One checklist item per line item that has an area, grouped by that
// area, linked back to its source line item so the crew checklist can show
// what it actually is (product vs labor) instead of just free text.
export function buildChecklistItemsFromLineItems(lineItems, jobId, startSortOrder = 0) {
  return (lineItems ?? [])
    .filter(it => it.area)
    .map((it, idx) => ({
      job_id: jobId,
      group_name: it.area,
      description: Number(it.quantity) > 1 ? `${it.description} (x${it.quantity})` : it.description,
      completed: false,
      sort_order: startSortOrder + idx,
      source_line_item_id: it.id,
      item_type: it.type,
    }));
}
