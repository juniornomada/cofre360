import { describe, expect, it } from "vitest";
import {
  computeCardConsistency,
  computeMonthlyCategoryTotals,
  computeMonthlyFinancialSummary,
  type FinancialCard,
  type FinancialTransaction,
} from "@/lib/financial-engine";

const cards: FinancialCard[] = [
  { id: "porto", name: "Porto Bank", closing_day: 3, due_day: 10 },
];

const tx = (partial: Partial<FinancialTransaction> & Pick<FinancialTransaction, "id" | "amount">): FinancialTransaction => ({
  name: partial.id,
  category: "Alimentação > Outros",
  date: "2026-09-10",
  transaction_date: partial.date || "2026-09-10",
  type: "expense",
  is_visible: true,
  created_at: "2026-09-10T12:00:00Z",
  ...partial,
});

describe("financial engine invariants", () => {
  it("excludes transfers, card payments and adjustments from economic totals", () => {
    const rows: FinancialTransaction[] = [
      tx({ id: "expense", amount: 100 }),
      tx({ id: "transfer", amount: 500, category: "Transferências > Outros", transaction_kind: "transfer" }),
      tx({ id: "payment", amount: 300, category: "Pagamento de Cartão", transaction_kind: "card_payment" }),
      tx({ id: "adjustment", amount: 80, category: "Ajustes > Saldo", transaction_kind: "adjustment" }),
      tx({ id: "income", amount: 200, type: "income", category: "Receita > Salário", transaction_kind: "income" }),
    ];
    expect(computeMonthlyFinancialSummary(rows, cards, "2026-09")).toMatchObject({ income: 200, expense: 100, result: 100 });
  });

  it("treats confirmed refunds as an expense reduction and never as revenue", () => {
    const rows: FinancialTransaction[] = [
      tx({ id: "expense", amount: 100 }),
      tx({ id: "refund", amount: 25, type: "income", category: "Receita > Reembolso", transaction_kind: "refund" }),
    ];
    expect(computeMonthlyFinancialSummary(rows, cards, "2026-09")).toMatchObject({ income: 0, expense: 75, refunds: 25 });
  });

  it("puts a card purchase on the closing day into the next invoice month", () => {
    const rows: FinancialTransaction[] = [
      tx({ id: "card", amount: 90, date: "2026-09-03", transaction_date: "2026-09-03", card: "Porto Bank", card_id: "porto" }),
    ];
    expect(computeMonthlyFinancialSummary(rows, cards, "2026-09").expense).toBe(0);
    expect(computeMonthlyFinancialSummary(rows, cards, "2026-10").expense).toBe(90);
  });

  it("counts an installment purchase once by purchase date and full economic value", () => {
    const rows: FinancialTransaction[] = [
      tx({
        id: "p1", amount: 100, card: "Porto Bank", card_id: "porto",
        category: "Compras > Online", date: "2026-09-10", transaction_date: "2026-09-10", purchase_date: "2026-08-10",
        installment_group_id: "g1", installment_number: 1, total_installments: 3, installment_source_amount: 300,
      }),
      tx({
        id: "p2", amount: 100, card: "Porto Bank", card_id: "porto",
        category: "Compras > Online", date: "2026-10-10", transaction_date: "2026-10-10", purchase_date: "2026-08-10",
        installment_group_id: "g1", installment_number: 2, total_installments: 3, installment_source_amount: 300,
      }),
      tx({
        id: "p3", amount: 100, card: "Porto Bank", card_id: "porto",
        category: "Compras > Online", date: "2026-11-10", transaction_date: "2026-11-10", purchase_date: "2026-08-10",
        installment_group_id: "g1", installment_number: 3, total_installments: 3, installment_source_amount: 300,
      }),
    ];
    expect(computeMonthlyCategoryTotals(rows, "2026-08")).toEqual([{ category: "Compras", amount: 300 }]);
    expect(computeMonthlyCategoryTotals(rows, "2026-09")).toEqual([]);
  });

  it("keeps the card sum equal to the card component of DESPESAS", () => {
    const rows: FinancialTransaction[] = [
      tx({ id: "card-expense", amount: 140, card: "Porto Bank", card_id: "porto", date: "2026-09-02", transaction_date: "2026-09-02" }),
      tx({ id: "card-refund", amount: 20, card: "Porto Bank", card_id: "porto", date: "2026-09-02", transaction_date: "2026-09-02", type: "income", category: "Receita > Reembolso", transaction_kind: "refund" }),
      tx({ id: "account-expense", amount: 50, bank_account_id: "bb" }),
    ];
    const check = computeCardConsistency(rows, cards, "2026-09");
    expect(check.cardsTotal).toBe(120);
    expect(check.expenseCardComponent).toBe(120);
    expect(check.delta).toBe(0);
    expect(check.isConsistent).toBe(true);
  });
});
