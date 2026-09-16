export type CheckType =
  | "bank_account"
  | "card"
  | "invoice"
  | "budget"
  | "transfer"
  | "installment"
  | "data_quality"
  | "refund"
  | "system";
export type RuleKind = "equality" | "sum" | "zero";
export type ToleranceKind = "abs" | "pct";
export type TriggeredBy = "manual" | "scheduled";
export type RunStatus = "running" | "completed" | "failed";

export interface ReconciliationRule {
  id: string;
  user_id: string;
  name: string;
  check_type: CheckType;
  rule_kind: RuleKind;
  tolerance_kind: ToleranceKind;
  tolerance_value: number;
  target_ids: string[];
  enabled: boolean;
}

export interface Divergence {
  check_type: CheckType;
  entity_id: string | null;
  entity_label: string;
  expected: number;
  actual: number;
  delta: number;
  rule_id?: string | null;
}

export interface CheckSummary {
  check_type: CheckType;
  label: string;
  checked: number;
  issues: number;
}

export interface CanonicalMonthFacts {
  month: string;
  income: number;
  expense: number;
  cardExpenseComponent: number;
  categories: Array<{ category: string; amount: number }>;
  cards: Array<{ card: string; amount: number }>;
}

export interface RunResult {
  verification_version: 2;
  period_start: string;
  period_end: string;
  divergences: Divergence[];
  total_divergence_amount: number;
  counts_by_check: Record<CheckType, number>;
  checks: CheckSummary[];
}

export interface ReconciliationInput {
  bankAccounts: Array<{ id: string; name: string; opening_balance: number }>;
  transactions: Array<{
    id: string;
    date: string;
    created_at?: string | null;
    purchase_date?: string | null;
    amount: number;
    type: "income" | "expense" | "transfer" | string;
    transaction_kind?: string | null;
    is_visible?: boolean | null;
    bank_account_id?: string | null;
    card?: string | null;
    card_id?: string | null;
    category?: string | null;
    transfer_direction?: "in" | "out" | null;
    installment_group_id?: string | null;
    installment_number?: number | null;
    total_installments?: number | null;
    installment_source_amount?: number | null;
  }>;
  cards: Array<{ id: string; name: string; used: number; closing_day: number; due_day: number }>;
  cardPayments: Array<{
    id: string;
    card_id: string;
    bank_account_id?: string | null;
    amount: number;
    date: string;
    target_period?: string | null;
  }>;
  cardRefunds: Array<{
    id: string;
    transaction_id: string;
    card_name?: string | null;
    original_amount: number;
    refund_amount: number;
    status: string;
    refund_transaction_id?: string | null;
    date?: string | null;
  }>;
  budgets: Array<{ id: string; category: string; amount: number; period_start: string; period_end: string }>;
  rules: ReconciliationRule[];
  canonicalFacts: CanonicalMonthFacts[];
  periodStart: string;
  periodEnd: string;
}

/**
 * Aplica tolerância. Retorna true se o delta está dentro da tolerância.
 * abs: |delta| <= tolerance_value
 * pct: |delta| <= |expected| * tolerance_value / 100  (fallback abs quando expected=0)
 */
export function withinTolerance(
  delta: number,
  expected: number,
  kind: ToleranceKind,
  value: number
): boolean {
  const abs = Math.abs(delta);
  if (kind === "abs") return abs <= value + 1e-9;
  const threshold = Math.abs(expected) * (value / 100);
  if (Math.abs(expected) < 1e-9) return abs <= value + 1e-9;
  return abs <= threshold + 1e-9;
}
