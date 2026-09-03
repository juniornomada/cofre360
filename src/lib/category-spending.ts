export type CategorySpendingInstallmentRow = {
  amount: number | string | null;
  date?: string | null;
  purchase_date?: string | null;
  created_at?: string | null;
  is_visible?: boolean | null;
  installment_group_id?: string | null;
  installment_number?: number | null;
  total_installments?: number | null;
  installment_source_amount?: number | string | null;
};

const MONTHS: Record<string, number> = {
  jan: 0,
  fev: 1,
  mar: 2,
  abr: 3,
  mai: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  set: 8,
  out: 9,
  nov: 10,
  dez: 11,
};

function finiteAmount(value: number | string | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLedgerDate(value: string | null | undefined, refIso?: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }

  const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  }

  const parts = trimmed.split(/\s+/);
  const month = parts.length >= 2 ? MONTHS[parts[1]] : undefined;
  if (month !== undefined) {
    const refYear = refIso ? new Date(refIso).getUTCFullYear() : new Date().getUTCFullYear();
    const year = parts[2] ? Number(parts[2]) : refYear;
    return new Date(Date.UTC(year, month, Number(parts[0])));
  }

  return null;
}

function shiftLedgerDateMonths(
  value: string | null | undefined,
  months: number,
  refIso?: string | null,
): string | null | undefined {
  const base = parseLedgerDate(value, refIso);
  if (!base) return value;

  const target = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(base.getUTCDate(), lastDay);
  const yyyy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isInstallmentGroup(row: CategorySpendingInstallmentRow): boolean {
  return Boolean(row.installment_group_id) && Number(row.total_installments || 0) > 1;
}

/**
 * Returns the economic purchase date. New rows use purchase_date explicitly;
 * legacy installment groups fall back to the old date inference in the
 * collapsing step below.
 */
export function categoryPurchaseDate(row: CategorySpendingInstallmentRow): string | null | undefined {
  return row.purchase_date || row.date;
}

/**
 * Returns whether a row represents the economic purchase in a monthly category view.
 * Future installments are cash-flow rows and must not be counted again as new spending.
 */
export function isCategoryPurchaseRow(row: CategorySpendingInstallmentRow): boolean {
  if (!isInstallmentGroup(row)) return true;
  return Number(row.installment_number || 0) === 1;
}

/**
 * Returns the full economic purchase amount for an installment row when possible.
 */
export function categoryPurchaseAmount(row: CategorySpendingInstallmentRow): number {
  const amount = finiteAmount(row.amount) ?? 0;
  if (!isInstallmentGroup(row)) return amount;

  const sourceAmount = finiteAmount(row.installment_source_amount);
  if (sourceAmount !== null && sourceAmount > 0) return sourceAmount;

  const total = Math.max(1, Math.floor(Number(row.total_installments) || 1));
  return Math.round(amount * total * 100) / 100;
}

/**
 * Collapses the complete category ledger into one economic row per installment group.
 * The resulting row is dated in the original purchase month and carries the full
 * purchase amount. transactions.date remains untouched in the database and continues
 * to represent the installment/cash-flow date.
 */
export function collapseCategorySpendingRows<T extends CategorySpendingInstallmentRow>(rows: T[]): T[] {
  const singles: T[] = [];
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    if (!isInstallmentGroup(row)) {
      const purchaseDate = categoryPurchaseDate(row);
      singles.push({
        ...row,
        date: purchaseDate,
        purchase_date: purchaseDate,
      } as T);
      continue;
    }

    const groupId = row.installment_group_id as string;
    const group = groups.get(groupId);
    if (group) group.push(row);
    else groups.set(groupId, [row]);
  }

  const collapsed: T[] = [...singles];

  for (const groupRows of groups.values()) {
    if (groupRows.length === 0) continue;

    const sorted = [...groupRows].sort((a, b) => {
      const an = Number(a.installment_number || Number.MAX_SAFE_INTEGER);
      const bn = Number(b.installment_number || Number.MAX_SAFE_INTEGER);
      if (an !== bn) return an - bn;
      return String(a.date || "").localeCompare(String(b.date || ""));
    });

    const visibleRows = sorted.filter((row) => row.is_visible !== false);
    if (visibleRows.length === 0) continue;

    const anchor = sorted[0];
    const anchorNumber = Math.max(1, Math.floor(Number(anchor.installment_number) || 1));
    const total = Math.max(
      1,
      ...sorted.map((row) => Math.floor(Number(row.total_installments) || 1)),
    );

    const sourceAmount = sorted
      .map((row) => finiteAmount(row.installment_source_amount))
      .find((value): value is number => value !== null && value > 0);

    const installmentNumbers = new Set(
      sorted
        .map((row) => Math.floor(Number(row.installment_number) || 0))
        .filter((number) => number >= 1 && number <= total),
    );
    const hasCompleteGroup = installmentNumbers.size === total;

    let economicAmount: number;
    if (sourceAmount !== undefined) {
      economicAmount = sourceAmount;
    } else if (hasCompleteGroup) {
      economicAmount = sorted.reduce((sum, row) => sum + (finiteAmount(row.amount) ?? 0), 0);
    } else {
      const representativeAmount = finiteAmount(anchor.amount) ?? 0;
      economicAmount = representativeAmount * total;
    }
    economicAmount = Math.round(economicAmount * 100) / 100;

    const explicitPurchaseDate = sorted
      .map((row) => row.purchase_date?.trim())
      .find((value): value is string => Boolean(value));

    const originalDate = explicitPurchaseDate || (
      anchorNumber > 1
        ? shiftLedgerDateMonths(anchor.date, -(anchorNumber - 1), anchor.created_at)
        : anchor.date
    );

    collapsed.push({
      ...anchor,
      date: originalDate,
      purchase_date: originalDate,
      amount: economicAmount,
      is_visible: true,
    } as T);
  }

  return collapsed;
}
