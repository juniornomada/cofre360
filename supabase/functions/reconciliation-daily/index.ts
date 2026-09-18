import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Internal reconciliation runner. This function is invoked only by pg_cron.
// The bearer secret lives in Supabase Vault and is verified before any data access.

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

    // Historical/imported groups may contain a per-installment amount in an early
    // row and the full original purchase amount in later rows. Prefer the largest
    // positive source amount, matching the canonical SQL ledger.
    const sourceAmounts = sorted
      .map((row) => finiteAmount(row.installment_source_amount))
      .filter((value): value is number => value !== null && value > 0);
    const sourceAmount = sourceAmounts.length > 0 ? Math.max(...sourceAmounts) : undefined;

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

export type CardTransaction = {
  id: string;
  name: string;
  icon: string | null;
  category: string;
  card?: string | null;
  date: string;
  purchase_date?: string | null;
  amount: number;
  type: string;
  created_at: string;
  total_installments: number | null;
  installment_number: number | null;
  installment_group_id: string | null;
};

export type InvoicePeriod = {
  label: string;
  key: string;
  startDate: Date;
  endDate: Date;
  dueDate: Date;
  transactions: CardTransaction[];
  total: number;
};

export const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export const shortMonthMap: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

const longMonthMap: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

/**
 * Normalizes a Portuguese month token so that pontuação, acentos e
 * capitalização não impeçam o reconhecimento. Ex.: "Março" → "marco",
 * "fev." → "fev", "Setembro" → "setembro".
 */
function normalizeMonthToken(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[.,;:]+$/g, "")         // strip trailing pontuação
    .replace(/[^a-z]/g, "");          // drop any remaining non-letters
}

function resolveMonthIdx(token: string): number | undefined {
  const norm = normalizeMonthToken(token);
  if (norm === "") return undefined;
  if (norm in shortMonthMap) return shortMonthMap[norm];
  if (norm in longMonthMap) return longMonthMap[norm];
  // Long names that start with a known short abbreviation (e.g. "janeiro" → "jan")
  // fall through to shortMonthMap. Keep as an explicit fallback so unrelated
  // words like "janela" are NOT accepted.
  const prefix = norm.slice(0, 3);
  if (norm.length > 3 && prefix in shortMonthMap && longMonthMap[norm] !== undefined) {
    return shortMonthMap[prefix];
  }
  return undefined;
}

/**
 * Days-in-month, Gregorian. Feb varies by leap year.
 * Leap: divisible by 4, except centuries not divisible by 400.
 */
function daysInMonth(year: number, monthIdx: number): number {
  if (monthIdx === 1) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][monthIdx];
}


