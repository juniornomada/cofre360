/**
 * parseTxDate — invalid inputs must fall back to created_at and never
 * generate a wrong billing-cycle key.
 *
 * The contract:
 *  I1. Day = 00 or Day > 31 in a DD/MM or DD-MM string → fall back to
 *      created_at (no silent Date coercion).
 *  I2. Month = 00 or Month > 12 → fall back.
 *  I3. Day-of-month overflow for the specific month (`31/11`, `31/04`,
 *      `31/06`, `31/09`, `30/02`, `29/02` in a non-leap year) → fall back.
 *      This is the critical case: `new Date(y,10,31)` silently rolls to
 *      Dec 1, which would place the tx in the WRONG billing cycle.
 *  I4. Same rules apply to numeric-with-year (`31/11/2026`, `2026-11-31`)
 *      and to textual month-name inputs (`31 nov`, `31 abr`, `00 out`).
 *  I5. Cycle-key invariant: an invalid textual `date` MUST produce the
 *      same billing cycle as `created_at` alone. In other words the tx
 *      lands in the cycle it would have landed in with `date = ""`.
 *  I6. Boundary sanity: valid inputs (`30/11`, `28/02` non-leap, `29/02`
 *      leap, `31/12`) still resolve correctly — the tightening didn't
 *      overshoot.
 */
import { describe, it, expect } from "vitest";
import { parseTxDate, groupByBillingCycle, type CardTransaction } from "@/lib/invoice-utils";

const FB = "2026-07-15T10:00:00Z";
const FB_TS = new Date(FB).getTime();

const expectFallback = (input: string) =>
  expect({ input, ts: parseTxDate(input, FB).getTime() }).toEqual({ input, ts: FB_TS });

