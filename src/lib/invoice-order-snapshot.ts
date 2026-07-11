/**
 * Pure helper that decides which transaction IDs to show (and in which order)
 * for the invoice dialog.
 *
 * Design invariants:
 *  - The snapshot is taken exactly once per dialog open — at the first render
 *    where `dialogOpen === true` and no prior snapshot exists.
 *  - While the dialog is open, subsequent refetches / cache updates NEVER
 *    reorder the visible list. Only deletions are respected (ghost rows are
 *    filtered out); new ids arriving in the same period are ignored until the
 *    dialog is reopened.
 *  - While the dialog is closed, no snapshot is retained. Caller should drop
 *    the entry so that the next open captures a fresh order from the current
 *    data.
 *
 * `nextSnapshot === null` signals the caller to delete the stored entry.
 */
export function resolveInvoiceOrder(params: {
  currentIds: string[];
  priorSnapshot: string[] | undefined;
  dialogOpen: boolean;
}): { orderedIds: string[]; nextSnapshot: string[] | null } {
  const { currentIds, priorSnapshot, dialogOpen } = params;

  if (!dialogOpen) {
    // Dialog closed: expose current data but forget the snapshot so the next
    // open captures a fresh order at that moment.
    return { orderedIds: currentIds.slice(), nextSnapshot: null };
  }
  if (!priorSnapshot) {
    // First render with the dialog open: capture the snapshot now.
    const snap = currentIds.slice();
    return { orderedIds: snap, nextSnapshot: snap };
  }
  // Dialog open with an existing snapshot: keep frozen order. Drop deletions,
  // ignore new ids. Refetches / edits that only mutate row content never
  // reorder because we filter by the snapshot order.
  const currentSet = new Set(currentIds);
  const orderedIds = priorSnapshot.filter((id) => currentSet.has(id));
  return { orderedIds, nextSnapshot: priorSnapshot.slice() };
}