export function parseTxDate(dateStr: string, fallback: string): Date {
  // Sanitize noisy inputs: strip zero-width / invisible unicode that would
  // otherwise split tokens, and drop stray pontuação that gets attached to
  // digits or month words (e.g. "01!", "10,/07", "jan..."). Keep "/" and
  // "-" so numeric separators survive.
  const rawCleaned = (dateStr || "")
    .replace(/[\u200B-\u200D\uFEFF\u180E\u2028\u2029\u00A0\u202F\u205F]/g, " ")
    // Normalize Unicode dash-likes into ASCII '-' so numeric separators
    // (en dash, em dash, minus sign, hyphen variants) all reach the
    // numeric branch below. Tabs and other whitespace collapse via \s+.
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  // For token-based parsing we drop pontuação and collapse space-wrapped
  // dashes (e.g. "01 - jan") into a single space. For the native ISO
  // fallback further below we keep colons/dots so `new Date(...)` can still
  // read timestamps like "2026-07-10T12:00:00Z".
  const cleaned = rawCleaned
    .replace(/\s-\s/g, " ")
    .replace(/[.,;:!?]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Drop lone punctuation-only tokens (e.g. a trailing "-") that survive
  // sanitization when they were space-separated in the original string.
  const parts = cleaned.toLowerCase().split(/\s+/).filter((t) => /[a-z0-9]/.test(t));
  const fallbackDate = new Date(fallback);
  const hasFallback = !isNaN(fallbackDate.getTime());
  const fallbackYear = hasFallback ? fallbackDate.getFullYear() : new Date().getFullYear();
  const fallbackMonth = hasFallback ? fallbackDate.getMonth() : new Date().getMonth();

  if (parts.length === 2) {
    const day = parseInt(parts[0]);
    const dayLooksNumeric = /^-?\d+(\.\d+)?$/.test(parts[0]);
    const monthIdx = resolveMonthIdx(parts[1]);
    if (!isNaN(day) && monthIdx !== undefined) {
      // Year-boundary disambiguation: the textual `date` carries no year,
      // so we infer it from `created_at`. Near the Dec↔Jan boundary the
      // raw fallback year can be off by one — e.g. a tx typed as "02 jan"
      // whose row was created moments earlier at 2025-12-31T23:59:00Z
      // would otherwise be placed in Jan 2025, dragging the tx into the
      // previous year's billing cycle. Shift the year when the textual
      // month is ≥10 months away from the fallback month.
      let year = fallbackYear;
      if (monthIdx === 0 && fallbackMonth >= 10) year = fallbackYear + 1;   // jan tx, created in Nov/Dec → next year
      else if (monthIdx === 11 && fallbackMonth <= 1) year = fallbackYear - 1; // dez tx, created in Jan/Fev → previous year
      // Reject day-of-month overflow (e.g. "31 nov", "31 abr", "30 fev"):
      // silently letting `new Date(y,m,31)` roll into the next month would
      // place the tx in the wrong billing cycle. Fall back to `created_at`.
      if (day >= 1 && day <= daysInMonth(year, monthIdx)) {
        return new Date(year, monthIdx, day);
      }
      return hasFallback ? fallbackDate : new Date();
    }
    // "DD <not-a-month>" (e.g. "07 marte", "07 janela"): the input claims to
    // be a "day + month" pair but the second token is not a Portuguese month.
    // Skip the native `new Date(dateStr)` parser (V8 is too lenient here —
    // "07 janela" gets read as Jan 7) and go straight to the fallback.
    // Exception: if the second token is itself numeric (e.g. "15 / 07" whose
    // "/" got filtered out), fall through so the numeric branch can handle it.
    const secondLooksNumeric = /^-?\d+$/.test(parts[1]);
    // If the second token still carries a numeric separator (e.g. "16 /03"
    // or "15 -07" after whitespace collapse), let the numeric branch handle
    // it instead of bailing to fallback.
    const secondHasNumericSep = /[\/\-]\d/.test(parts[1]);
    if (dayLooksNumeric && !secondLooksNumeric && !secondHasNumericSep) {
      return hasFallback ? fallbackDate : new Date();
    }
  }



  // Numeric textual dates with separators "/" or "-".
  // pt-BR convention is DD/MM[/YYYY]; ISO is YYYY-MM-DD. We detect ISO by a
  // 4-digit leading segment; everything else is treated as day-first so that
  // "10/07", "10-07", "10/07/2026" and "10-07-2026" all resolve to the same
  // day/month (and, for 2-part inputs, the same billing cycle as "10 jul").
  // Split from a version of the input that keeps numeric separators intact —
  // `cleaned` collapses " - " to a single space for the DD-Month path, which
  // would destroy "31 - 12". Strip the same trailing punctuation `cleaned`
  // removes so noisy inputs like "10.,/07!" still match.
  const numericSource = rawCleaned
    .replace(/[.,;:!?]+/g, "")
    .replace(/\s*([\/\-])\s*/g, "$1");
  const numericParts = numericSource.split(/[\/\-]/);


  if (
    (numericParts.length === 2 || numericParts.length === 3) &&
    numericParts.every((p) => /^\d+$/.test(p))
  ) {
    let day: number, monthIdx: number, year: number | undefined;
    if (numericParts[0].length === 4 && numericParts.length === 3) {
      // ISO-like YYYY-MM-DD
      year = parseInt(numericParts[0]);
      monthIdx = parseInt(numericParts[1]) - 1;
      day = parseInt(numericParts[2]);
    } else {
      // DD/MM or DD/MM/YYYY (pt-BR)
      day = parseInt(numericParts[0]);
      monthIdx = parseInt(numericParts[1]) - 1;
      if (numericParts.length === 3) {
        const y = parseInt(numericParts[2]);
        year = y < 100 ? 2000 + y : y;
      }
    }
    const validDay = day >= 1 && day <= 31;
    const validMonth = monthIdx >= 0 && monthIdx <= 11;
    if (validDay && validMonth) {
      if (year === undefined) {
        year = fallbackYear;
        if (monthIdx === 0 && fallbackMonth >= 10) year = fallbackYear + 1;
        else if (monthIdx === 11 && fallbackMonth <= 1) year = fallbackYear - 1;
      }
      // Reject day-of-month overflow (e.g. "31/11", "31/04", "29/02" in a
      // non-leap year). Silently rolling into the next month would place
      // the tx in the wrong billing cycle — fall back to `created_at`.
      if (day <= daysInMonth(year, monthIdx)) {
        return new Date(year, monthIdx, day);
      }
    }
    return hasFallback ? fallbackDate : new Date();
  }


  // Guard: recusar entradas que começam ou terminam com separador ambíguo
  // ("-12", "31-", " - "). O `new Date("-12")` do V8 reinterpreta como ano
  // negativo/UTC e retorna 2001-12-01, empurrando a tx para outro ciclo.
  const trimmedForNative = rawCleaned.trim();
  const startsOrEndsWithSep = /^[\/\-]|[\/\-]$/.test(trimmedForNative);
  const hasDigit = /\d/.test(trimmedForNative);
  if (!hasDigit || startsOrEndsWithSep) {
    return hasFallback ? fallbackDate : new Date();
  }
  const d = new Date(rawCleaned || dateStr);
  return isNaN(d.getTime()) ? (hasFallback ? fallbackDate : new Date()) : d;
}



export function getBillingCycleMonthKey(dateStr: string, fallback: string, closingDay: number | null | undefined): string {
  const txDate = parseTxDate(dateStr, fallback);
  const cDay = closingDay || 1;
  let cycleEnd = new Date(txDate.getFullYear(), txDate.getMonth(), cDay);
  if (txDate >= cycleEnd) {
    cycleEnd = new Date(txDate.getFullYear(), txDate.getMonth() + 1, cDay);
  }
  return `${cycleEnd.getFullYear()}-${String(cycleEnd.getMonth() + 1).padStart(2, "0")}`;
}

export function getCycleDates(referenceDate: Date, closingDay: number, dueDay: number) {
  const cDay = closingDay || 1;
  const dDay = dueDay || 10;
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  const makeDue = (closing: Date) => {
    const d = new Date(closing.getFullYear(), closing.getMonth(), dDay);
    if (d <= closing) d.setMonth(d.getMonth() + 1);
    return d;
  };

  // "Current" invoice is the one whose due date falls in the current
  // calendar month — regardless of whether it's unpaid, partially paid or
  // fully paid. It only rolls forward when the calendar month changes.
  const currentClose = new Date(year, month, cDay);
  const currentDue = makeDue(currentClose);

  const prevClose = new Date(currentClose.getFullYear(), currentClose.getMonth() - 1, cDay);
  return { currentClose, currentDue, prevClose, makeDue };
}

export function groupByBillingCycle(txs: CardTransaction[], closingDay: number | null, dueDay: number | null, referenceDate: Date = new Date()): InvoicePeriod[] {
  const cDay = closingDay || 1;
  const dDay = dueDay || 10;
  const { currentClose: closingDate, prevClose: prevClosing, makeDue } = getCycleDates(referenceDate, closingDay || 1, dueDay || 10);
  const pastClosing = new Date(prevClosing.getFullYear(), prevClosing.getMonth() - 1, cDay);

  // Find the max future date from all transactions based on their actual date field
  let maxFutureDate = new Date();
  for (const tx of txs) {
    const txDate = parseTxDate(tx.date, tx.created_at);
    if (txDate > maxFutureDate) maxFutureDate = txDate;
  }

  const formatLabel = (prefix: string, endDate: Date) => {
    const dueDate = makeDue(endDate);
    return `${prefix} (F ${endDate.getDate().toString().padStart(2, '0')}/${(endDate.getMonth() + 1).toString().padStart(2, '0')} e V ${dueDate.getDate().toString().padStart(2, '0')}/${(dueDate.getMonth() + 1).toString().padStart(2, '0')})|${endDate.toISOString().split("T")[0]}`;
  };

  const periods: InvoicePeriod[] = [
    { label: formatLabel("Anterior", prevClosing), key: "past", startDate: pastClosing, endDate: prevClosing, dueDate: makeDue(prevClosing), transactions: [], total: 0 },
    { label: formatLabel("Atual", closingDate), key: "current", startDate: prevClosing, endDate: closingDate, dueDate: makeDue(closingDate), transactions: [], total: 0 },
  ];

  let futureStart = new Date(closingDate);
  let futureIndex = 0;
  // A transaction on the closing day belongs to the NEXT interval because
  // invoice periods use [startDate, endDate). Generate that extra interval
  // when the latest transaction lands exactly on a closing boundary.
  while (futureStart <= maxFutureDate || futureIndex === 0) {
    const futureEnd = new Date(futureStart.getFullYear(), futureStart.getMonth() + 1, cDay);
    periods.push({
      label: formatLabel("Próxima", futureEnd),
      key: `future_${futureIndex}`,
      startDate: new Date(futureStart),
      endDate: futureEnd,
      dueDate: makeDue(futureEnd),
      transactions: [],
      total: 0,
    });
    futureStart = futureEnd;
    futureIndex++;
    if (futureIndex > 24) break;
  }

  // Place each transaction in the correct period based on its DATE field
  for (const tx of txs) {
    const txDate = parseTxDate(tx.date, tx.created_at);

    let periodIdx = -1;
    for (let pi = 0; pi < periods.length; pi++) {
      if (txDate >= periods[pi].startDate && txDate < periods[pi].endDate) {
        periodIdx = pi;
        break;
      }
    }
    if (periodIdx === -1) continue;

    periods[periodIdx].transactions.push(tx);
    if (tx.type === "income") {
      periods[periodIdx].total -= Number(tx.amount);
    } else {
      periods[periodIdx].total += Number(tx.amount);
    }
  }

  return periods.filter((p, i) => i < 2 || p.transactions.length > 0);
}

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

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function inRange(dateStr: string | null | undefined, start: string, end: string): boolean {
  return Boolean(dateStr && dateStr >= start && dateStr <= end);
}

function monthKey(dateStr: string | null | undefined): string {
  return String(dateStr || "").slice(0, 7);
}

function findRule(rules: ReconciliationRule[], check: CheckType, targetId: string | null): ReconciliationRule | undefined {
  return rules.find(
    (r) =>
      r.enabled &&
      r.check_type === check &&
      (r.target_ids.length === 0 || (targetId != null && r.target_ids.includes(targetId)))
  );
}

function pushIssue(
  list: Divergence[],
  check_type: CheckType,
  entity_label: string,
  expected: number,
  actual: number,
  rule_id: string | null = null,
) {
  list.push({
    check_type,
    entity_id: null,
    entity_label,
    expected: round2(expected),
    actual: round2(actual),
    delta: round2(actual - expected),
    rule_id,
  });
}

function summary(check_type: CheckType, label: string, checked: number, issues: number): CheckSummary {
  return { check_type, label, checked, issues };
}

// -----------------------------------------------------------------------------
// Verificações automáticas obrigatórias
// -----------------------------------------------------------------------------

function checkDataQuality(input: ReconciliationInput): { divergences: Divergence[]; check: CheckSummary } {
  const divs: Divergence[] = [];
  const accountIds = new Set(input.bankAccounts.map((a) => a.id));
  const cardById = new Map(input.cards.map((c) => [c.id, c]));
  const cardsByName = new Map<string, typeof input.cards>();

  for (const card of input.cards) {
    const key = normalizeFinancialText(card.name);
    const current = cardsByName.get(key) ?? [];
    current.push(card);
    cardsByName.set(key, current);
  }

  for (const [name, cards] of cardsByName) {
    if (name && cards.length > 1) {
      pushIssue(divs, "card", `Nome de cartão duplicado: ${cards[0].name}`, 1, cards.length);
    }
  }

  const periodTxs = input.transactions.filter((t) => t.is_visible !== false && inRange(t.date, input.periodStart, input.periodEnd));
  for (const tx of periodTxs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
      pushIssue(divs, "data_quality", `Transação com data inválida: ${tx.id}`, 1, 0);
    }
    if (!Number.isFinite(Number(tx.amount)) || Number(tx.amount) < 0) {
      pushIssue(divs, "data_quality", `Transação com valor inválido: ${tx.id}`, 0, Number(tx.amount) || 0);
    }
    if (tx.bank_account_id && !accountIds.has(tx.bank_account_id)) {
      pushIssue(divs, "bank_account", `Transação aponta para conta inexistente: ${tx.id}`, 1, 0);
    }
    if (tx.card_id) {
      const card = cardById.get(tx.card_id);
      if (!card) {
        pushIssue(divs, "card", `Transação aponta para cartão inexistente: ${tx.id}`, 1, 0);
      } else if (tx.card && normalizeFinancialText(card.name) !== normalizeFinancialText(tx.card)) {
        pushIssue(divs, "card", `Cartão e card_id não correspondem: ${tx.id}`, 0, 1);
      }
    } else if (tx.card) {
      const matches = cardsByName.get(normalizeFinancialText(tx.card)) ?? [];
      if (matches.length === 0) {
        pushIssue(divs, "card", `Cartão não encontrado para transação: ${tx.card}`, 1, 0);
      } else if (matches.length > 1) {
        pushIssue(divs, "card", `Cartão ambíguo para transação: ${tx.card}`, 1, matches.length);
      }
    }

    const kind = inferTransactionKind(tx as any);
    if ((kind === "income" || kind === "yield" || kind === "refund") && tx.type !== "income") {
      pushIssue(divs, "data_quality", `Natureza e tipo não correspondem: ${tx.id}`, 1, 0);
    }
    if ((kind === "expense" || kind === "card_payment") && tx.type !== "expense") {
      pushIssue(divs, "data_quality", `Natureza e tipo não correspondem: ${tx.id}`, 1, 0);
    }
    if (kind === "transfer" && tx.type !== "income" && tx.type !== "expense") {
      pushIssue(divs, "transfer", `Transferência sem direção válida: ${tx.id}`, 1, 0);
    }
  }

  const periodPayments = input.cardPayments.filter((p) => inRange(p.date, input.periodStart, input.periodEnd));
  for (const payment of periodPayments) {
    if (!cardById.has(payment.card_id)) {
      pushIssue(divs, "card", `Pagamento aponta para cartão inexistente: ${payment.id}`, 1, 0);
    }
    if (payment.bank_account_id && !accountIds.has(payment.bank_account_id)) {
      pushIssue(divs, "bank_account", `Pagamento aponta para conta inexistente: ${payment.id}`, 1, 0);
    }
  }

  return {
    divergences: divs,
    check: summary("data_quality", "Integridade de datas, tipos e vínculos", periodTxs.length + periodPayments.length, divs.length),
  };
}

