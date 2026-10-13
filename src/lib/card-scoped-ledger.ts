/**
 * A card-scoped transaction refresh must not replace the complete ledger used
 * by /cards to calculate ALL cards' invoices, limits, and automatic month.
 *
 * Supabase .eq("card", cardName) returns only one card's rows. Replacing the
 * global ledger with that response temporarily makes every other card appear
 * to have an empty invoice until a full refresh (F5).
 */
export function replaceCardTransactionsInLedger<T extends { id: string; card?: string | null }>(
  fullLedger: readonly T[],
  cardName: string,
  scopedRows: readonly T[],
): T[] {
  const untouchedCards = fullLedger.filter((row) => row.card !== cardName);
  // Defensive scope: a card-only response must not overwrite another card,
  // even when a test or API mock accidentally returns an unrelated row.
  const updatedCardRows = scopedRows.filter((row) => row.card === cardName);
  return [...untouchedCards, ...updatedCardRows];
}
