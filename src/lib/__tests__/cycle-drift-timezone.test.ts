/**
 * Cycle-drift tests focused on TZ / cutoff-hour stability.
 *
 * The cycle "periodKey" used by both Home and Cards is:
 *     currentClose.toISOString().split("T")[0]
 * where `currentClose = new Date(year, month, closingDay)` comes from
 * `getCycleDates(referenceDate, closingDay, dueDay)`.
 *
 * The invariant we care about: **within the same calendar month, no matter
 * the hour-of-day of the reference clock nor the hour-of-day of a
 * transaction's date, the derived periodKey and the billing-cycle bucket
 * must not shift.** Otherwise Home and Cards can silently disagree just
 * because one recomputed at 23:59 local vs 00:01 local, or the tx was
 * saved with a fractional time component.
 *
 * These tests exercise:
 *  1. Reference-clock sweep across every day+hour of a target month.
 *  2. Same reference date across a wide range of `closingDay` values.
 *  3. Cross-surface (home vs cards) equality when both derive keys from
 *     the same helper — via `reportCycleSnapshot` with `absolute: 0`.
 *  4. Transaction-date toggles within a month (numeric, ISO, textual,
 *     with/without hour components) map to the same billing period.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getCycleDates,
  groupByBillingCycle,
  parseTxDate,
  type CardTransaction,
} from "../invoice-utils";
import {
  reportCycleSnapshot,
  resetCycleConsistencyCheck,
  enableCycleConsistencyCheck,
  configureCycleTolerance,
} from "../cycle-consistency";

/** periodKey formula used by both `src/routes/index.tsx` and `src/routes/cards.tsx`. */
function periodKeyOf(d: Date): string {
  return d.toISOString().split("T")[0];
}