function checkTransferPairs(input: ReconciliationInput): { divergences: Divergence[]; check: CheckSummary } {
  const divs: Divergence[] = [];
  const groups = new Map<string, { date: string; amount: number; incomes: number; expenses: number; incomeAccounts: Set<string>; expenseAccounts: Set<string> }>();

  const rows = input.transactions.filter((t) => {
    if (t.is_visible === false || !inRange(t.date, input.periodStart, input.periodEnd)) return false;
    return inferTransactionKind(t as any) === "transfer";
  });

  for (const tx of rows) {
    const amount = round2(Number(tx.amount || 0));
    const key = `${tx.date}|${amount.toFixed(2)}`;
    const g = groups.get(key) ?? {
      date: tx.date,
      amount,
      incomes: 0,
      expenses: 0,
      incomeAccounts: new Set<string>(),
      expenseAccounts: new Set<string>(),
    };
    if (tx.type === "income") {
      g.incomes += 1;
      if (tx.bank_account_id) g.incomeAccounts.add(tx.bank_account_id);
    } else if (tx.type === "expense") {
      g.expenses += 1;
      if (tx.bank_account_id) g.expenseAccounts.add(tx.bank_account_id);
    }
    groups.set(key, g);
  }

  for (const g of groups.values()) {
    if (g.incomes !== g.expenses) {
      pushIssue(
        divs,
        "transfer",
        `Transferência sem par em ${g.date} · R$ ${g.amount.toFixed(2).replace(".", ",")}`,
        g.expenses,
        g.incomes,
      );
    }
    if (g.incomes > 0 && g.expenses > 0) {
      const sameAccount = [...g.incomeAccounts].some((id) => g.expenseAccounts.has(id));
      if (sameAccount && g.incomeAccounts.size === 1 && g.expenseAccounts.size === 1) {
        pushIssue(divs, "transfer", `Transferência usa a mesma conta nos dois lados em ${g.date}`, 0, g.amount);
      }
    }
  }

  return { divergences: divs, check: summary("transfer", "Transferências com entrada e saída correspondentes", rows.length, divs.length) };
}

