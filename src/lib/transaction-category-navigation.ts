import { categoryTree, parseCategoryValue } from "@/lib/categories";

export type MonthlyCategoryRow = {
  id: string;
  category: string | null;
  date: string | null;
  created_at?: string | null;
  amount: number | string | null;
  type: string | null;
  card?: string | null;
  bank_account_id?: string | null;
  is_visible?: boolean | null;
  transaction_status?: string | null;
};

type CategoryNavigationFilters = {
  economicRows: MonthlyCategoryRow[];
  rawRows: MonthlyCategoryRow[];
  selectedMonthStartUtc: number;
  selectedMonthEndUtc: number;
  source: "all" | "account" | "card";
  accountId: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  startDateUtc?: number;
  endDateUtc?: number;
  filterType: "all" | "income" | "expense";
  parseDate: (value: string, createdAt?: string) => Date | null;
};

const expenseCategoryNames = new Set(
  categoryTree.filter((category) => category.type === "expense").map((category) => category.label),
);

export const isTechnicalTransactionCategory = (group: string): boolean =>
  group === "Transferências" || group === "Pagamento de Cartão";

/**
 * Navigation must be based on entries that the category drilldown can actually
 * display. Economic purchases use the collapsed purchase ledger (original
 * purchase month); transfers/payments and pending rows use their monthly
 * transaction date instead. Deduplication prevents a technical row appearing
 * twice when both the full ledger and the paginated list contain it.
 *
 * Never depend on the currently active category: switching categories must
 * remain possible without clearing filters first.
 */
export function getBrowseableMonthlyCategoryRows({
  economicRows,
  rawRows,
  selectedMonthStartUtc,
  selectedMonthEndUtc,
  source,
  accountId,
  minAmount,
  maxAmount,
  startDateUtc,
  endDateUtc,
  filterType,
  parseDate,
}: CategoryNavigationFilters): MonthlyCategoryRow[] {
  if (filterType === "income") return [];

  const uniqueRows = new Map<string, MonthlyCategoryRow>();

  const addEligibleRow = (tx: MonthlyCategoryRow, fromRaw: boolean) => {
    if (tx.is_visible === false) return;
    const category = parseCategoryValue(tx.category || "").group;
    if (!expenseCategoryNames.has(category)) return;
    const technical = isTechnicalTransactionCategory(category);

    // Economic expense drilldowns only show posted purchases. Technical
    // categories have no economic total, but still have real transactions.
    if (technical && filterType !== "all") return;
    if (!technical && tx.type !== "expense") return;
    if (fromRaw && !technical && tx.transaction_status !== "pending") return;

    if (source === "card" && !tx.card) return;
    if (source === "account" && (!tx.bank_account_id || tx.card)) return;
    if (accountId && tx.bank_account_id !== accountId) return;

    const amount = Number(tx.amount || 0);
    if (minAmount !== null && amount < minAmount) return;
    if (maxAmount !== null && amount > maxAmount) return;

    const date = parseDate(tx.date || "", tx.created_at || undefined);
    const timestamp = date?.getTime() ?? NaN;
    if (!Number.isFinite(timestamp) ||
        timestamp < selectedMonthStartUtc ||
        timestamp > selectedMonthEndUtc ||
        (startDateUtc !== undefined && timestamp < startDateUtc) ||
        (endDateUtc !== undefined && timestamp > endDateUtc)) return;

    if (!uniqueRows.has(tx.id)) uniqueRows.set(tx.id, tx);
  };

  for (const tx of economicRows) addEligibleRow(tx, false);
  // The ledger excludes pending rows; include them when browsing all types.
  // Raw technical rows also cover posted transfers/payments from the
  // transaction list without requiring a separate database request.
  if (filterType === "all") {
    for (const tx of rawRows) {
      if (tx.transaction_status === "pending" ||
          isTechnicalTransactionCategory(parseCategoryValue(tx.category || "").group)) {
        addEligibleRow(tx, true);
      }
    }
  }

  return [...uniqueRows.values()];
}

export function rankMonthlyCategoryRows(rows: MonthlyCategoryRow[]): { category: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const tx of rows) {
    const group = parseCategoryValue(tx.category || "").group;
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, "pt-BR"));
}

export function getVisibleMonthlyCategoryRanking(filters: CategoryNavigationFilters) {
  return rankMonthlyCategoryRows(getBrowseableMonthlyCategoryRows(filters));
}
