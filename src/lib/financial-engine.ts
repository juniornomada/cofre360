import { collapseCategorySpendingRows } from "@/lib/category-spending";
import { getBillingCycleMonthKey, parseTxDate } from "@/lib/invoice-utils";

export type TransactionKind =
  | "expense"
  | "income"
  | "transfer"
  | "card_payment"
  | "refund"
  | "adjustment"
  | "investment_movement"
  | "yield";

export type FinancialTransaction = {
  id: string;
  name?: string | null;
  category?: string | null;
  date?: string | null;
  transaction_date?: string | null;
  purchase_date?: string | null;
  amount: number | string | null;
  type?: string | null;
  transaction_kind?: TransactionKind | string | null;
  card?: string | null;
  card_id?: string | null;
  bank_account_id?: string | null;
  is_visible?: boolean | null;
  created_at?: string | null;
  installment_group_id?: string | null;
  installment_number?: number | null;
  total_installments?: number | null;
  installment_mode?: string | null;
  installment_source_amount?: number | string | null;
};

export type FinancialCard = {
  id?: string | null;
  name: string;
  closing_day?: number | null;
  due_day?: number | null;
};

export type MonthlyFinancialSummary = {
  income: number;
  expense: number;
  result: number;
  cardExpenseComponent: number;
  refunds: number;
};

export type CategoryTotal = { category: string; amount: number };

const allowedKinds = new Set<TransactionKind>([
  "expense",
  "income",
  "transfer",
  "card_payment",
  "refund",
  "adjustment",
  "investment_movement",
  "yield",
]);

export function normalizeFinancialText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function rootCategory(value: string | null | undefined) {
  return String(value || "Sem categoria").split(">")[0]?.trim() || "Sem categoria";
}

export function inferTransactionKind(tx: Pick<FinancialTransaction, "transaction_kind" | "type" | "category">): TransactionKind {
  const explicit = tx.transaction_kind as TransactionKind | null | undefined;
  if (explicit && allowedKinds.has(explicit)) return explicit;

  const full = normalizeFinancialText(tx.category);
  const root = normalizeFinancialText(rootCategory(tx.category));
  if (root === "transferencia" || root === "transferencias") return "transfer";
  if (root === "pagamento de cartao" || root === "pagamento do cartao" || root === "pagamento cartao") return "card_payment";
  if (root === "ajustes") return "adjustment";
  if (full === "receita > reembolso" || full.startsWith("receita > reembolso >")) return "refund";
  if (full === "receita > juros" || full.startsWith("receita > juros >")) return "yield";
  if (root === "investimento" || root === "investimentos") return "investment_movement";
  return tx.type === "income" ? "income" : "expense";
}