describe("cycle drift — timezone / cutoff-hour stability", () => {
  beforeEach(() => {
    enableCycleConsistencyCheck(true);
    resetCycleConsistencyCheck();
    configureCycleTolerance({ absolute: 0, percent: 0 });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetCycleConsistencyCheck();
    configureCycleTolerance(null);
  });

  // ------------------------------------------------------------------
  // 1. Sweep the reference clock through every day/hour of the target
  //    month; the periodKey must not shift.
  // ------------------------------------------------------------------
  it("periodKey is identical for every day+hour of the same month (closingDay=10)", () => {
    const closingDay = 10;
    const dueDay = 20;
    // July 2026 has 31 days; sweep hours 0, 6, 12, 18, 23.
    const seen = new Set<string>();
    for (let day = 1; day <= 31; day++) {
      for (const hour of [0, 6, 12, 18, 23]) {
        const ref = new Date(2026, 6 /* July */, day, hour, 30, 0);
        const { currentClose } = getCycleDates(ref, closingDay, dueDay);
        seen.add(periodKeyOf(currentClose));
      }
    }
    expect(seen.size).toBe(1);
  });

  // Repeat for a range of closingDay values including edge months (Feb).
  it.each([
    { closingDay: 1, dueDay: 10, year: 2026, month: 6 /* Jul */ },
    { closingDay: 5, dueDay: 15, year: 2026, month: 6 },
    { closingDay: 10, dueDay: 20, year: 2026, month: 6 },
    { closingDay: 28, dueDay: 5, year: 2026, month: 1 /* Fev */ },
    { closingDay: 31, dueDay: 10, year: 2026, month: 0 /* Jan */ },
  ])(
    "periodKey stable across every hour of the month for closingDay=$closingDay in $year-$month",
    ({ closingDay, dueDay, year, month }) => {
      const seen = new Set<string>();
      // days 1..28 covers every month safely.
      for (let day = 1; day <= 28; day++) {
        for (const hour of [0, 3, 12, 21, 23]) {
          const ref = new Date(year, month, day, hour, 59, 59);
          const { currentClose } = getCycleDates(ref, closingDay, dueDay);
          seen.add(periodKeyOf(currentClose));
        }
      }
      expect(seen.size).toBe(1);
    },
  );

  // ------------------------------------------------------------------
  // 2. Home and Cards derive the periodKey the same way. Simulate both
  //    surfaces reporting cycle snapshots with keys derived from *different*
  //    reference clocks within the same month; consistency must hold with
  //    zero tolerance.
  // ------------------------------------------------------------------
  it("home@00:01 and cards@23:59 on different days of the same month agree", () => {
    const closingDay = 10;
    const dueDay = 20;
    const homeRef = new Date(2026, 6, 3, 0, 1, 0);
    const cardsRef = new Date(2026, 6, 29, 23, 59, 0);
    const homeKey = periodKeyOf(getCycleDates(homeRef, closingDay, dueDay).currentClose);
    const cardsKey = periodKeyOf(getCycleDates(cardsRef, closingDay, dueDay).currentClose);
    expect(homeKey).toBe(cardsKey);

    // Report identical totals under the same key — must not raise mismatch
    // even with `absolute: 0, percent: 0` (strictest possible tolerance).
    reportCycleSnapshot({
      source: "home",
      cardId: "c",
      periodKey: homeKey,
      total: 1953.5,
      paid: 1000,
      remaining: 953.5,
    });
    const mismatch = reportCycleSnapshot({
      source: "cards",
      cardId: "c",
      periodKey: cardsKey,
      total: 1953.5,
      paid: 1000,
      remaining: 953.5,
    });
    expect(mismatch).toBe(false);
  });

  // ------------------------------------------------------------------
  // 3. Transaction-date toggles within the same month must bucket the
  //    tx into the same billing period.
  // ------------------------------------------------------------------
  it("txs with different date representations for the same day bucket identically", () => {
    const closingDay = 10;
    const dueDay = 20;
    const ref = new Date(2026, 6, 15, 12, 0, 0); // mid-July reference

    // All representations should mean "15 de julho de 2026".
    // parseTxDate is TZ-safe for these forms because it always builds
    // `new Date(year, monthIdx, day)` (local midnight).
    const rawForms = [
      "15/07",
      "15-07",
      "15/07/2026",
      "2026-07-15",
      "15 jul",
      "15 julho",
      "15 Jul.",
      "15 Julho",
    ];
    const bucketKeys = new Set<string>();
    for (const raw of rawForms) {
      const txs: CardTransaction[] = [
        {
          id: raw,
          name: "x",
          icon: null,
          category: "c",
          date: raw,
          amount: 100,
          type: "expense",
          created_at: new Date(2026, 6, 15, 12).toISOString(),
          total_installments: null,
          installment_number: null,
          installment_group_id: null,
        },
      ];
      const periods = groupByBillingCycle(txs, closingDay, dueDay, ref);
      // The tx must land in exactly one period.
      const matches = periods.filter((p) => p.transactions.length === 1);
      expect(matches.length).toBe(1);
      bucketKeys.add(`${matches[0].key}::${periodKeyOf(matches[0].endDate)}`);
    }
    expect(bucketKeys.size).toBe(1);
  });

  // ------------------------------------------------------------------
  // 4. Same-day different-hour txs (e.g. "2026-07-15" vs the parsed
  //    output for "15 jul" saved at 03:00 local via created_at) fall in
  //    the same billing cycle.
  // ------------------------------------------------------------------
  it("same-day txs saved at different hours of created_at stay in the same period", () => {
    const closingDay = 10;
    const dueDay = 20;
    const ref = new Date(2026, 6, 15, 12);

    const makeTx = (id: string, createdHour: number): CardTransaction => ({
      id,
      name: id,
      icon: null,
      category: "c",
      date: "15 jul",
      amount: 100,
      type: "expense",
      // created_at varies but parseTxDate returns new Date(year, 6, 15)
      // for "15 jul" regardless — hour doesn't leak into the tx date.
      created_at: new Date(2026, 6, 15, createdHour, 0, 0).toISOString(),
      total_installments: null,
      installment_number: null,
      installment_group_id: null,
    });

    const txs = [0, 3, 12, 21, 23].map((h) => makeTx(`h${h}`, h));
    const periods = groupByBillingCycle(txs, closingDay, dueDay, ref);
    const filled = periods.filter((p) => p.transactions.length > 0);
    expect(filled.length).toBe(1);
    expect(filled[0].transactions.length).toBe(txs.length);
  });

  // ------------------------------------------------------------------
  // 5. Regression guard: parseTxDate output has zeroed time components
  //    (local midnight), which is the property that makes cycle-bucketing
  //    TZ-safe against cutoff-hour drift within a month.
  // ------------------------------------------------------------------
  it.each(["15/07", "15-07", "2026-07-15", "15 jul", "15 julho"])(
    'parseTxDate("%s") returns local midnight (h=m=s=ms=0)',
    (raw) => {
      const d = parseTxDate(raw, new Date(2026, 6, 15, 17, 42).toISOString());
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(6);
      expect(d.getDate()).toBe(15);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
      expect(d.getMilliseconds()).toBe(0);
    },
  );

  // ------------------------------------------------------------------
  // 6. TZ-offset simulation: mock Date.prototype.getTimezoneOffset to
  //    exercise both a positive (UTC+14, Kiribati) and negative (UTC-12)
  //    world. The `getCycleDates` helper works purely with local
  //    components, so the current-close local date must not shift.
  //    (We cannot change `.toISOString()` output without a real TZ env,
  //    but we can prove the underlying Date components are stable —
  //    which is what any downstream key derivation reads.)
  // ------------------------------------------------------------------
  it.each([
    { label: "UTC-12 (Baker Island)", offsetMin: 720 },
    { label: "UTC-05 (Bogotá)",       offsetMin: 300 },
    { label: "UTC",                   offsetMin: 0 },
    { label: "UTC+03 (Moscou)",       offsetMin: -180 },
    { label: "UTC+14 (Kiribati)",     offsetMin: -840 },
  ])("currentClose local components stable at $label", ({ offsetMin }) => {
    const spy = vi
      .spyOn(Date.prototype, "getTimezoneOffset")
      .mockReturnValue(offsetMin);
    try {
      const closingDay = 10;
      const dueDay = 20;
      const seen = new Set<string>();
      for (let day = 1; day <= 28; day++) {
        for (const hour of [0, 12, 23]) {
          const ref = new Date(2026, 6, day, hour, 0, 0);
          const { currentClose } = getCycleDates(ref, closingDay, dueDay);
          seen.add(
            `${currentClose.getFullYear()}-${currentClose.getMonth()}-${currentClose.getDate()}`,
          );
        }
      }
      expect(seen.size).toBe(1);
      expect([...seen][0]).toBe("2026-6-10");
    } finally {
      spy.mockRestore();
    }
  });
});
