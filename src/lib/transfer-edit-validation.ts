/**
 * A transfer is represented by exactly two financial rows in one group:
 * one expense (source account) and one income (destination account).
 *
 * Refuse to edit incomplete or ambiguous groups, rather than guessing which
 * entries belong together and accidentally changing an unrelated balance.
 */
export type TransferEditRow = {
  id: string;
  type: string;
  category: string | null;
};

function hasTransferCategory(category: string | null): boolean {
  const value = (category || "").trim();
  return value === "Transferência" ||
    value === "Transferências" ||
    value.startsWith("Transferências >");
}

export function isCompleteTransferEditPair(
  rows: readonly TransferEditRow[],
  selectedTransactionId: string,
): boolean {
  return rows.length === 2 &&
    rows[0].id !== rows[1].id &&
    rows.some((row) => row.id === selectedTransactionId) &&
    rows.every((row) => hasTransferCategory(row.category)) &&
    rows.filter((row) => row.type === "expense").length === 1 &&
    rows.filter((row) => row.type === "income").length === 1;
}
