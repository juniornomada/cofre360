import { describe, expect, it } from "vitest";
import { runReconciliation } from "./engine";
import type { ReconciliationInput } from "./types";

function baseInput(): ReconciliationInput {
  return {
    bankAccounts: [
      { id: "acc-a", name: "Conta A", opening_balance: 0 },
      { id: "acc-b", name: "Conta B", opening_balance: 0 },
    ],
    cards: [],
    cardPayments: [],
    cardRefunds: [],
    budgets: [],
    rules: [],
    canonicalFacts: [
      {
        month: "2026-09",
        income: 0,
        expense: 0,
        cardExpenseComponent: 0,
        categories: [],
        cards: [],
      },
    ],
    transactions: [],
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
  };
}

describe("automatic reconciliation", () => {
  it("runs automatic checks even when there are no user rules", () => {
    const result = runReconciliation(baseInput());
    expect(result.verification_version).toBe(2);
    expect(result.checks.length).toBeGreaterThanOrEqual(5);
    expect(result.divergences).toEqual([]);
  });

  it("detects an internal transfer with only one side", () => {
    const input = baseInput();
    input.transactions.push({
      id: "transfer-out",
      date: "2026-09-10",
      amount: 10,
      type: "expense",
      transaction_kind: "transfer",
      bank_account_id: "acc-a",
      is_visible: true,
    });

    const result = runReconciliation(input);
    expect(result.divergences.some((d) => d.check_type === "transfer" && d.entity_label.includes("sem par"))).toBe(true);
  });

  it("accepts a balanced transfer pair", () => {
    const input = baseInput();
    input.transactions.push(
      {
        id: "transfer-out",
        date: "2026-09-10",
        amount: 10,
        type: "expense",
        transaction_kind: "transfer",
        bank_account_id: "acc-a",
        is_visible: true,
      },
      {
        id: "transfer-in",
        date: "2026-09-10",
        amount: 10,
        type: "income",
        transaction_kind: "transfer",
        bank_account_id: "acc-b",
        is_visible: true,
      },
    );

    const result = runReconciliation(input);
    expect(result.divergences.filter((d) => d.check_type === "transfer")).toEqual([]);
  });

  it("detects a missing installment", () => {
    const input = baseInput();
    input.transactions.push(
      {
        id: "p1",
        date: "2026-09-01",
        purchase_date: "2026-09-01",
        amount: 50,
        type: "expense",
        transaction_kind: "expense",
        installment_group_id: "group-1",
        installment_number: 1,
        total_installments: 3,
        installment_source_amount: 150,
        is_visible: true,
      },
      {
        id: "p3",
        date: "2026-11-01",
        purchase_date: "2026-09-01",
        amount: 50,
        type: "expense",
        transaction_kind: "expense",
        installment_group_id: "group-1",
        installment_number: 3,
        total_installments: 3,
        installment_source_amount: 150,
        is_visible: true,
      },
    );

    const result = runReconciliation(input);
    expect(result.divergences.some((d) => d.check_type === "installment" && d.entity_label.includes("faltam 2"))).toBe(true);
  });
});