export function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function canonicalTransactionDate(tx: Pick<FinancialTransaction, "transaction_date" | "date" | "created_at">): Date | null {
  const raw = tx.transaction_date || tx.date;
  if (!raw) return null;
  const parsed = parseTxDate(raw, tx.created_at || new Date().toISOString());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function cardForTransaction(tx: FinancialTransaction, cards: FinancialCard[]) {
  if (tx.card_id) {
    const byId = cards.find((card) => card.id === tx.card_id);
    if (byId) return byId;
  }
  if (!tx.card) return undefined;
  const target = normalizeFinancialText(tx.card);
  return cards.find((card) => normalizeFinancialText(card.name) === target);
}

/**
 * Economic DESPESAS uses the invoice cycle for credit-card movements and
 * calendar month for account/cash movements. This is the canonical rule used
 * across Home, Transactions, Insights and consistency checks.
 */
export function belongsToExpenseMonth(tx: FinancialTransaction, targetMonthKey: string, cards: FinancialCard[]) {
  if (tx.is_visible === false) return false;
  const date = canonicalTransactionDate(tx);
  if (!date) return false;

  const card = cardForTransaction(tx, cards);
  if (tx.card || tx.card_id) {
    if (card) {
      return getBillingCycleMonthKey(
        tx.transaction_date || tx.date || "",
        tx.created_at || date.toISOString(),
        card.closing_day,
      ) === targetMonthKey;
    }
  }
  return monthKeyFromDate(date) === targetMonthKey;
}

export function computeMonthlyFinancialSummary(
  transactions: FinancialTransaction[],
  cards: FinancialCard[],
  targetMonthKey: string,
): MonthlyFinancialSummary {
  let income = 0;
  let expense = 0;
  let cardExpenseComponent = 0;
  let refunds = 0;

  for (const tx of transactions) {
    if (!belongsToExpenseMonth(tx, targetMonthKey, cards)) continue;
    const kind = inferTransactionKind(tx);
    const amount = Number(tx.amount || 0);
    if (!Number.isFinite(amount)) continue;

    if (kind === "refund") {
      expense -= amount;
      refunds += amount;
      if (tx.card || tx.card_id) cardExpenseComponent -= amount;
      continue;
    }
    if (kind === "income" || kind === "yield") {
      income += amount;
      continue;
    }
    if (kind !== "expense") continue;

    expense += amount;
    if (tx.card || tx.card_id) cardExpenseComponent += amount;
  }

  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  income = round(income);
  expense = round(expense);
  cardExpenseComponent = round(cardExpenseComponent);
  refunds = round(refunds);
  return { income, expense, result: round(income - expense), cardExpenseComponent, refunds };
}

/**
 * Category spending is purchase-date economic spending: an installment group
 * is counted once, in its original purchase month, for the full purchase value.
 */
export function computeMonthlyCategoryTotals(
  transactions: FinancialTransaction[],
  targetMonthKey: string,
): CategoryTotal[] {
  const expenseRows = transactions.filter((tx) => {
    if (tx.is_visible === false) return false;
    return inferTransactionKind(tx) === "expense";
  });
  const collapsed = collapseCategorySpendingRows(expenseRows);
  const totals = new Map<string, number>();

  for (const tx of collapsed) {
    const date = canonicalTransactionDate({
      transaction_date: tx.purchase_date || tx.date || null,
      date: tx.purchase_date || tx.date || null,
      created_at: tx.created_at || null,
    });
    if (!date || monthKeyFromDate(date) !== targetMonthKey) continue;
    const category = rootCategory(tx.category);
    const amount = Number(tx.amount || 0);
    if (!Number.isFinite(amount)) continue;
    totals.set(category, (totals.get(category) || 0) + amount);
  }

  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount: Math.round((amount + Number.EPSILON) * 100) / 100 }))
    .filter((item) => Math.abs(item.amount) >= 0.005)
    .sort((a, b) => b.amount - a.amount);
}

export function computeCardConsistency(
  transactions: FinancialTransaction[],
  cards: FinancialCard[],
  targetMonthKey: string,
) {
  const byCard = new Map<string, number>();
  for (const tx of transactions) {
    if (!belongsToExpenseMonth(tx, targetMonthKey, cards)) continue;
    if (!tx.card && !tx.card_id) continue;
    const kind = inferTransactionKind(tx);
    if (kind !== "expense" && kind !== "refund") continue;
    const card = cardForTransaction(tx, cards);
    const label = card?.name || tx.card || "Cartão";
    const amount = Number(tx.amount || 0) * (kind === "refund" ? -1 : 1);
    byCard.set(label, (byCard.get(label) || 0) + amount);
  }
  const cardsTotal = [...byCard.values()].reduce((sum, value) => sum + value, 0);
  const expected = computeMonthlyFinancialSummary(transactions, cards, targetMonthKey).cardExpenseComponent;
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  return {
    cards: [...byCard.entries()].map(([card, amount]) => ({ card, amount: round(amount) })).sort((a, b) => b.amount - a.amount),
    cardsTotal: round(cardsTotal),
    expenseCardComponent: round(expected),
    delta: round(cardsTotal - expected),
    isConsistent: Math.abs(round(cardsTotal - expected)) < 0.01,
  };
}
