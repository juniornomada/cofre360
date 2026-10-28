import type { InvoicePeriod } from "@/lib/invoice-utils";

export const ANTICIPATION_DISCOUNT_CATEGORY = "Receita > Reembolso";
export const ANTICIPATION_DISCOUNT_PREFIX = "Desconto de antecipação";

export function parseBrazilianDiscountCents(value: string): number | null {
  const raw = value.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  // Accept "12,34", "12.34", "1.234,56" and plain integer amounts.
  const normalized = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw)
    ? raw.replace(/\./g, "").replace(",", ".")
    : /^\d+(?:,\d{1,2})?$/.test(raw)
      ? raw.replace(",", ".")
      : /^\d+\.\d{1,2}$/.test(raw)
        ? raw
        : "";
  if (!normalized) return null;
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  const cents = Math.round(number * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function discountDateForInvoice(
  period: Pick<InvoicePeriod, "startDate" | "endDate">,
  now = new Date(),
): string {
  if (now >= period.endDate) throw new Error("A fatura já está fechada.");
  const intended = now >= period.startDate
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : new Date(period.startDate.getFullYear(), period.startDate.getMonth(), period.startDate.getDate() + 1);
  if (intended < period.startDate || intended >= period.endDate) {
    throw new Error("Não foi possível posicionar o desconto na fatura escolhida.");
  }
  const y = intended.getFullYear();
  const m = String(intended.getMonth() + 1).padStart(2, "0");
  const d = String(intended.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function validateAnticipationDiscount(
  amountCents: number | null,
  invoiceTotalCents: number,
  paidCents: number,
): string | null {
  if (!Number.isSafeInteger(amountCents) || amountCents === null || amountCents <= 0) {
    return "Informe um desconto positivo e válido.";
  }
  if (paidCents > 0) return "Esta fatura já tem um pagamento registrado. O desconto não foi lançado.";
  if (invoiceTotalCents <= 0) return "A fatura não possui saldo positivo para abater.";
  if (amountCents > invoiceTotalCents) return "O desconto não pode superar o total da fatura.";
  return null;
}

export function discountCreditName(description: string): string {
  const detail = description.replace(/\s+/g, " ").trim().slice(0, 110);
  return detail ? `${ANTICIPATION_DISCOUNT_PREFIX} — ${detail}` : ANTICIPATION_DISCOUNT_PREFIX;
}

export function isAnticipationDiscountCredit(tx: { type?: string | null; name?: string | null; category?: string | null; card?: string | null }) {
  return tx.type === "income" && !!tx.card &&
    tx.category === ANTICIPATION_DISCOUNT_CATEGORY &&
    (tx.name || "").startsWith(ANTICIPATION_DISCOUNT_PREFIX);
}
