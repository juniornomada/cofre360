/**
 * Canonical formatter for the credit-card due-date label.
 *
 * Always returns "Venc. dd/mm" with zero-padded day and month, regardless
 * of locale, timezone or Date construction path. Guards the wording
 * migration away from "Fatura {mês}".
 *
 * Invalid Date inputs return "Venc. --/--" so the UI never renders "NaN/NaN".
 */
export function formatDueDate(d: Date | null | undefined): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "--/--";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

export function formatDueLabel(d: Date | null | undefined): string {
  return `Venc. ${formatDueDate(d)}`;
}

/**
 * Screen-reader friendly expansion of `formatDueLabel`. Avoids the "Venc."
 * abbreviation (which assistive tech may read as "vench") and never leaks the
 * legacy "Fatura {mês}" wording into the accessibility tree.
 *
 * Returns "Vencimento em dd/mm" for real dates, "Vencimento indisponível" as
 * fallback for null/undefined/invalid dates (loading/empty/error states).
 */
export function formatDueAriaLabel(d: Date | null | undefined): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "Vencimento indisponível";
  return `Vencimento em ${formatDueDate(d)}`;
}