function checkInstallments(input: ReconciliationInput): { divergences: Divergence[]; check: CheckSummary } {
  const divs: Divergence[] = [];
  const groups = new Map<string, typeof input.transactions>();

  for (const tx of input.transactions) {
    if (tx.is_visible === false || !tx.installment_group_id || Number(tx.total_installments || 1) <= 1) continue;
    const current = groups.get(tx.installment_group_id) ?? [];
    current.push(tx);
    groups.set(tx.installment_group_id, current);
  }

  let checked = 0;
  for (const [groupId, rows] of groups) {
    const relevant = rows.some((r) => inRange(r.date, input.periodStart, input.periodEnd) || inRange(r.purchase_date, input.periodStart, input.periodEnd));
    if (!relevant) continue;
    checked += 1;

    const totals = new Set(rows.map((r) => Number(r.total_installments || 0)).filter((n) => n > 0));
    const expectedTotal = Math.max(...totals, 0);
    const numbers = rows.map((r) => Number(r.installment_number || 0)).filter((n) => n > 0);
    const unique = new Set(numbers);

    if (totals.size > 1) {
      pushIssue(divs, "installment", `Parcelamento ${groupId} tem totais inconsistentes`, 1, totals.size);
    }
    const missing = expectedTotal > 0
      ? Array.from({ length: expectedTotal }, (_, i) => i + 1).filter((n) => !unique.has(n))
      : [];
    if (expectedTotal > 0 && (unique.size !== expectedTotal || missing.length > 0)) {
      pushIssue(divs, "installment", `Parcelamento ${groupId} incompleto${missing.length ? ` · faltam ${missing.join(", ")}` : ""}`, expectedTotal, unique.size);
    }
    if (unique.size !== numbers.length) {
      pushIssue(divs, "installment", `Parcelamento ${groupId} possui parcela duplicada`, unique.size, numbers.length);
    }

    const sourceAmount = Math.max(...rows.map((r) => Number(r.installment_source_amount || 0)).filter((n) => n > 0), 0);
    if (sourceAmount > 0 && expectedTotal > 0 && unique.size === expectedTotal) {
      const loaded = round2(rows.reduce((sum, r) => sum + Number(r.amount || 0), 0));
      if (Math.abs(loaded - sourceAmount) > 0.02) {
        pushIssue(divs, "installment", `Parcelamento ${groupId} não fecha com o valor original`, sourceAmount, loaded);
      }
    }
  }

  return { divergences: divs, check: summary("installment", "Sequência e valores dos parcelamentos", checked, divs.length) };
}

