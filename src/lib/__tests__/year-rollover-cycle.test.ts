import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseTxDate, groupByBillingCycle, type CardTransaction } from "../invoice-utils";

/**
 * Freezes the wall clock at the year rollover (02 Jan 2027) and ensures that
 * card transactions whose textual `date` is "DD mmm" (no year) but whose
 * `created_at` carries the real ISO year always land in the same billing
 * cycle they would land in if `date` were a full ISO string.
 *
 * Regression under test: on the Home page `created_at` used to be clobbered
 * with the textual date, so `parseTxDate` fell back to `new Date().getFullYear()`
 * (i.e. 2027 in this scenario) and December transactions were misclassified
 * one full year forward.
 */
describe("year rollover — parseTxDate + groupByBillingCycle", () => {
  const CLOSING_DAY = 10;
  const DUE_DAY = 20;

  const mkTx = (id: string, date: string, created_at: string): CardTransaction => ({
    id,
    name: `Tx ${id}`,
    icon: null,
    category: "x",
    date,
    amount: 100,
    type: "expense",
    created_at,
    total_installments: null,
    installment_number: null,
    installment_group_id: null,
  });

  beforeEach(() => {
    // Clock frozen shortly into the next calendar year.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 0, 2, 3, 15, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Date.now() reflects the frozen year", () => {
    expect(new Date().getFullYear()).toBe(2027);
    expect(new Date().getMonth()).toBe(0);
  });

  it('parseTxDate("28 dez", created_at 2026-12-28) → 28 Dec 2026, not 2027', () => {
    const d = parseTxDate("28 dez", "2026-12-28T14:00:00Z");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(28);
  });

  it("textual and ISO variants of the same December date land in the exact same cycle key", () => {
    // Reference at the moment the UI would be showing the Dec/2026 view.
    const reference = new Date(2026, 11, 15);

    const textual = groupByBillingCycle(
      [mkTx("txt", "28 dez", "2026-12-28T14:00:00Z")],
      CLOSING_DAY,
      DUE_DAY,
      reference,
    );
    const iso = groupByBillingCycle(
      [mkTx("iso", "2026-12-28", "2026-12-28T14:00:00Z")],
      CLOSING_DAY,
      DUE_DAY,
      reference,
    );

    const findFor = (periods: typeof textual, id: string) =>
      periods.find((p) => p.transactions.some((t) => t.id === id));

    const pt = findFor(textual, "txt");
    const pi = findFor(iso, "iso");
    expect(pt, "textual date must be assigned to a cycle").toBeDefined();
    expect(pi, "iso date must be assigned to a cycle").toBeDefined();
    expect(pt!.key).toBe(pi!.key);
    // With closing=10, due=20, a 28 Dec tx is in the cycle [Dec 10, Jan 10)
    // which is due on 20 Jan 2027.
    expect(pt!.dueDate.getFullYear()).toBe(2027);
    expect(pt!.dueDate.getMonth()).toBe(0);
    expect(pt!.dueDate.getDate()).toBe(20);
  });

  it("mixed Dec/2026 and Jan/2027 transactions are placed in different, correctly-dated cycles", () => {
    // Reference near the frozen "today" so both cycles are materialised.
    const reference = new Date(2027, 0, 15);
    const periods = groupByBillingCycle(
      [
        mkTx("dec", "28 dez", "2026-12-28T00:00:00Z"),
        mkTx("jan", "15 jan", "2027-01-15T00:00:00Z"),
      ],
      CLOSING_DAY,
      DUE_DAY,
      reference,
    );

    const decPeriod = periods.find((p) => p.transactions.some((t) => t.id === "dec"));
    const janPeriod = periods.find((p) => p.transactions.some((t) => t.id === "jan"));
    expect(decPeriod).toBeDefined();
    expect(janPeriod).toBeDefined();
    expect(decPeriod!.key).not.toBe(janPeriod!.key);
    // 28 Dec → due 20 Jan 2027
    expect(decPeriod!.dueDate.getFullYear()).toBe(2027);
    expect(decPeriod!.dueDate.getMonth()).toBe(0);
    // 15 Jan → due 20 Feb 2027
    expect(janPeriod!.dueDate.getFullYear()).toBe(2027);
    expect(janPeriod!.dueDate.getMonth()).toBe(1);
  });

  it("regression: even when created_at was clobbered with the textual date, the Dec↔Jan heuristic keeps December txs in December", () => {
    // Frozen clock: 02 Jan 2027. "28 dez" with an invalid fallback used to
    // resolve to Dec 2027. The year-boundary heuristic in parseTxDate now
    // detects textual "dez" + current calendar month ≤ Feb and rolls the
    // year back by one — matching the ISO-created_at path.
    const clobbered = parseTxDate("28 dez", "28 dez");
    const fixed = parseTxDate("28 dez", "2026-12-28T00:00:00Z");
    expect(clobbered.getFullYear()).toBe(2026);
    expect(fixed.getFullYear()).toBe(2026);

    // And when grouped, both variants now land in the SAME cycle key.
    const reference = new Date(2027, 0, 15);
    const clobberedPeriods = groupByBillingCycle(
      [mkTx("a", "28 dez", "28 dez")],
      CLOSING_DAY,
      DUE_DAY,
      reference,
    );
    const fixedPeriods = groupByBillingCycle(
      [mkTx("a", "28 dez", "2026-12-28T00:00:00Z")],
      CLOSING_DAY,
      DUE_DAY,
      reference,
    );
    const kClobbered = clobberedPeriods.find((p) => p.transactions.length > 0)?.key ?? null;
    const kFixed = fixedPeriods.find((p) => p.transactions.length > 0)?.key ?? null;
    expect(kClobbered).toBe(kFixed);
  });

});
