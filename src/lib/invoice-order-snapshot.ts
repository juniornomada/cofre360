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
 *  - Fallback for missing ids (delete / merge / replace): ids in the snapshot
 *    that no longer exist in `currentIds` are dropped without reshuffling.
 *    Any id present in `currentIds` but absent from the snapshot (e.g. a
 *    merge that swapped an id, or a replacement row) is appended at the
 *    end in the order the server returned it — predictable, never
 *    interleaved into the frozen prefix.
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
    return { orderedIds: currentIds.slice(), nextSnapshot: null };
  }
  if (!priorSnapshot) {
    const snap = currentIds.slice();
    return { orderedIds: snap, nextSnapshot: snap };
  }
  // Dialog open with an existing snapshot:
  //  1. Keep the frozen prefix (snapshot order minus deleted ids).
  //  2. Append any current id that was not in the snapshot at the end,
  //     preserving the server-provided order among those newcomers.
  //  3. Extend the snapshot with the appended ids so subsequent refetches
  //     keep them in that same trailing position (no reshuffle).
  const currentSet = new Set(currentIds);
  const snapshotSet = new Set(priorSnapshot);
  const frozenPrefix = priorSnapshot.filter((id) => currentSet.has(id));
  const appended = currentIds.filter((id) => !snapshotSet.has(id));
  const orderedIds = frozenPrefix.concat(appended);
  const nextSnapshot = appended.length > 0
    ? priorSnapshot.concat(appended)
    : priorSnapshot.slice();
  return { orderedIds, nextSnapshot };
}

