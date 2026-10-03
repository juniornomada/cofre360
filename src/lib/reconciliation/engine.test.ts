import { describe, expect, it } from "vitest";
import { computeAuditedCardAvailableLimit, runReconciliation } from "./engine";
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

  it("detects an internal gap in an installment sequence", () => {
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

  it("audits available card limit without letting historical payments inflate it", () => {
    const input = baseInput();
    input.periodStart = "2026-10-01";
    input.periodEnd = "2026-10-02";
    input.canonicalFacts = [];
    input.cards.push({
      id: "mp",
      name: "Mercado Pago",
      card_limit: 5000,
      used: 0,
      closing_day: 12,
      due_day: 17,
      created_at: "2026-01-01T12:00:00Z",
    });
    input.transactions.push(
      {
        id: "mp-current",
        date: "2026-10-01",
        amount: 2340.46,
        type: "expense",
        transaction_kind: "expense",
        card: "Mercado Pago",
        card_id: "mp",
        is_visible: true,
      },
      {
        id: "mp-future",
        date: "2026-10-12",
        amount: 2669.90,
        type: "expense",
        transaction_kind: "expense",
        card: "Mercado Pago",
        card_id: "mp",
        is_visible: true,
      },
    );
    input.cardPayments.push(
      {
        id: "old-payment",
        card_id: "mp",
        amount: 2746.25,
        date: "2026-09-10",
        target_period: "2026-09-12",
      },
      {
        id: "current-payment",
        card_id: "mp",
        amount: 15,
        date: "2026-10-02",
        target_period: "2026-10-12",
      },
    );

    const audited = computeAuditedCardAvailableLimit(
      input,
      input.cards[0],
      new Date(2026, 9, 2, 12),
    );
    expect(audited).toBe(4.64);

    const result = runReconciliation(input);
    const cardLimitCheck = result.checks.find((check) =>
      check.label.includes("Limite disponível dos cartões"),
    );
    expect(cardLimitCheck).toEqual(
      expect.objectContaining({ check_type: "card", checked: 1, issues: 0 }),
    );
    expect(
      result.divergences.some((d) => d.entity_label.includes("Limite disponível")),
    ).toBe(false);
  });

  it("keeps the available-limit audit mandatory even with no custom reconciliation rules", () => {
    const input = baseInput();
    input.cards.push({
      id: "porto",
      name: "Porto Bank",
      card_limit: 6000,
      used: 0,
      closing_day: 3,
      due_day: 10,
      created_at: "2026-01-01T12:00:00Z",
    });

    const result = runReconciliation(input);
    expect(
      result.checks.some((check) => check.label.includes("Limite disponível dos cartões")),
    ).toBe(true);
  });

});