describe("parseTxDate — invalid inputs fall back to created_at", () => {
  // ------------------------------------------------------------------
  // I1: Day 0 / day > 31
  // ------------------------------------------------------------------
  describe("I1 — Day 0 or Day > 31", () => {
    it.each(["00/10", "00-10", "32/01", "32-01", "40/07", "99/12", "00 out", "32 jan", "99 dez"])(
      "%s falls back",
      (input) => expectFallback(input),
    );
  });

  // ------------------------------------------------------------------
  // I2: Month 0 / month > 12
  // ------------------------------------------------------------------
  describe("I2 — Month 0 or Month > 12", () => {
    it.each(["01/00", "01-00", "01/13", "10/13", "10-13", "01/99", "2026-13-01", "2026-00-15"])(
      "%s falls back",
      (input) => expectFallback(input),
    );
  });

  // ------------------------------------------------------------------
  // I3: Day-of-month overflow (the critical wrong-cycle case)
  // ------------------------------------------------------------------
  describe("I3 — day exceeds days-in-month (would silently roll into next month)", () => {
    // Months with 30 days: Apr(4), Jun(6), Sep(9), Nov(11).
    it.each([
      "31/04", "31-04",
      "31/06", "31-06",
      "31/09", "31-09",
      "31/11", "31-11",
      "30/02", "30-02",
      "29/02", // FB year 2026 is non-leap
      "31 abr", "31 jun", "31 set", "31 nov", "30 fev", "29 fev",
      "31 abril", "31 junho", "31 setembro", "31 novembro",
    ])("%s falls back (does not roll into next month)", (input) => expectFallback(input));

    it("regression: '31/11' would previously produce Dec 1 and shift the billing cycle", () => {
      const d = parseTxDate("31/11", FB);
      expect(d.getMonth()).not.toBe(11); // NOT December
      expect(d.getTime()).toBe(FB_TS);
    });
  });

  // ------------------------------------------------------------------
  // I4: Same rules with explicit year and ISO form
  // ------------------------------------------------------------------
  describe("I4 — invalid days with explicit year (DD/MM/YYYY and ISO)", () => {
    it.each([
      "31/11/2026", "31-11-2026", "2026-11-31",
      "31/04/2026", "2026-04-31",
      "30/02/2025", "2025-02-30",
      "29/02/2025", "2025-02-29",           // 2025 non-leap
      "29/02/1900", "1900-02-29",           // 1900 non-leap (century rule)
      "32/01/2026", "00/10/2026",
    ])("%s falls back", (input) => expectFallback(input));

    it("valid ISO 2024-02-29 (leap) still resolves", () => {
      const d = parseTxDate("2024-02-29", "2024-08-15T10:00:00Z");
      expect(d.getFullYear()).toBe(2024);
      expect(d.getMonth()).toBe(1);
      expect(d.getDate()).toBe(29);
    });
  });

  // ------------------------------------------------------------------
  // I5: Cycle-key invariant — invalid date == cycle of created_at
  // ------------------------------------------------------------------
  describe("I5 — invalid date produces the SAME billing cycle as created_at", () => {
    const CLOSING = 10;
    const DUE = 20;
    const REFERENCE = new Date(2026, 6, 15); // 15 Jul 2026

    /** Build a tx pair: one with an invalid `date`, one with `date=""`. */
    const mkTx = (date: string, created_at: string, id: string): CardTransaction => ({
      id, name: "x", icon: null, category: "c", date, amount: 100, type: "expense",
      created_at, total_installments: null, installment_number: null, installment_group_id: null,
    });

    it.each([
      ["31/11",     "2026-07-15T10:00:00Z"],
      ["31/04",     "2026-06-20T10:00:00Z"],
      ["30/02",     "2026-07-05T10:00:00Z"],
      ["00/10",     "2026-07-05T10:00:00Z"],
      ["32/01",     "2026-07-05T10:00:00Z"],
      ["31 nov",    "2026-07-15T10:00:00Z"],
      ["29 fev",    "2026-07-15T10:00:00Z"], // non-leap 2026
      ["2026-13-01","2026-07-15T10:00:00Z"],
    ])("invalid date '%s' + created_at '%s' lands in the same cycle as an empty date", (bad, created_at) => {

      const invalidTx = mkTx(bad, created_at, "bad");
      const emptyTx = mkTx("", created_at, "empty");

      const groupsInvalid = groupByBillingCycle([invalidTx], CLOSING, DUE, REFERENCE);
      const groupsEmpty = groupByBillingCycle([emptyTx], CLOSING, DUE, REFERENCE);

      // Same number of buckets, same keys, same landing bucket.
      expect(groupsInvalid.map((g) => g.key)).toEqual(groupsEmpty.map((g) => g.key));
      const inKey = groupsInvalid.find((g) => g.transactions.some((t) => t.id === "bad"))?.key;
      const emKey = groupsEmpty.find((g) => g.transactions.some((t) => t.id === "empty"))?.key;
      expect(inKey).toBe(emKey);
      expect(inKey).toBeDefined();
    });
  });

  // ------------------------------------------------------------------
  // I6: Sanity — valid boundary inputs still parse correctly
  // ------------------------------------------------------------------
  describe("I6 — valid boundary inputs still resolve (no over-tightening)", () => {
    it("30/11 (last day of November) resolves correctly", () => {
      const d = parseTxDate("30/11", FB);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(10);
      expect(d.getDate()).toBe(30);
    });

    it("28/02 non-leap resolves correctly", () => {
      const d = parseTxDate("28/02", "2025-08-15T10:00:00Z");
      expect(d.getFullYear()).toBe(2025);
      expect(d.getMonth()).toBe(1);
      expect(d.getDate()).toBe(28);
    });

    it("29/02 leap resolves correctly", () => {
      const d = parseTxDate("29/02", "2024-08-15T10:00:00Z");
      expect(d.getFullYear()).toBe(2024);
      expect(d.getMonth()).toBe(1);
      expect(d.getDate()).toBe(29);
    });

    it("31/12 resolves correctly", () => {
      const d = parseTxDate("31/12", FB);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(11);
      expect(d.getDate()).toBe(31);
    });

    it("30/04 (last day of April) resolves correctly", () => {
      const d = parseTxDate("30/04", FB);
      expect(d.getMonth()).toBe(3);
      expect(d.getDate()).toBe(30);
    });
  });
});
