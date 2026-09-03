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