function checkRefunds(input: ReconciliationInput): { divergences: Divergence[]; check: CheckSummary } {
  const divs: Divergence[] = [];
  const txById = new Map(input.transactions.map((t) => [t.id, t]));
  const rows = input.cardRefunds.filter((r) => !r.date || inRange(r.date, input.periodStart, input.periodEnd));

  for (const refund of rows) {
    const original = txById.get(refund.transaction_id);
    if (!original) {
      pushIssue(divs, "refund", `Reembolso sem transação original: ${refund.id}`, 1, 0);
    } else if (Math.abs(Number(refund.original_amount || 0) - Number(original.amount || 0)) > 0.02) {
      pushIssue(divs, "refund", `Valor original do reembolso não confere: ${refund.id}`, Number(original.amount || 0), Number(refund.original_amount || 0));
    }

    if (refund.status === "confirmed") {
      if (!refund.refund_transaction_id) {
        pushIssue(divs, "refund", `Reembolso confirmado sem lançamento de devolução: ${refund.id}`, 1, 0);
        continue;
      }
      const refundTx = txById.get(refund.refund_transaction_id);
      if (!refundTx) {
        pushIssue(divs, "refund", `Lançamento do reembolso não foi encontrado: ${refund.id}`, 1, 0);
        continue;
      }
      if (inferTransactionKind(refundTx as any) !== "refund") {
        pushIssue(divs, "refund", `Lançamento vinculado não está marcado como reembolso: ${refund.id}`, 1, 0);
      }
      if (Math.abs(Number(refund.refund_amount || 0) - Number(refundTx.amount || 0)) > 0.02) {
        pushIssue(divs, "refund", `Valor do reembolso confirmado não confere: ${refund.id}`, Number(refund.refund_amount || 0), Number(refundTx.amount || 0));
      }
    }
  }

  return { divergences: divs, check: summary("refund", "Vínculos e valores de reembolsos", rows.length, divs.length) };
}

