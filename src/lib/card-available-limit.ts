import { remainingInvoiceAmount } from "@/lib/invoice-payment-status";

export type LimitInvoicePeriod = {
  key: string;
  endDate?: Date | null;
  total?: number | null;
};

export type PaymentsByPeriod = Record<string, number> | null | undefined;

export function getCurrentAndFutureOutstanding(
  periods: LimitInvoicePeriod[],
  paymentsByPeriod: PaymentsByPeriod,
): number {
  const total = periods
    .filter((period) => period.key === "current" || period.key.startsWith("future_"))
    .reduce((sum, period) => {
      const periodKey = period.endDate?.toISOString().slice(0, 10) || "";
      const paid = periodKey ? Number(paymentsByPeriod?.[periodKey] || 0) : 0;
      return sum + remainingInvoiceAmount(Number(period.total || 0), paid);
    }, 0);

  return Math.round(total * 100) / 100;
}

export function getCardAvailableLimit(
  cardLimit: number,
  periods: LimitInvoicePeriod[],
  paymentsByPeriod: PaymentsByPeriod,
): number {
  const committed = getCurrentAndFutureOutstanding(periods, paymentsByPeriod);
  return Math.round((Number(cardLimit || 0) - committed) * 100) / 100;
}
