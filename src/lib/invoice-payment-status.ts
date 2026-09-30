export type InvoicePaymentStatus = "empty" | "open" | "partial" | "total";

export function moneyToCents(value: number): number {
  const safe = Number.isFinite(value) ? value : 0;
  return Math.round(safe * 100);
}

export function remainingInvoiceAmount(total: number, paid: number): number {
  const remainingCents = Math.max(0, moneyToCents(total) - moneyToCents(paid));
  return remainingCents / 100;
}

export function getInvoicePaymentStatus(total: number, paid: number): InvoicePaymentStatus {
  const totalCents = moneyToCents(total);
  const paidCents = moneyToCents(paid);

  if (totalCents <= 0) return "empty";
  if (paidCents <= 0) return "open";
  if (paidCents >= totalCents) return "total";
  return "partial";
}

type ShouldAutoAdvanceInvoiceMonthInput = {
  total: number;
  paid: number;
  dueDate: Date | null | undefined;
  today?: Date;
  hasExplicitMonthSelection?: boolean;
};

/**
 * The cards screen may default to the next invoice only after the currently
 * selected calendar invoice is both fully paid and past its due date.
 *
 * A fully paid invoice that has not reached/passed its due date remains the
 * default. Any explicit month selected by the user always wins over this
 * automatic behavior.
 */
export function shouldAutoAdvanceInvoiceMonth({
  total,
  paid,
  dueDate,
  today = new Date(),
  hasExplicitMonthSelection = false,
}: ShouldAutoAdvanceInvoiceMonthInput): boolean {
  if (hasExplicitMonthSelection) return false;
  if (getInvoicePaymentStatus(total, paid) !== "total") return false;
  if (!dueDate || Number.isNaN(dueDate.getTime()) || Number.isNaN(today.getTime())) return false;

  const due = new Date(dueDate);
  const now = new Date(today);
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  return due < now;
}
