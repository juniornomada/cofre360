/**
 * parseTxDate — invalid inputs near date boundaries (nonexistent days like
 * 31/11, day/month overflows, malformed 2-digit years) must:
 *   B1. Fall back deterministically to `created_at` (same timestamp every call).
 *   B2. Produce a billing cycle EXACTLY equal to what `getCycleDates` yields
 *       for `created_at` alone — i.e., the invariant "invalid date → cycle of
 *       fallback" holds for every closing/due-day combination we exercise.
 *   B3. Never leak into a neighboring cycle via silent Date coercion
 *       (`new Date(y, 10, 31)` rolling to Dec 1, etc.).
 *
 * This complements parseTxDate-invalid-inputs.test.ts by pinning the
 * fallback behavior against `getCycleDates` directly, across several
 * closing/due configurations and fallback dates that sit near cycle edges.
 */
import { describe, it, expect } from "vitest";
import { parseTxDate, getCycleDates, groupByBillingCycle, type CardTransaction } from "@/lib/invoice-utils";

// Fallbacks intentionally placed near cycle edges (before/after closing).
const FALLBACKS = [
  "2026-01-02T12:00:00Z", // early Jan, near year rollover
  "2026-07-15T10:00:00Z", // mid-month
  "2026-12-31T23:00:00Z", // last day of year
  "2024-02-29T09:00:00Z", // leap day itself
  "2026-03-05T08:00:00Z", // just after a typical closing_day=3
] as const;

const CYCLES: Array<{ closing: number; due: number }> = [
  { closing: 3, due: 10 },
  { closing: 15, due: 25 },
  { closing: 28, due: 5 },
  { closing: 1, due: 10 },
];

// Invalid boundary inputs: nonexistent days, month overflow, day overflow,
// malformed 2-digit years, and mixed noisy variants.
const INVALID_INPUTS = [
  // Nonexistent day-of-month
  "31/11", "31/04", "31/06", "31/09",
  "31/11/2026", "31-04-2026", "2026-11-31", "2026-04-31",
  "30/02", "30/02/2025", "29/02/2025", "29/02/23",
  // Day / month out of range
  "00/10", "32/01", "40/07", "99/12",
  "10/00", "10/13", "10/99",
  "00/10/2026", "32/01/26", "10/13/2026", "10/00/26",
  // Textual month with invalid day
  "31 nov", "31 abr", "00 out", "32 jan", "30 fev",
  // 2-digit year on an otherwise invalid date
  "31/11/26", "31/04/26", "30/02/26", "32/01/99", "00/10/00",
];

describe("parseTxDate — invalid near-boundary inputs are deterministic & cycle-consistent", () => {
  describe("B1 — deterministic fallback (idempotent across repeated calls)", () => {
    it.each(FALLBACKS)("fallback=%s", (fb) => {
      const fbTs = new Date(fb).getTime();
      for (const input of INVALID_INPUTS) {
        const a = parseTxDate(input, fb).getTime();
        const b = parseTxDate(input, fb).getTime();
        expect({ input, a, b, fbTs }).toEqual({ input, a: fbTs, b: fbTs, fbTs });
      }
    });
  });

  describe("B2 — invalid input yields the same cycle as fallback alone", () => {
    for (const fb of FALLBACKS) {
      for (const { closing, due } of CYCLES) {
        it(`fb=${fb} closing=${closing} due=${due}`, () => {
          const fbDate = new Date(fb);
          const expected = getCycleDates(fbDate, closing, due);
          for (const input of INVALID_INPUTS) {
            const parsed = parseTxDate(input, fb);
            const got = getCycleDates(parsed, closing, due);
            expect({
              input,
              currentClose: got.currentClose.getTime(),
              currentDue: got.currentDue.getTime(),
              prevClose: got.prevClose.getTime(),
            }).toEqual({
              input,
              currentClose: expected.currentClose.getTime(),
              currentDue: expected.currentDue.getTime(),
              prevClose: expected.prevClose.getTime(),
            });
          }
        });
      }
    }
  });

  describe("B3 — invalid tx groups into the same billing cycle as an empty-date tx", () => {
    it.each(FALLBACKS)("fallback=%s", (fb) => {
      const ref = new Date(fb);
      const mkTx = (id: string, date: string): CardTransaction => ({
        id, name: "t", icon: null, category: "c", date, amount: 100,
        type: "expense", created_at: fb,
        total_installments: null, installment_number: null, installment_group_id: null,
      });
      for (const { closing, due } of CYCLES) {
        const baselineGroups = groupByBillingCycle([mkTx("baseline", "")], closing, due, ref);
        const baselineKey = baselineGroups.find((g) => g.transactions.length > 0)?.key;

        for (const input of INVALID_INPUTS) {
          const groups = groupByBillingCycle([mkTx(`t-${input}`, input)], closing, due, ref);
          const key = groups.find((g) => g.transactions.length > 0)?.key;
          expect({ input, key }).toEqual({ input, key: baselineKey });
        }
      }
    });
  });
});