function compareMaps(
  divs: Divergence[],
  checkType: CheckType,
  labelPrefix: string,
  expectedRows: Array<{ key: string; amount: number }>,
  actualRows: Array<{ key: string; amount: number }>,
) {
  const expected = new Map(expectedRows.map((r) => [normalizeFinancialText(r.key), round2(r.amount)]));
  const actual = new Map(actualRows.map((r) => [normalizeFinancialText(r.key), round2(r.amount)]));
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  for (const key of keys) {
    const e = expected.get(key) ?? 0;
    const a = actual.get(key) ?? 0;
    if (Math.abs(e - a) > 0.02) {
      pushIssue(divs, checkType, `${labelPrefix}: ${key || "sem categoria"}`, e, a);
    }
  }
}

function checkCanonicalSystem(input: ReconciliationInput): { divergences: Divergence[]; check: CheckSummary } {
  const divs: Divergence[] = [];
  let checked = 0;

  for (const facts of input.canonicalFacts) {
    const local = computeMonthlyFinancialSummary(input.transactions as any, input.cards, facts.month);
    checked += 3;
    if (Math.abs(local.income - Number(facts.income || 0)) > 0.02) {
      pushIssue(divs, "system", `Receitas ${facts.month}: motor local × fonte canônica`, Number(facts.income || 0), local.income);
    }
    if (Math.abs(local.expense - Number(facts.expense || 0)) > 0.02) {
      pushIssue(divs, "system", `Despesas ${facts.month}: motor local × fonte canônica`, Number(facts.expense || 0), local.expense);
    }
    if (Math.abs(local.cardExpenseComponent - Number(facts.cardExpenseComponent || 0)) > 0.02) {
      pushIssue(divs, "system", `Cartões em DESPESAS ${facts.month}: motor local × fonte canônica`, Number(facts.cardExpenseComponent || 0), local.cardExpenseComponent);
    }

    const localCategories = computeMonthlyCategoryTotals(input.transactions as any, facts.month);
    compareMaps(
      divs,
      "system",
      `Categoria ${facts.month}`,
      (facts.categories || []).map((r) => ({ key: r.category, amount: Number(r.amount || 0) })),
      localCategories.map((r) => ({ key: r.category, amount: Number(r.amount || 0) })),
    );
    checked += new Set([...(facts.categories || []).map((r) => normalizeFinancialText(r.category)), ...localCategories.map((r) => normalizeFinancialText(r.category))]).size;

    const localCards = computeCardConsistency(input.transactions as any, input.cards, facts.month).cards;
    compareMaps(
      divs,
      "system",
      `Cartão ${facts.month}`,
      (facts.cards || []).map((r) => ({ key: r.card, amount: Number(r.amount || 0) })),
      localCards.map((r) => ({ key: r.card, amount: Number(r.amount || 0) })),
    );
    checked += new Set([...(facts.cards || []).map((r) => normalizeFinancialText(r.card)), ...localCards.map((r) => normalizeFinancialText(r.card))]).size;
  }

  return { divergences: divs, check: summary("system", "Home/Transações/Insights × fonte financeira canônica", checked, divs.length) };
}

// -----------------------------------------------------------------------------
// Regras adicionais configuráveis pelo usuário
// -----------------------------------------------------------------------------

function checkCustomCards(input: ReconciliationInput): Divergence[] {
  const divs: Divergence[] = [];
  for (const card of input.cards) {
    const rule = findRule(input.rules, "card", card.id);
    if (!rule) continue;

    if (rule.rule_kind === "zero") {
      const expected = 0;
      const actual = round2(card.used);
      const delta = round2(actual - expected);
      if (!withinTolerance(delta, expected, rule.tolerance_kind, rule.tolerance_value)) {
        pushIssue(divs, "card", `${card.name} (used deve ser 0)`, expected, actual, rule.id);
      }
      continue;
    }

    const txs = input.transactions.filter((t) => {
      if (t.is_visible === false) return false;
      if (!inRange(t.date, input.periodStart, input.periodEnd)) return false;
      return t.card_id === card.id || (!t.card_id && normalizeFinancialText(t.card) === normalizeFinancialText(card.name));
    });
    let spent = 0;
    for (const tx of txs) {
      const kind = inferTransactionKind(tx as any);
      if (kind === "expense") spent += Number(tx.amount || 0);
      else if (kind === "refund") spent -= Number(tx.amount || 0);
    }
    const paid = input.cardPayments
      .filter((p) => p.card_id === card.id && inRange(p.date, input.periodStart, input.periodEnd))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const expected = round2(spent - paid);
    const actual = round2(card.used);
    const delta = round2(actual - expected);
    if (!withinTolerance(delta, expected, rule.tolerance_kind, rule.tolerance_value)) {
      pushIssue(divs, "card", card.name, expected, actual, rule.id);
    }
  }
  return divs;
}

