import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseTxDate, groupByBillingCycle, getCycleDates, type CardTransaction } from "../invoice-utils";

/**
 * Freezes the wall clock at the year rollover (02 Jan 2027, 03:15 local) and
 * ensures that card transactions whose textual `date` is "DD mmm" (no year)
 * but whose `created_at` carries the real year always land in the same
 * billing cycle they would have landed in if `date` were a full ISO string.
 *
 * This is the regression the previous fix addressed on the Home page: when
 * `created_at` was clobbered with the textual date, `parseTxDate` fell back
 * to `new Date().getFullYear()` (2027 in this scenario) and December
 * transactions were misclassified into the January cycle.
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
    // Clock frozen a few days into the next calendar year, AFTER the closing
    // day of the previous cycle (10 Dec 2026 → due 20 Jan 2027).
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

  it("December 2026 transactions land in the Jan/2027-due cycle regardless of textual vs ISO date", () => {
    const referenceForDecCycle = new Date(2026, 11, 15); // any date inside Dec/2026
    const cycle = getCycleDates(referenceForDecCycle, CLOSING_DAY, DUE_DAY);
    const expectedKey = cycle.currentClose.toISOString().split("T")[0];
    // Sanity: the cycle whose reference is mid-December must be due in Jan/2027.
    expect(cycle.currentDue.getFullYear()).toBe(2027);
    expect(cycle.currentDue.getMonth()).toBe(0);

    const textual = groupByBillingCycle(
      [mkTx("txt", "28 dez", "2026-12-28T14:00:00Z")],
      CLOSING_DAY,
      DUE_DAY,
      referenceForDecCycle,
    );
    const iso = groupByBillingCycle(
      [mkTx("iso", "2026-12-28", "2026-12-28T14:00:00Z")],
      CLOSING_DAY,
      DUE_DAY,
      referenceForDecCycle,
    );

    const findFor = (periods: typeof textual, id: string) =>
      periods.find((p) => p.transactions.some((t) => t.id === id));

    const pt = findFor(textual, "txt");
    const pi = findFor(iso, "iso");
    expect(pt, "textual date must be assigned to a cycle").toBeDefined();
    expect(pi, "iso date must be assigned to a cycle").toBeDefined();
    expect(pt!.key).toBe(pi!.key);
    // And that cycle is precisely the Dec/2026 → Jan/2027-due one.
    expect(pt!.key.startsWith(expectedKey.slice(0, 7))).toBe(true);
    expect(pt!.dueDate.getFullYear()).toBe(2027);
    expect(pt!.dueDate.getMonth()).toBe(0);
  });

  it("January 2027 transactions land in the Feb/2027-due cycle", () => {
    const referenceForJanCycle = new Date(2027, 0, 15);
    const janCycle = getCycleDates(referenceForJanCycle, CLOSING_DAY, DUE_DAY);
    expect(janCycle.currentDue.getFullYear()).toBe(2027);
    expect(janCycle.currentDue.getMonth()).toBe(1); // Fev

    const periods = groupByBillingCycle(
      [mkTx("a", "05 jan", "2027-01-05T10:00:00Z")],
      CLOSING_DAY,
      DUE_DAY,
      referenceForJanCycle,
    );
    const found = periods.find((p) => p.transactions.some((t) => t.id === "a"));
    expect(found).toBeDefined();
    expect(found!.dueDate.getMonth()).toBe(1);
    expect(found!.dueDate.getFullYear()).toBe(2027);
  });

  it("mixed cycle: Dec/2026 and Jan/2027 transactions are placed in different cycles", () => {
    // Reference in Jan so both the "previous" (Dec-due-Jan) and "current"
    // (Jan-due-Fev) cycles are materialised by groupByBillingCycle.
    const reference = new Date(2027, 0, 15);
    const periods = groupByBillingCycle(
      [
        mkTx("dec", "28 dez", "2026-12-28T00:00:00Z"),
        mkTx("jan", "05 jan", "2027-01-05T00:00:00Z"),
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
    expect(decPeriod!.dueDate.getMonth()).toBe(0); // due Jan
    expect(janPeriod!.dueDate.getMonth()).toBe(1); // due Fev
  });

  it("regression: overwriting created_at with the textual date drifts December into the frozen year (2027)", () => {
    // Simulates the pre-fix state: `created_at` was replaced by "28 dez".
    const buggy = parseTxDate("28 dez", "28 dez");
    const fixed = parseTxDate("28 dez", "2026-12-28T00:00:00Z");
    expect(buggy.getFullYear()).toBe(2027); // wrong — frozen "now" year
    expect(fixed.getFullYear()).toBe(2026); // correct

    // And when grouped, the buggy transaction is pushed one full year forward,
    // no longer sharing a cycle with the ISO-dated equivalent.
    const reference = new Date(2027, 0, 15);
    const buggyPeriods = groupByBillingCycle(
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
    const kBuggy = buggyPeriods.find((p) => p.transactions.length > 0)?.key ?? null;
    const kFixed = fixedPeriods.find((p) => p.transactions.length > 0)?.key ?? null;
    expect(kBuggy).not.toBe(kFixed);
  });
});
