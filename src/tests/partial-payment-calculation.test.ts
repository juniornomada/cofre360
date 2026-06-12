import { describe, it, expect } from "vitest";
import { getCycleDates } from "@/lib/invoice-utils";

/**
 * Replica a lógica de atribuição de pagamentos a períodos de fatura
 * (src/routes/cards.tsx — fetchAll) e o cálculo de "Já pago" / "Faltam"
 * exibido no diálogo de detalhes da fatura.
 *
 * Cenário base: cartão Porto Bank (fecha dia 3, vence dia 10), fatura
 * Atual de R$ 1.953,50, com pagamento parcial de R$ 1.300,00.
 * Esperado: JÁ PAGO R$ 1.300,00 e FALTAM R$ 653,50.
 */

type Payment = { card_id: string; amount: number; paid_at: string };
type Card = { id: string; closing_day: number; due_day: number };

function periodKeyForPayment(paidAt: Date, card: Card): string {
  const { currentClose } = getCycleDates(paidAt, card.closing_day, card.due_day);
  return currentClose.toISOString().split("T")[0];
}

function buildPaymentsByPeriod(card: Card, payments: Payment[]) {
  const totalByPeriod: Record<string, number> = {};
  const detailedByPeriod: Record<string, { amount: number; date: string }[]> = {};

  for (const p of payments.filter((x) => x.card_id === card.id)) {
    const key = periodKeyForPayment(new Date(p.paid_at), card);
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

/**
 * Chave do período "Atual" para um cartão dado um "hoje" — replica
 * groupByBillingCycle: endDate do período current = currentClose
 * calculado a partir da referência de hoje.
 */
function activePeriodKey(card: Card, today: Date): string {
  const { currentClose } = getCycleDates(today, card.closing_day, card.due_day);
  return currentClose.toISOString().split("T")[0];
}

describe("Pagamento parcial — Já pago e Faltam", () => {
  const portoBank: Card = { id: "porto-1", closing_day: 3, due_day: 10 };
  const invoiceTotal = 1953.5;
  // Hoje fixo: 12/06/2026 → "Atual" fecha em 03/07/2026.
  const today = new Date(2026, 5, 12);
  const keyAtual = activePeriodKey(portoBank, today);

  it("ancoragem: período Atual referente a 12/06/2026 fecha em 03/07/2026", () => {
    expect(keyAtual).toBe("2026-07-03");
  });

  it("R$ 1.300,00 pagos em 12/06/2026 → JÁ PAGO 1300,00 e FALTAM 653,50 na fatura Atual", () => {
    const payments: Payment[] = [
      { card_id: portoBank.id, amount: 1300, paid_at: new Date(2026, 5, 12, 10).toISOString() },
    ];
    const { totalByPeriod, detailedByPeriod } = buildPaymentsByPeriod(portoBank, payments);

    expect(Object.keys(totalByPeriod)).toContain(keyAtual);
    expect(detailedByPeriod[keyAtual]).toHaveLength(1);
    expect(detailedByPeriod[keyAtual][0].amount).toBe(1300);

    const { jaPago, faltam, badge } = computeInvoiceStatus(invoiceTotal, totalByPeriod[keyAtual]);
    expect(jaPago).toBeCloseTo(1300, 2);
    expect(faltam).toBeCloseTo(653.5, 2);
    expect(badge).toBe("Parcial");
  });

  it("soma múltiplos pagamentos parciais no mesmo período (R$ 800 + R$ 500)", () => {
    const payments: Payment[] = [
      { card_id: portoBank.id, amount: 800, paid_at: new Date(2026, 5, 12, 10).toISOString() },
      { card_id: portoBank.id, amount: 500, paid_at: new Date(2026, 5, 20, 10).toISOString() },
    ];
    const { totalByPeriod, detailedByPeriod } = buildPaymentsByPeriod(portoBank, payments);

    expect(detailedByPeriod[keyAtual]).toHaveLength(2);
    const { jaPago, faltam, badge } = computeInvoiceStatus(invoiceTotal, totalByPeriod[keyAtual]);
    expect(jaPago).toBeCloseTo(1300, 2);
    expect(faltam).toBeCloseTo(653.5, 2);
    expect(badge).toBe("Parcial");
  });

  it("pagamento que quita totalmente a fatura → badge Total e FALTAM 0", () => {
    const payments: Payment[] = [
      { card_id: portoBank.id, amount: 1953.5, paid_at: new Date(2026, 5, 15, 10).toISOString() },
    ];
    const { totalByPeriod } = buildPaymentsByPeriod(portoBank, payments);
    const { jaPago, faltam, badge } = computeInvoiceStatus(invoiceTotal, totalByPeriod[keyAtual]);
    expect(jaPago).toBeCloseTo(1953.5, 2);
    expect(faltam).toBe(0);
    expect(badge).toBe("Total");
  });

  it("FALTAM nunca fica negativo quando o pagamento excede o total da fatura", () => {
    const { faltam, badge } = computeInvoiceStatus(invoiceTotal, 2500);
    expect(faltam).toBe(0);
    expect(badge).toBe("Total");
  });

  it("sem pagamentos: JÁ PAGO 0, FALTAM = total da fatura, sem badge", () => {
    const { jaPago, faltam, badge } = computeInvoiceStatus(invoiceTotal, 0);
    expect(jaPago).toBe(0);
    expect(faltam).toBeCloseTo(invoiceTotal, 2);
    expect(badge).toBeNull();
  });

  it("pagamento entre fechamento e vencimento (05/06) credita à fatura que acabou de fechar (key 03/06)", () => {
    // 05/06/2026: fechou em 03/06 e vence em 10/06. Pela lógica de getCycleDates,
    // currentClose permanece 03/06, portanto o pagamento é atribuído ao período
    // cuja endDate = 03/06 (a fatura recém-fechada). NÃO entra na "Atual" (03/07).
    const keyRecemFechada = "2026-06-03";
    const payments: Payment[] = [
      { card_id: portoBank.id, amount: 1300, paid_at: new Date(2026, 5, 5, 10).toISOString() },
    ];
    const { totalByPeriod } = buildPaymentsByPeriod(portoBank, payments);

    expect(totalByPeriod[keyRecemFechada]).toBeCloseTo(1300, 2);
    expect(totalByPeriod[keyAtual]).toBeUndefined();

    const { jaPago, faltam } = computeInvoiceStatus(invoiceTotal, totalByPeriod[keyAtual] || 0);
    expect(jaPago).toBe(0);
    expect(faltam).toBeCloseTo(invoiceTotal, 2);
  });
});
