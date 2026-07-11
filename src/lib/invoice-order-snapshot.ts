/**
 * Pure helper that decides which transaction IDs to show (and in which order)
 * for the invoice dialog, given:
 *  - the current list of transaction IDs in the period,
 *  - a snapshot of ordered IDs captured when the dialog first opened,
 *  - whether the dialog is currently open.
 *
 * Rules:
 *  - Dialog closed: snapshot mirrors the current list (kept fresh for the next open).
 *  - Dialog open, no prior snapshot: take the current list as the snapshot.
 *  - Dialog open, snapshot exists: keep the snapshot order; drop deleted ids;
 *    ignore new ids until the dialog is reopened.
 */
export function resolveInvoiceOrder(params: {
  currentIds: string[];
  priorSnapshot: string[] | undefined;
  dialogOpen: boolean;
}): { orderedIds: string[]; nextSnapshot: string[] } {
  const { currentIds, priorSnapshot, dialogOpen } = params;

  if (!dialogOpen) {
    return { orderedIds: currentIds.slice(), nextSnapshot: currentIds.slice() };
  }
  if (!priorSnapshot) {
    return { orderedIds: currentIds.slice(), nextSnapshot: currentIds.slice() };
  }
  const currentSet = new Set(currentIds);
  const orderedIds = priorSnapshot.filter((id) => currentSet.has(id));
  return { orderedIds, nextSnapshot: priorSnapshot.slice() };
}
