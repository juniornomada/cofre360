import { describe, expect, it } from "vitest";
import {
  ANTICIPATION_DISCOUNT_CATEGORY,
  ANTICIPATION_DISCOUNT_PREFIX,
  discountCreditName,
  discountDateForInvoice,
  isAnticipationDiscountCredit,
  parseBrazilianDiscountCents,
  validateAnticipationDiscount,
} from "@/lib/card-anticipation-discount";
import { groupByBillingCycle, type CardTransaction } from "@/lib/invoice-utils";

const p = {
  startDate: new Date(2026, 9, 3),
  endDate: new Date(2026, 10, 3),
};

describe("Descontos de antecipação nas faturas de cartão", () => {
  it("interpreta valores brasileiros em centavos sem arredondamentos silenciosos", () => {
    expect(parseBrazilianDiscountCents("R$ 12,34")).toBe(1234);
    expect(parseBrazilianDiscountCents("1.234,56")).toBe(123456);
    expect(parseBrazilianDiscountCents("12.34")).toBe(1234);
    expect(parseBrazilianDiscountCents("10")).toBe(1000);
    expect(parseBrazilianDiscountCents("0")).toBeNull();
    expect(parseBrazilianDiscountCents("12,345")).toBeNull();
    expect(parseBrazilianDiscountCents("-15")).toBeNull();
    expect(parseBrazilianDiscountCents("abc")).toBeNull();
  });

  it("impede desconto superior à fatura, valor inválido ou fatura com pagamento", () => {
    expect(validateAnticipationDiscount(100, 78807, 0)).toBeNull();
    expect(validateAnticipationDiscount(80000, 78807, 0)).toMatch(/superar/);
    expect(validateAnticipationDiscount(100, 78807, 100)).toMatch(/pagamento/);
    expect(validateAnticipationDiscount(100, 0, 0)).toMatch(/saldo/);
    expect(validateAnticipationDiscount(null, 78807, 0)).toMatch(/válido/);
  });

  it("lança a data do crédito dentro da fatura sem modificar a data da compra", () => {
    expect(discountDateForInvoice(p, new Date(2026, 9, 28))).toBe("2026-10-28");
    expect(discountDateForInvoice(p, new Date(2026, 8, 20))).toBe("2026-10-04");
    expect(() => discountDateForInvoice(p, new Date(2026, 10, 3))).toThrow(/fechada/);
  });

  it("crédito de antecipação reduz a fatura e não duplica parcelas existentes", () => {
    const expenses: CardTransaction[] = [
      {
        id: "p2", name: "Coxins do Creta", icon: "🔧", category: "Transporte > Manutenção",
        date: "2026-10-28", purchase_date: "2026-10-08",
        created_at: "2026-10-08T12:00:00Z", amount: 215.12, type: "expense",
        card: "Porto Bank", installment_group_id: "purchase-1", installment_number: 2, total_installments: 10,
      },
      {
        id: "p3", name: "Coxins do Creta", icon: "🔧", category: "Transporte > Manutenção",
        date: "2026-10-28", purchase_date: "2026-10-08",
        created_at: "2026-10-08T12:00:00Z", amount: 215.12, type: "expense",
        card: "Porto Bank", installment_group_id: "purchase-1", installment_number: 3, total_installments: 10,
      },
    ];
    const credit: CardTransaction = {
      id: "discount-1", name: discountCreditName("Coxins do Creta"), icon: "🏷️",
      category: ANTICIPATION_DISCOUNT_CATEGORY, date: "2026-10-28",
      purchase_date: null, created_at: "2026-10-28T12:00:00Z",
      amount: 15.40, type: "income", card: "Porto Bank",
      installment_group_id: null, installment_number: null, total_installments: null,
    };
    expect(isAnticipationDiscountCredit(credit)).toBe(true);
    expect(credit.name).toBe(`${ANTICIPATION_DISCOUNT_PREFIX} — Coxins do Creta`);
    expect(expenses.every((row) => row.type === "expense" && row.installment_group_id === "purchase-1")).toBe(true);
    const without = groupByBillingCycle(expenses, 3, 10, new Date(2026, 9, 15));
    const withCredit = groupByBillingCycle([...expenses, credit], 3, 10, new Date(2026, 9, 15));
    const december = (p: typeof withCredit) => p.find((row) => row.endDate.getFullYear() === 2026 && row.endDate.getMonth() === 10)!;
    expect(december(withCredit).total).toBeCloseTo(december(without).total - 15.4);
    expect(expenses[0].amount).toBe(215.12);
    expect(credit.installment_group_id).toBeNull();
  });

  it("distingue desconto de antecipação de pagamentos e receitas comuns", () => {
    expect(isAnticipationDiscountCredit({ type: "income", category: "Salário", name: "Desconto de antecipação", card: "Porto Bank" })).toBe(false);
    expect(isAnticipationDiscountCredit({ type: "income", category: ANTICIPATION_DISCOUNT_CATEGORY, name: "Devolução", card: "Porto Bank" })).toBe(false);
    expect(isAnticipationDiscountCredit({ type: "income", category: ANTICIPATION_DISCOUNT_CATEGORY, name: ANTICIPATION_DISCOUNT_PREFIX, card: null })).toBe(false);
  });
});
