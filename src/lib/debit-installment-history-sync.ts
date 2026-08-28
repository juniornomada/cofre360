import { stripInstallmentSuffix } from "@/lib/installment-edit";
import { normalizeText } from "@/lib/utils";

export type InstallmentHistoryTransaction = {
  id: string;
  name: string;
  category?: string | null;
  date?: string | null;
  created_at?: string | null;
  amount: number;
  type: "income" | "expense";
  card?: string | null;
  bank_account_id?: string | null;
  installment_group_id?: string | null;
  installment_number?: number | null;
  total_installments?: number | null;
  installment_mode?: "divide" | "fixed" | null;
  installment_source_amount?: number | null;
};

export type ReusedInstallmentContext = {
  installment_number: number;
  total_installments: number;
  installment_mode: "divide" | "fixed";
  installment_source_amount: number;
  source_group_id: string;
};

const centsEqual = (a: number, b: number) => Math.abs(Number(a) - Number(b)) <= 0.01;

function normalizedPurchaseName(value: string): string {
  return normalizeText(stripInstallmentSuffix(value || "")).trim();
}

function timestamp(value?: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Reuses installment metadata from credit history for a debit transaction.
 *
 * The match is intentionally conservative: same purchase name, same category,
 * compatible amount and exactly one credit installment group. We never copy
 * the group id to the debit row, so debit/credit sources remain independent.
 */
export function inferDebitInstallmentContext(
  debit: InstallmentHistoryTransaction,
  history: InstallmentHistoryTransaction[],
): ReusedInstallmentContext | null {
  const isDebitExpense =
    debit.type === "expense" && !!debit.bank_account_id && !debit.card;

  if (!isDebitExpense) return null;
  if ((debit.total_installments ?? 1) > 1 && debit.installment_number) return null;

  const debitName = normalizedPurchaseName(debit.name);
  const debitCategory = normalizeText(debit.category || "").trim();
  if (!debitName) return null;

  const candidates = history.filter((tx) => {
    if (tx.id === debit.id || tx.type !== "expense" || !tx.card) return false;
    if (!tx.installment_group_id) return false;
    const total = Number(tx.total_installments ?? 1);
    const current = Number(tx.installment_number ?? 0);
    if (total <= 1 || current < 1 || current > total) return false;
    if (normalizedPurchaseName(tx.name) !== debitName) return false;
    if (normalizeText(tx.category || "").trim() !== debitCategory) return false;

    const sourceAmount = Number(tx.installment_source_amount ?? 0);
    return centsEqual(tx.amount, debit.amount) || (sourceAmount > 0 && centsEqual(sourceAmount, debit.amount));
  });

  const groupIds = [...new Set(candidates.map((tx) => tx.installment_group_id!))];
  if (groupIds.length !== 1) return null;

  const groupId = groupIds[0];
  const groupRows = candidates.filter((tx) => tx.installment_group_id === groupId);
  const debitTime = timestamp(debit.date) ?? timestamp(debit.created_at);

  groupRows.sort((a, b) => {
    if (debitTime != null) {
      const aTime = timestamp(a.date) ?? timestamp(a.created_at);
      const bTime = timestamp(b.date) ?? timestamp(b.created_at);
      const aDistance = aTime == null ? Number.POSITIVE_INFINITY : Math.abs(aTime - debitTime);
      const bDistance = bTime == null ? Number.POSITIVE_INFINITY : Math.abs(bTime - debitTime);
      if (aDistance !== bDistance) return aDistance - bDistance;
    }
    return Number(a.installment_number ?? 0) - Number(b.installment_number ?? 0);
  });

  const match = groupRows[0];
  if (!match) return null;

  const total = Number(match.total_installments);
  const current = Number(match.installment_number);
  const mode = match.installment_mode === "fixed" ? "fixed" : "divide";
  const source = Number(match.installment_source_amount ?? 0);
  const sourceAmount = source > 0
    ? source
    : mode === "fixed"
      ? Number(match.amount)
      : Number(match.amount) * total;

  return {
    installment_number: current,
    total_installments: total,
    installment_mode: mode,
    installment_source_amount: sourceAmount,
    source_group_id: groupId,
  };
}
