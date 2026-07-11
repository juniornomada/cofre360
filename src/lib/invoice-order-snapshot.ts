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
 *  - The snapshot PERSISTS across close/reopen for the same invoice period.
 *    On reopen, previously captured ids keep their original order and any
 *    transaction created while the dialog was closed appears at the end.
 *    A fresh snapshot is only taken when none exists yet for the period.
 *
 * `nextSnapshot === null` is reserved for callers that want to invalidate
 * the entry explicitly (e.g. period switch); this helper never returns it.
 */
export function resolveInvoiceOrder(params: {
  currentIds: string[];
  priorSnapshot: string[] | undefined;
  dialogOpen: boolean;
}): { orderedIds: string[]; nextSnapshot: string[] | null } {
  const { currentIds, priorSnapshot, dialogOpen } = params;

  if (!priorSnapshot || priorSnapshot.length === 0) {
    // First observation of this period: capture the current order as the
    // canonical baseline (whether the dialog is open or not).
    const snap = currentIds.slice();
    return { orderedIds: snap, nextSnapshot: snap };
  }

  const currentSet = new Set(currentIds);
  const snapshotSet = new Set(priorSnapshot);
  const frozenPrefix = priorSnapshot.filter((id) => currentSet.has(id));

  // Full invalidation: the snapshot shares no id with the current data.
  // This happens when the caller reuses a stale key across a period switch
  // or when every captured id was replaced. Reset the snapshot to the new
  // canonical order instead of appending an unrelated tail.
  if (frozenPrefix.length === 0) {
    const snap = currentIds.slice();
    return { orderedIds: snap, nextSnapshot: snap };
  }

  // Snapshot exists and still overlaps the current data:
  //  1. Keep the frozen prefix (snapshot order minus deleted ids).
  //  2. Append any current id that was not in the snapshot at the end,
  //     preserving the server-provided order among those newcomers.
  //  3. Extend the snapshot with the appended ids so subsequent refetches
  //     keep them in that same trailing position (no reshuffle).
  const appended = currentIds.filter((id) => !snapshotSet.has(id));
  const orderedIds = frozenPrefix.concat(appended);
  const nextSnapshot = appended.length > 0
    ? priorSnapshot.concat(appended)
    : priorSnapshot.slice();
  return { orderedIds, nextSnapshot };
}

/**
 * Housekeeping called when the invoice dialog transitions from open → closed.
 *
 * Successive reopens must never surface stale ids or empty buckets. This
 * helper reconciles the snapshot store in place:
 *  - For every known bucket (period key) whose current ids we can observe,
 *    remove ids from the snapshot that no longer exist in the current data.
 *  - Delete buckets whose snapshot becomes empty after pruning (nothing left
 *    to freeze — the next open will capture a fresh baseline).
 *  - Buckets we cannot observe right now are left untouched; they will be
 *    reconciled on the next render that includes their period.
 *
 * The captured order among surviving ids is preserved — this helper never
 * reshuffles the snapshot.
 */
export function reconcileSnapshotOnClose(
  snapshots: Map<string, string[]>,
  currentIdsByKey: Record<string, string[] | undefined>,
): void {
  for (const [key, ids] of Array.from(snapshots.entries())) {
    const current = currentIdsByKey[key];
    if (!current) continue;
    const currentSet = new Set(current);
    const pruned = ids.filter((id) => currentSet.has(id));
    if (pruned.length === 0) {
      snapshots.delete(key);
    } else if (pruned.length !== ids.length) {
      snapshots.set(key, pruned);
    }
  }
}