function checkCustomInvoices(input: ReconciliationInput): Divergence[] {
  const divs: Divergence[] = [];
  for (const card of input.cards) {
    const rule = findRule(input.rules, "invoice", card.id);
    if (!rule) continue;

    const months = new Set<string>();
    for (const tx of input.transactions) {
      if (tx.card_id !== card.id && (tx.card_id || normalizeFinancialText(tx.card) !== normalizeFinancialText(card.name))) continue;
      const cycle = getBillingCycleMonthKey(tx.date, tx.created_at || `${tx.date}T12:00:00`, card.closing_day);
      months.add(cycle);
    }
    for (const payment of input.cardPayments.filter((p) => p.card_id === card.id)) {
      months.add(monthKey(payment.target_period || payment.date));
    }

    for (const ym of months) {
      if (ym < input.periodStart.slice(0, 7) || ym > input.periodEnd.slice(0, 7)) continue;
      const spent = input.transactions
        .filter((tx) => {
          if (tx.is_visible === false) return false;
          if (tx.card_id !== card.id && (tx.card_id || normalizeFinancialText(tx.card) !== normalizeFinancialText(card.name))) return false;
          return getBillingCycleMonthKey(tx.date, tx.created_at || `${tx.date}T12:00:00`, card.closing_day) === ym;
        })
        .reduce((sum, tx) => {
          const kind = inferTransactionKind(tx as any);
          if (kind === "expense") return sum + Number(tx.amount || 0);
          if (kind === "refund") return sum - Number(tx.amount || 0);
          return sum;
        }, 0);
      const paid = input.cardPayments
        .filter((p) => p.card_id === card.id && monthKey(p.target_period || p.date) === ym)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const expected = 0;
      const actual = round2(spent - paid);
      const delta = round2(actual);
      if (!withinTolerance(delta, expected, rule.tolerance_kind, rule.tolerance_value)) {
        pushIssue(divs, "invoice", `${card.name} ${ym}`, expected, actual, rule.id);
      }
    }
  }
  return divs;
}

function checkCustomBudgets(input: ReconciliationInput): Divergence[] {
  const divs: Divergence[] = [];
  for (const b of input.budgets) {
    const rule = findRule(input.rules, "budget", b.id);
    if (!rule) continue;
    const spent = input.transactions
      .filter((t) => {
        if (t.is_visible === false || inferTransactionKind(t as any) !== "expense") return false;
        return normalizeFinancialText(String(t.category || "").split(">")[0]) === normalizeFinancialText(b.category)
          && inRange(t.purchase_date || t.date, b.period_start, b.period_end)
          && inRange(t.purchase_date || t.date, input.periodStart, input.periodEnd);
      })
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const expected = round2(b.amount);
    const actual = round2(spent);
    const delta = round2(actual - expected);
    if (!withinTolerance(delta, expected, rule.tolerance_kind, rule.tolerance_value)) {
      pushIssue(divs, "budget", b.category, expected, actual, rule.id);
    }
  }
  return divs;
}

