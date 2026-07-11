import { describe, it, expect } from "vitest";
import { runReconciliation } from "../engine";
import { withinTolerance } from "../types";
import type { ReconciliationInput, ReconciliationRule } from "../types";

const baseInput = (over: Partial<ReconciliationInput> = {}): ReconciliationInput => ({
  bankAccounts: [],
  transactions: [],
  cards: [],
  cardPayments: [],
  budgets: [],
  rules: [],
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
  ...over,
});

const rule = (o: Partial<ReconciliationRule>): ReconciliationRule => ({
  id: "r1",
  user_id: "u1",
  name: "test",
  check_type: "card",
  rule_kind: "zero",
  tolerance_kind: "abs",
  tolerance_value: 0,
  target_ids: [],
  enabled: true,
  ...o,
});

describe("withinTolerance", () => {
  it("abs: |delta| <= tolerance", () => {
    expect(withinTolerance(0.005, 100, "abs", 0.01)).toBe(true);
    expect(withinTolerance(0.02, 100, "abs", 0.01)).toBe(false);
  });
  it("pct: |delta| <= |expected|*pct/100", () => {
    expect(withinTolerance(1, 100, "pct", 1)).toBe(true); // 1 == 1%
    expect(withinTolerance(2, 100, "pct", 1)).toBe(false);
  });
  it("pct with expected=0 falls back to abs", () => {
    expect(withinTolerance(0.5, 0, "pct", 1)).toBe(true);
    expect(withinTolerance(2, 0, "pct", 1)).toBe(false);
  });
});

describe("runReconciliation - cards", () => {
  it("detects cards.used != 0 with zero rule", () => {
    const r = runReconciliation(
      baseInput({
        cards: [{ id: "c1", name: "VISA", used: 500, closing_day: 20, due_day: 27 }],
        rules: [rule({ id: "r1", check_type: "card", rule_kind: "zero", target_ids: ["c1"] })],
      })
    );
    expect(r.divergences).toHaveLength(1);
    expect(r.divergences[0].delta).toBe(500);
    expect(r.counts_by_check.card).toBe(1);
  });
  it("passes when cards.used == 0", () => {
    const r = runReconciliation(
      baseInput({
        cards: [{ id: "c1", name: "VISA", used: 0, closing_day: 20, due_day: 27 }],
        rules: [rule({ check_type: "card", rule_kind: "zero", target_ids: ["c1"] })],
      })
    );
    expect(r.divergences).toHaveLength(0);
  });
  it("equality: cards.used vs derived (spent - paid)", () => {
    const r = runReconciliation(
      baseInput({
        cards: [{ id: "c1", name: "VISA", used: 100, closing_day: 20, due_day: 27 }],
        transactions: [
          { id: "t1", date: "2026-07-10", amount: 300, type: "expense", card: "VISA" },
        ],
        cardPayments: [{ id: "p1", card_id: "c1", amount: 200, date: "2026-07-15" }],
        rules: [rule({ check_type: "card", rule_kind: "equality", target_ids: ["c1"] })],
      })
    );
    // derived = 300 - 200 = 100; used = 100 → sem divergência
    expect(r.divergences).toHaveLength(0);
  });
});

describe("runReconciliation - invoices", () => {
  it("flags month where Σ tx ≠ Σ pagamentos", () => {
    const r = runReconciliation(
      baseInput({
        cards: [{ id: "c1", name: "VISA", used: 0, closing_day: 20, due_day: 27 }],
        transactions: [{ id: "t1", date: "2026-07-05", amount: 1000, type: "expense", card: "VISA" }],
        cardPayments: [{ id: "p1", card_id: "c1", amount: 800, date: "2026-07-20" }],
        rules: [rule({ check_type: "invoice", rule_kind: "zero", target_ids: ["c1"] })],
      })
    );
    expect(r.divergences).toHaveLength(1);
    expect(r.divergences[0].actual).toBe(200);
  });
});

describe("runReconciliation - budgets", () => {
  it("flags overspend beyond pct tolerance", () => {
    const r = runReconciliation(
      baseInput({
        budgets: [
          { id: "b1", category: "food", amount: 500, period_start: "2026-07-01", period_end: "2026-07-31" },
        ],
        transactions: [
          { id: "t1", date: "2026-07-10", amount: 600, type: "expense", category: "food" },
        ],
        rules: [
          rule({ check_type: "budget", rule_kind: "equality", tolerance_kind: "pct", tolerance_value: 10, target_ids: ["b1"] }),
        ],
      })
    );
    expect(r.divergences).toHaveLength(1);
    expect(r.divergences[0].expected).toBe(500);
    expect(r.divergences[0].actual).toBe(600);
  });
  it("within pct tolerance -> no divergence", () => {
    const r = runReconciliation(
      baseInput({
        budgets: [
          { id: "b1", category: "food", amount: 500, period_start: "2026-07-01", period_end: "2026-07-31" },
        ],
        transactions: [
          { id: "t1", date: "2026-07-10", amount: 505, type: "expense", category: "food" },
        ],
        rules: [
          rule({ check_type: "budget", rule_kind: "equality", tolerance_kind: "pct", tolerance_value: 5, target_ids: ["b1"] }),
        ],
      })
    );
    expect(r.divergences).toHaveLength(0);
  });
});

describe("runReconciliation - no rules", () => {
  it("returns empty when no rules configured", () => {
    const r = runReconciliation(
      baseInput({
        cards: [{ id: "c1", name: "VISA", used: 9999, closing_day: 20, due_day: 27 }],
      })
    );
    expect(r.divergences).toHaveLength(0);
    expect(r.total_divergence_amount).toBe(0);
  });
});
