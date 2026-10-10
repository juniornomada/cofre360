/**
 * The unfiltered month view must include credit-card purchases from the full
 * purchase ledger as well as the ordinary cash-flow rows. The first page of
 * transactions is sorted by created_at and may not contain a purchase whose
 * first installment starts in a later month.
 *
 * Preserve all existing month rows (including transfers, card payments and
 * pending transactions), and add only card purchases not already represented
 * by an ID or an installment group in the visible month.
 */
export function includeMissingMonthlyCardPurchases<T extends {
  id: string;
  card?: string | null;
  installment_group_id?: string | null;
}>(monthRows: readonly T[], monthlyPurchaseRows: readonly T[]): T[] {
  const result = [...monthRows];
  const seenIds = new Set(monthRows.map((tx) => tx.id));
  const seenCardGroups = new Set(
    monthRows
      .filter((tx) => Boolean(tx.card && tx.installment_group_id))
      .map((tx) => tx.installment_group_id as string),
  );

  for (const purchase of monthlyPurchaseRows) {
    if (!purchase.card || seenIds.has(purchase.id)) continue;

    const groupId = purchase.installment_group_id;
    if (groupId && seenCardGroups.has(groupId)) continue;

    result.push(purchase);
    seenIds.add(purchase.id);
    if (groupId) seenCardGroups.add(groupId);
  }

  return result;
}