export function runReconciliation(input: ReconciliationInput): RunResult {
  const automatic = [
    checkDataQuality(input),
    checkTransferPairs(input),
    checkInstallments(input),
    checkRefunds(input),
    checkCanonicalSystem(input),
  ];

  const custom = [
    ...checkCustomCards(input),
    ...checkCustomInvoices(input),
    ...checkCustomBudgets(input),
  ];

  const divergences = [...automatic.flatMap((x) => x.divergences), ...custom];
  const counts_by_check: Record<CheckType, number> = {
    bank_account: 0,
    card: 0,
    invoice: 0,
    budget: 0,
    transfer: 0,
    installment: 0,
    data_quality: 0,
    refund: 0,
    system: 0,
  };

  let total = 0;
  for (const d of divergences) {
    counts_by_check[d.check_type]++;
    total += Math.abs(d.delta);
  }

  const checks = automatic.map((x) => x.check);
  if (input.rules.some((r) => r.enabled)) {
    checks.push(summary("card", "Regras adicionais configuradas", input.rules.filter((r) => r.enabled).length, custom.length));
  }

  return {
    verification_version: 2,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    divergences,
    total_divergence_amount: round2(total),
    counts_by_check,
    checks,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      console.error("reconciliation-daily missing Supabase configuration");
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const suppliedToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (!suppliedToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supa = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isAuthorized, error: authError } = await supa.rpc(
      "verify_reconciliation_cron_secret",
      { p_token: suppliedToken },
    );
    if (authError || isAuthorized !== true) {
      if (authError) console.error("reconciliation-daily auth check failed", authError.message);
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const periodEnd = yesterday.toISOString().slice(0, 10);
    const periodStart = periodEnd;
    
    const { data: ruleUsers, error: ruErr } = await supa
      .from("reconciliation_rules")
      .select("user_id")
      .eq("enabled", true);
    if (ruErr) { console.error("reconciliation-daily rule query failed", ruErr.message); return Response.json({ error: "Internal server error" }, { status: 500 }); }
    
    const userIds = Array.from(new Set((ruleUsers ?? []).map((r: any) => String(r.user_id)).filter(Boolean)));
    
    let processed = 0;
    for (const userId of userIds) {
      try {
        const [txs, cards, banks, buds, pays, refunds, rules] = await Promise.all([
          supa
            .from("transactions")
            .select("id,date,transaction_date,purchase_date,created_at,amount,type,transaction_kind,is_visible,bank_account_id,card,card_id,category,installment_group_id,installment_number,total_installments,installment_source_amount")
            .eq("user_id", userId),
          supa.from("cards").select("id,name,used,closing_day,due_day").eq("user_id", userId),
          supa.from("bank_accounts").select("id,name,balance").eq("user_id", userId),
          supa.from("budget_categories").select("id,category,budget_limit").eq("user_id", userId),
          supa.from("card_payments").select("id,card_id,bank_account_id,amount,paid_at,target_period").eq("user_id", userId),
          supa
            .from("card_refunds")
            .select("id,transaction_id,card_name,original_amount,refund_amount,status,refund_transaction_id,confirmed_at,created_at")
            .eq("user_id", userId),
          supa.from("reconciliation_rules").select("*").eq("user_id", userId).eq("enabled", true),
        ]);
    
        const queryErrors = [txs, cards, banks, buds, pays, refunds, rules]
          .map((result) => result.error)
          .filter(Boolean);
        if (queryErrors.length) throw queryErrors[0];
    
        const dateOnly = (value: unknown) => String(value || "").slice(0, 10);
    
        const input: ReconciliationInput = {
          periodStart,
          periodEnd,
          transactions: (txs.data ?? []).map((r: any) => {
            const kind = r.transaction_kind || null;
            const type = String(r.type || "expense");
            return {
              id: String(r.id),
              date: dateOnly(r.transaction_date || r.date),
              created_at: r.created_at,
              purchase_date: r.purchase_date ? dateOnly(r.purchase_date) : null,
              amount: Number(r.amount ?? 0),
              type,
              transaction_kind: kind,
              is_visible: r.is_visible,
              bank_account_id: r.bank_account_id,
              card: r.card,
              card_id: r.card_id,
              category: r.category,
              transfer_direction:
                kind === "transfer"
                  ? type === "income"
                    ? "in"
                    : type === "expense"
                      ? "out"
                      : null
                  : null,
              installment_group_id: r.installment_group_id,
              installment_number: r.installment_number == null ? null : Number(r.installment_number),
              total_installments: r.total_installments == null ? null : Number(r.total_installments),
              installment_source_amount:
                r.installment_source_amount == null ? null : Number(r.installment_source_amount),
            };
          }),
          cards: (cards.data ?? []).map((r: any) => ({
            id: String(r.id),
            name: String(r.name || "Cartão"),
            used: Number(r.used ?? 0),
            closing_day: Number(r.closing_day ?? 1),
            due_day: Number(r.due_day ?? 1),
          })),
          bankAccounts: (banks.data ?? []).map((r: any) => ({
            id: String(r.id),
            name: String(r.name || "Conta"),
            opening_balance: Number(r.balance ?? 0),
          })),
          budgets: (buds.data ?? []).map((r: any) => ({
            id: String(r.id),
            category: String(r.category || "Sem categoria"),
            amount: Number(r.budget_limit ?? 0),
            period_start: periodStart,
            period_end: periodEnd,
          })),
          cardPayments: (pays.data ?? []).map((r: any) => ({
            id: String(r.id),
            card_id: String(r.card_id || ""),
            bank_account_id: r.bank_account_id,
            amount: Number(r.amount ?? 0),
            date: dateOnly(r.paid_at || r.target_period),
            target_period: r.target_period ? dateOnly(r.target_period) : null,
          })),
          cardRefunds: (refunds.data ?? []).map((r: any) => ({
            id: String(r.id),
            transaction_id: String(r.transaction_id || ""),
            card_name: r.card_name,
            original_amount: Number(r.original_amount ?? 0),
            refund_amount: Number(r.refund_amount ?? 0),
            status: String(r.status || ""),
            refund_transaction_id: r.refund_transaction_id,
            date: dateOnly(r.confirmed_at || r.created_at),
          })),
          rules: (rules.data ?? []) as ReconciliationRule[],
          canonicalFacts: [],
        };
    
        const result = runReconciliation(input);
    
        const { data: run, error: runError } = await supa
          .from("reconciliation_runs")
          .insert({
            user_id: userId,
            triggered_by: "scheduled",
            period_start: periodStart,
            period_end: periodEnd,
            status: "completed",
            completed_at: new Date().toISOString(),
            divergences_count: result.divergences.length,
            total_divergence_amount: result.total_divergence_amount,
            payload: result,
          })
          .select()
          .single();
        if (runError) throw runError;
    
        if (run && result.divergences.length > 0) {
          const { error: divergenceError } = await supa.from("reconciliation_divergences").insert(
            result.divergences.map((d) => ({
              run_id: run.id,
              user_id: userId,
              check_type: d.check_type,
              entity_id: d.entity_id,
              entity_label: d.entity_label,
              expected: d.expected,
              actual: d.actual,
              delta: d.delta,
              rule_id: d.rule_id ?? null,
            }))
          );
          if (divergenceError) throw divergenceError;
        }
        processed++;
      } catch (e) {
        console.error("recon-daily user failed", userId, e);
      }
    }
    
    return Response.json({ ok: true, processed, users: userIds.length });
  } catch (error) {
    console.error("reconciliation-daily unexpected failure", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
});
