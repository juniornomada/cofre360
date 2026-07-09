// Pure helpers to keep totals consistent when the user toggles between the
// two installment input modes on the credit-card flow:
//   - "divide": the typed amount represents the TOTAL purchase (parcela = total / N)
//   - "fixed":  the typed amount represents EACH parcela (total = parcela × N)
//
// Toggling between modes must preserve the economic value of the purchase:
//   divide(total=1000, N=4)  <-> fixed(parcela=250, N=4)  // both mean R$ 1000
//
// All monetary values are rounded to 2 decimals to match how the database and
// calculateInstallmentDetails() round.

import type { InstallmentMode } from "./installment-utils";

function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

export interface ToggleInput {
  /** Current mode BEFORE the toggle. */
  fromMode: InstallmentMode;
  /** Value currently in the "amount" field. In `divide` mode this is the total; in `fixed` mode this is the per-parcela value. */
  amount: number;
  /** Value currently stored as fixed-per-parcela (relevant when fromMode === "fixed"). */
  fixedValue: number;
  /** Installment count (N). */
  count: number;
}

export interface ToggleOutput {
  /** New mode AFTER the toggle. */
  mode: InstallmentMode;
  /** New value to place in the "amount" field. */
  amount: number;
  /** New value to place in the fixed-per-parcela state. */
  fixedValue: number;
  /** The economic total of the purchase (parcela × N), invariant across toggles. */
  total: number;
}

/**
 * Toggle to "divide" mode: the amount field becomes the total (parcela × N).
 */
export function toDivideMode(input: Pick<ToggleInput, "amount" | "fixedValue" | "count" | "fromMode">): ToggleOutput {
  const count = Math.max(1, Math.floor(input.count || 1));
  if (input.fromMode === "divide") {
    const total = round2(input.amount);
    return { mode: "divide", amount: total, fixedValue: input.fixedValue, total };
  }
  const total = round2((input.fixedValue || 0) * count);
  return { mode: "divide", amount: total, fixedValue: input.fixedValue, total };
}

/**
 * Toggle to "fixed" mode: the amount field becomes the per-parcela value (total / N).
 */
export function toFixedMode(input: Pick<ToggleInput, "amount" | "fixedValue" | "count" | "fromMode">): ToggleOutput {
  const count = Math.max(1, Math.floor(input.count || 1));
  if (input.fromMode === "fixed") {
    const per = round2(input.amount || input.fixedValue);
    return { mode: "fixed", amount: per, fixedValue: per, total: round2(per * count) };
  }
  const per = round2((input.amount || 0) / count);
  return { mode: "fixed", amount: per, fixedValue: per, total: round2(per * count) };
}

/**
 * Given a mode and inputs, compute the invariant "economic total" of the purchase.
 * This is the value that must remain consistent across toggles (up to rounding).
 */
export function computeTotal(mode: InstallmentMode, amount: number, fixedValue: number, count: number): number {
  const c = Math.max(1, Math.floor(count || 1));
  return mode === "divide" ? round2(amount || 0) : round2((fixedValue || amount || 0) * c);
}

/**
 * Recompute the amount field when the installment count (N) changes, preserving
 * the economic total (parcela × N) of the purchase:
 *   - divide mode: the total lives in `amount`, so it stays put; only the
 *     derived per-parcela changes (total / newCount).
 *   - fixed mode: total = amount × prevCount; the new per-parcela becomes
 *     total / newCount so the economic total remains invariant.
 */
export function changeInstallmentCount(input: {
  mode: InstallmentMode;
  amount: number;
  fixedValue?: number;
  prevCount: number;
  newCount: number;
}): ToggleOutput {
  const prev = Math.max(1, Math.floor(input.prevCount || 1));
  const next = Math.max(1, Math.floor(input.newCount || 1));
  if (input.mode === "divide") {
    const total = round2(input.amount || 0);
    return { mode: "divide", amount: total, fixedValue: round2(total / next), total };
  }
  const per = input.amount || input.fixedValue || 0;
  const total = round2(per * prev);
  const newPer = round2(total / next);
  return { mode: "fixed", amount: newPer, fixedValue: newPer, total };
}

/**
 * Validate that a mode + inputs represent a coherent installment plan.
 * Returns a friendly error message, or null when everything checks out.
 */
export function validateInstallmentInputs(
  mode: InstallmentMode,
  amount: number,
  fixedValue: number,
  count: number,
): string | null {
  const c = Math.max(1, Math.floor(count || 1));
  if (c < 1) return "Número de parcelas inválido.";
  if (mode === "divide" && (amount || 0) <= 0) return "Informe um valor total maior que zero.";
  if (mode === "fixed" && ((fixedValue || amount || 0) <= 0)) return "Informe um valor por parcela maior que zero.";
  return null;
}
