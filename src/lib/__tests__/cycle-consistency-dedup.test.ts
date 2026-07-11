import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  reportCycleSnapshot,
  resetCycleConsistencyCheck,
  enableCycleConsistencyCheck,
  subscribeCycleMismatch,
  configureCycleTolerance,
  type CycleMismatchEvent,
} from "@/lib/cycle-consistency";

/**
 * Dedup contract for `reportCycleSnapshot`:
 *
 *   A mismatch tuple is uniquely identified by
 *     `${cardId}::${periodKey}` + the sorted pair `{sourceA, sourceB}`.
 *
 *   Once warned, subsequent reports for the SAME tuple must not
 *   re-emit `console.warn` nor re-notify listeners, no matter how many
 *   divergent transactions land on the same `(cardId, periodKey)`.
 *
 *   Different `periodKey`s or different `cardId`s are separate tuples
 *   and MUST warn independently.
 */

describe("cycle-consistency dedup by (cardId, periodKey)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let events: CycleMismatchEvent[];
  let unsubscribe: () => void;

  beforeEach(() => {
    resetCycleConsistencyCheck();
    configureCycleTolerance({ absolute: 0.01, percent: 0 });
    enableCycleConsistencyCheck(true);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    events = [];
    unsubscribe = subscribeCycleMismatch((e) => {
      events.push(e);
    });
  });

  afterEach(() => {
    unsubscribe();
    warnSpy.mockRestore();
    resetCycleConsistencyCheck();
    enableCycleConsistencyCheck(false);
  });

  it("multiple divergent snapshots on the same (cardId, periodKey) warn exactly once", () => {
    const base = { cardId: "card-A", periodKey: "2026-07", cardName: "Nubank" };

    // Home reports first — no sibling yet, no mismatch.
    expect(
      reportCycleSnapshot({ ...base, source: "home", total: 1000, paid: 0, remaining: 1000 }),
    ).toBe(false);

    // Cards reports diverging total → 1st mismatch → 1 warn.
    expect(
      reportCycleSnapshot({ ...base, source: "cards", total: 1200, paid: 0, remaining: 1200 }),
    ).toBe(true);

    // Home re-reports a DIFFERENT diverging value (as if another tx arrived).
    reportCycleSnapshot({ ...base, source: "home", total: 1100, paid: 0, remaining: 1100 });
    // Cards re-reports again with yet another value.
    reportCycleSnapshot({ ...base, source: "cards", total: 1300, paid: 50, remaining: 1250 });
    // Home reports again with a huge delta.
    reportCycleSnapshot({ ...base, source: "home", total: 9999, paid: 0, remaining: 9999 });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0].cardId).toBe("card-A");
    expect(events[0].periodKey).toBe("2026-07");
  });

  it("dedup key is independent of which side reported first", () => {
    // Same tuple order-reversed on a different card → both should warn once.
    reportCycleSnapshot({ cardId: "c1", periodKey: "2026-08", source: "cards", total: 100, paid: 0, remaining: 100 });
    reportCycleSnapshot({ cardId: "c1", periodKey: "2026-08", source: "home", total: 200, paid: 0, remaining: 200 });
    reportCycleSnapshot({ cardId: "c1", periodKey: "2026-08", source: "cards", total: 300, paid: 0, remaining: 300 });
    reportCycleSnapshot({ cardId: "c1", periodKey: "2026-08", source: "home", total: 400, paid: 0, remaining: 400 });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
  });

  it("different periodKey on the same card produces a distinct mismatch", () => {
    const card = { cardId: "card-A", cardName: "Nubank" };

    reportCycleSnapshot({ ...card, periodKey: "2026-07", source: "home",  total: 100, paid: 0, remaining: 100 });
    reportCycleSnapshot({ ...card, periodKey: "2026-07", source: "cards", total: 200, paid: 0, remaining: 200 });
    reportCycleSnapshot({ ...card, periodKey: "2026-08", source: "home",  total: 500, paid: 0, remaining: 500 });
    reportCycleSnapshot({ ...card, periodKey: "2026-08", source: "cards", total: 700, paid: 0, remaining: 700 });

    // Re-report duplicates on both periods → still one warn per period.
    reportCycleSnapshot({ ...card, periodKey: "2026-07", source: "cards", total: 999, paid: 0, remaining: 999 });
    reportCycleSnapshot({ ...card, periodKey: "2026-08", source: "cards", total: 888, paid: 0, remaining: 888 });

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(events.map((e) => e.periodKey).sort()).toEqual(["2026-07", "2026-08"]);
  });

  it("different cardId on the same periodKey produces a distinct mismatch", () => {
    const period = { periodKey: "2026-07" };

    reportCycleSnapshot({ ...period, cardId: "A", source: "home",  total: 100, paid: 0, remaining: 100 });
    reportCycleSnapshot({ ...period, cardId: "A", source: "cards", total: 150, paid: 0, remaining: 150 });
    reportCycleSnapshot({ ...period, cardId: "B", source: "home",  total: 300, paid: 0, remaining: 300 });
    reportCycleSnapshot({ ...period, cardId: "B", source: "cards", total: 350, paid: 0, remaining: 350 });

    // Repeat divergences on both cards.
    reportCycleSnapshot({ ...period, cardId: "A", source: "home",  total: 111, paid: 0, remaining: 111 });
    reportCycleSnapshot({ ...period, cardId: "B", source: "cards", total: 999, paid: 0, remaining: 999 });

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(events.map((e) => e.cardId).sort()).toEqual(["A", "B"]);
  });

  it("snapshots within tolerance never warn, even when reported many times", () => {
    const base = { cardId: "c", periodKey: "p", cardName: "X" };
    reportCycleSnapshot({ ...base, source: "home",  total: 100.000, paid: 0, remaining: 100.000 });
    // Sub-cent noise around 100.00 — all pairwise diffs stay ≤ 1 cent.
    reportCycleSnapshot({ ...base, source: "cards", total: 100.003, paid: 0, remaining: 99.997 });
    reportCycleSnapshot({ ...base, source: "home",  total: 100.004, paid: 0, remaining: 99.996 });
    reportCycleSnapshot({ ...base, source: "cards", total: 100.001, paid: 0, remaining: 99.999 });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });


  it("resetCycleConsistencyCheck() clears the dedup memory so the same tuple warns again", () => {
    const base = { cardId: "c", periodKey: "p" };
    reportCycleSnapshot({ ...base, source: "home",  total: 100, paid: 0, remaining: 100 });
    reportCycleSnapshot({ ...base, source: "cards", total: 200, paid: 0, remaining: 200 });
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Second divergence on the same tuple after a reset → warns again.
    resetCycleConsistencyCheck();
    reportCycleSnapshot({ ...base, source: "home",  total: 100, paid: 0, remaining: 100 });
    reportCycleSnapshot({ ...base, source: "cards", total: 300, paid: 0, remaining: 300 });
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("simulates many divergent transactions in the same period → one warn, one event", () => {
    const base = { cardId: "flood", periodKey: "2026-07" };
    // Establish 'home' as the reference.
    reportCycleSnapshot({ ...base, source: "home", total: 0, paid: 0, remaining: 0 });

    // 50 divergent snapshots from 'cards' (as if each new tx re-triggers the check).
    for (let i = 1; i <= 50; i++) {
      reportCycleSnapshot({
        ...base,
        source: "cards",
        total: 100 * i,
        paid: 0,
        remaining: 100 * i,
      });
    }
    // And 50 more from 'home' with drifting values.
    for (let i = 1; i <= 50; i++) {
      reportCycleSnapshot({
        ...base,
        source: "home",
        total: 5 * i,
        paid: 0,
        remaining: 5 * i,
      });
    }

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
  });
});
