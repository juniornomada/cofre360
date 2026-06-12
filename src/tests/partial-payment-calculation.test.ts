import { describe, it, expect } from "vitest";

/**
 * Replica a lógica de atribuição de pagamentos a períodos de fatura
 * (src/routes/cards.tsx — fetchAll) e o cálculo de "Já pago" / "Faltam"
 * exibido no diálogo de detalhes da fatura.
 *
 * Cenário base usado pelo usuário: cartão Porto Bank, fatura atual de
 * R$ 1.953,50, com um pagamento parcial de R$ 1.300,00 — deve resultar em
 * "JÁ PAGO R$ 1.300,00" e "FALTAM R$ 653,50".
 */

type Payment = { card_id: string; amount: number; paid_at: string };
type Card = { id: string; closing_day: number; due_day: number };

function periodKeyForPayment(paidAt: Date, closingDay: number): string {
  const closingThisMonth = new Date(paidAt.getFullYear(), paidAt.getMonth(), closingDay);
  const targetClose = paidAt >= closingThisMonth
    ? closingThisMonth
    : new Date(paidAt.getFullYear(), paidAt.getMonth() - 1, closingDay);
  return targetClose.toISOString().split("T")[0];
}

function buildPaymentsByPeriod(card: Card, payments: Payment[]) {
  const totalByPeriod: Record<string, number> = {};
  const detailedByPeriod: Record<string, { amount: number; date: string }[]> = {};

  for (const p of payments.filter((x) => x.card_id === card.id)) {
    const key = periodKeyForPayment(new Date(p.paid_at), card.closing_day);
    totalByPeriod[key] = (totalByPeriod[key] || 0) + p.amount;
    if (!detailedByPeriod[key]) detailedByPeriod[key] = [];
    detailedByPeriod[key].push({ amount: p.amount, date: p.paid_at });
  }

  return { totalByPeriod, detailedByPeriod };
}

function computeInvoiceStatus(invoiceTotal: number, paidInPeriod: number) {
  const jaPago = paidInPeriod;
  const faltam = Math.max(0, invoiceTotal - paidInPeriod);
  let badge: "Total" | "Parcial" | null = null;
  if (jaPago >= invoiceTotal && invoiceTotal > 0) badge = "Total";
  else if (jaPago > 0 && jaPago < invoiceTotal) badge = "Parcial";
  return { jaPago, faltam, badge };
}

describe("Pagamento parcial — Já pago e Faltam", () => {
  const portoBank: Card = { id: "porto-1", closing_day: 3, due_day: 10 };
  // Fatura "Atual" fecha em 03/07/2026 → key = "2026-07-03"
  const periodKeyAtual = "2026-07-03";
  const invoiceTotal = 1953.5;

  it("R$ 1.300,00 pagos em 12/06/2026 → JÁ PAGO 1300,00 e FALTAM 653,50", () => {
    const payments: Payment[] = [
      { card_id: portoBank.id, amount: 1300, paid_at: "2026-06-12T10:00:00.000Z" },
    ];
    const { totalByPeriod, detailedByPeriod } = buildPaymentsByPeriod(portoBank, payments);

    expect(Object.keys(totalByPeriod)).toContain(periodKeyAtual);
    expect(detailedByPeriod[periodKeyAtual]).toHaveLength(1);
    expect(detailedByPeriod[periodKeyAtual][0]).toEqual({
      amount: 1300,
      date: "2026-06-12T10:00:00.000Z",
    });

    const { jaPago, faltam, badge } = computeInvoiceStatus(
      invoiceTotal,
      totalByPeriod[periodKeyAtual] || 0
    );
    expect(jaPago).toBeCloseTo(1300, 2);
    expect(faltam).toBeCloseTo(653.5, 2);
    expect(badge).toBe("Parcial");
  });

  it("soma múltiplos pagamentos parciais no mesmo período (R$ 800 + R$ 500)", () => {
    const payments: Payment[] = [
      { card_id: portoBank.id, amount: 800, paid_at: "2026-06-12T10:00:00.000Z" },
      { card_id: portoBank.id, amount: 500, paid_at: "2026-06-20T10:00:00.000Z" },
    ];
    const { totalByPeriod, detailedByPeriod } = buildPaymentsByPeriod(portoBank, payments);

    expect(detailedByPeriod[periodKeyAtual]).toHaveLength(2);
    const { jaPago, faltam, badge } = computeInvoiceStatus(
      invoiceTotal,
      totalByPeriod[periodKeyAtual]
    );
    expect(jaPago).toBeCloseTo(1300, 2);
    expect(faltam).toBeCloseTo(653.5, 2);
    expect(badge).toBe("Parcial");
  });

  it("pagamento que quita totalmente a fatura → badge Total e FALTAM 0", () => {
    const payments: Payment[] = [
      { card_id: portoBank.id, amount: 1953.5, paid_at: "2026-06-15T10:00:00.000Z" },
    ];
    const { totalByPeriod } = buildPaymentsByPeriod(portoBank, payments);
    const { jaPago, faltam, badge } = computeInvoiceStatus(
      invoiceTotal,
      totalByPeriod[periodKeyAtual]
    );
    expect(jaPago).toBeCloseTo(1953.5, 2);
    expect(faltam).toBe(0);
    expect(badge).toBe("Total");
  });

  it("pagamento antes do fechamento (02/06) é atribuído à fatura ANTERIOR (key 2026-05-03), não à Atual", () => {
    const payments: Payment[] = [
      { card_id: portoBank.id, amount: 1300, paid_at: "2026-06-02T10:00:00.000Z" },
    ];
    const { totalByPeriod } = buildPaymentsByPeriod(portoBank, payments);

    expect(totalByPeriod["2026-05-03"]).toBeCloseTo(1300, 2);
    expect(totalByPeriod[periodKeyAtual]).toBeUndefined();

    const { jaPago, faltam } = computeInvoiceStatus(
      invoiceTotal,
      totalByPeriod[periodKeyAtual] || 0
    );
    expect(jaPago).toBe(0);
    expect(faltam).toBeCloseTo(1953.5, 2);
  });

  it("pagamento exatamente no dia do fechamento (03/07) entra na fatura recém-fechada (Atual)", () => {
    const payments: Payment[] = [
      { card_id: portoBank.id, amount: 200, paid_at: "2026-07-03T12:00:00.000Z" },
    ];
    const { totalByPeriod } = buildPaymentsByPeriod(portoBank, payments);
    expect(totalByPeriod[periodKeyAtual]).toBeCloseTo(200, 2);
  });

  it("FALTAM nunca fica negativo quando o pagamento excede o total da fatura", () => {
    const { faltam, badge } = computeInvoiceStatus(invoiceTotal, 2500);
    expect(faltam).toBe(0);
    expect(badge).toBe("Total");
  });
});
