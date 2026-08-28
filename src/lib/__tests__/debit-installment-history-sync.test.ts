import { describe, expect, it } from "vitest";
import { inferDebitInstallmentContext, type InstallmentHistoryTransaction } from "@/lib/debit-installment-history-sync";

const debit: InstallmentHistoryTransaction = {
  id: "debit-1",
  name: "Notebook",
  category: "Compras > Eletrônicos",
  date: "2026-04-15",
  amount: 500,
  type: "expense",
  card: null,
  bank_account_id: "bank-1",
  installment_group_id: null,
  installment_number: 1,
  total_installments: 1,
};

const creditRows: InstallmentHistoryTransaction[] = [
  {
    id: "credit-1",
    name: "Notebook (1/4)",
    category: "Compras > Eletrônicos",
    date: "2026-03-15",
    amount: 500,
    type: "expense",
    card: "Nubank",
    bank_account_id: null,
    installment_group_id: "group-1",
    installment_number: 1,
    total_installments: 4,
    installment_mode: "divide",
    installment_source_amount: 2000,
  },
  {
    id: "credit-2",
    name: "Notebook (2/4)",
    category: "Compras > Eletrônicos",
    date: "2026-04-15",
    amount: 500,
    type: "expense",
    card: "Nubank",
    bank_account_id: null,
    installment_group_id: "group-1",
    installment_number: 2,
    total_installments: 4,
    installment_mode: "divide",
    installment_source_amount: 2000,
  },
];

describe("inferDebitInstallmentContext", () => {
  it("reuses the nearest credit installment metadata for a matching debit transaction", () => {
    expect(inferDebitInstallmentContext(debit, creditRows)).toEqual({
      installment_number: 2,
      total_installments: 4,
      installment_mode: "divide",
      installment_source_amount: 2000,
      source_group_id: "group-1",
    });
  });

  it("does not infer when more than one credit group matches", () => {
    const ambiguous = [
      ...creditRows,
      { ...creditRows[0], id: "credit-other", installment_group_id: "group-2" },
    ];
    expect(inferDebitInstallmentContext(debit, ambiguous)).toBeNull();
  });

  it("does not infer for a different amount", () => {
    expect(inferDebitInstallmentContext({ ...debit, amount: 750 }, creditRows)).toBeNull();
  });

  it("does not infer for credit transactions", () => {
    expect(inferDebitInstallmentContext({ ...debit, card: "Nubank", bank_account_id: null }, creditRows)).toBeNull();
  });
});
