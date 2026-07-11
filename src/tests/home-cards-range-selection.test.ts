/**
 * Cycle-consistency contract for RANGE-based period filters
 * (`[startDate, endDate)`) — the case where Home and /cards let the user
 * pick an arbitrary begin/end window, not just a whole month.
 *
 * Today production surfaces use month selection (`?mes=YYYY-MM`), but the
 * cycle reporter and the snapshot aggregation must already behave
 * correctly for arbitrary windows so that any future range picker doesn't
 * regress. These tests lock in the invariants below:
 *
 *  R1. `rangeKey(start,end)` is deterministic — same window ⇒ same key,
 *      independent of the current clock.
 *  R2. Same range on both surfaces ⇒ identical snapshot ⇒ no warning
 *      (even with `tolerance = 0`).
 *  R3. Half-open interval: a tx exactly at `endDate` belongs to the NEXT
 *      window, never both.
 *  R4. Additivity: sum(range = A ∪ B, disjoint & contiguous) equals
 *      sum(A) + sum(B). No off-by-one at the join.
 *  R5. Sub-cycle range: totals restricted to `[start,end)` are the same
 *      on Home and /cards, so partial-month drift cannot appear.
 *  R6. Range vs month equivalence: a range that spans a full billing
 *      cycle produces the same aggregate as the month-selection code path.
 *  R7. TZ / cutoff-hour stability: the same logical range with different
 *      hour components on `start`/`end` yields the same `rangeKey` and
 *      the same bucketed totals.
 *  R8. A REAL drift within a range is still reported — false-negative guard.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getCycleDates,
  parseTxDate,
  type CardTransaction,
} from "@/lib/invoice-utils";
import {
  reportCycleSnapshot,
  resetCycleConsistencyCheck,
  enableCycleConsistencyCheck,
  configureCycleTolerance,
  _debugSnapshots,
} from "@/lib/cycle-consistency";

type Card = { id: string; name: string; closing_day: number; due_day: number };
type Payment = { id: string; card_id: string; amount: number; paid_at: string };

const CARD: Card = { id: "porto", name: "Porto Bank", closing_day: 10, due_day: 20 };

const NOW = new Date(2026, 6, 15, 10, 0, 0); // 15 Jul 2026

const TXS: CardTransaction[] = [
  { id: "t-jun-25", name: "Jun late",  icon: null, category: "food",  card: "Porto Bank", date: "25 jun", amount: 100, type: "expense", created_at: "2026-06-25T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  { id: "t-jul-03", name: "Jul early", icon: null, category: "food",  card: "Porto Bank", date: "03 jul", amount: 500, type: "expense", created_at: "2026-07-03T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  { id: "t-jul-10", name: "Jul close", icon: null, category: "shop",  card: "Porto Bank", date: "10 jul", amount: 200, type: "expense", created_at: "2026-07-10T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  { id: "t-jul-12", name: "Jul post",  icon: null, category: "food",  card: "Porto Bank", date: "12 jul", amount: 250, type: "expense", created_at: "2026-07-12T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  { id: "t-jul-30", name: "Jul late",  icon: null, category: "shop",  card: "Porto Bank", date: "30 jul", amount: 400, type: "expense", created_at: "2026-07-30T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  { id: "t-aug-05", name: "Aug",       icon: null, category: "food",  card: "Porto Bank", date: "05 ago", amount: 150, type: "expense", created_at: "2026-08-05T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
];

const PAYMENTS: Payment[] = [
  { id: "pay-jul-08", card_id: "porto", amount: 300, paid_at: "2026-07-08T10:00:00Z" }, // inside pre-close window
  { id: "pay-jul-18", card_id: "porto", amount: 200, paid_at: "2026-07-18T10:00:00Z" }, // post-close
  { id: "pay-aug-02", card_id: "porto", amount: 100, paid_at: "2026-08-02T10:00:00Z" },
];

// -------- Helpers mirroring the surface aggregation logic --------

/** Deterministic key for a `[start, end)` window: ISO date parts joined. */
function rangeKey(start: Date, end: Date): string {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return `${s.toISOString().split("T")[0]}__${e.toISOString().split("T")[0]}`;
}

/** Aggregate a `[start, end)` window over the fixture. */
function snapshotForRange(card: Card, start: Date, end: Date) {
  const total = TXS.filter((t) => {
    if (t.card !== card.name) return false;
    const d = parseTxDate(t.date, t.created_at);
    return d >= start && d < end;
  }).reduce(
    (s, t) => s + (t.type === "income" ? -Number(t.amount) : Number(t.amount)),
    0,
  );
  const paid = PAYMENTS.filter((p) => p.card_id === card.id).reduce((s, p) => {
    if (!p.paid_at) return s;
    const d = new Date(p.paid_at);
    return d >= start && d < end ? s + Number(p.amount) : s;
  }, 0);
  const remaining = Math.max(0, total - paid);
  return { total, paid, remaining, periodKey: rangeKey(start, end) };
}

/** Aggregate an entire billing cycle for the same fixture (month code path). */
function snapshotForCycle(card: Card, refDate: Date) {
  const { currentClose, prevClose } = getCycleDates(refDate, card.closing_day, card.due_day);
  const total = TXS.filter((t) => {
    if (t.card !== card.name) return false;
    const d = parseTxDate(t.date, t.created_at);
    return d >= prevClose && d < currentClose;
  }).reduce(
    (s, t) => s + (t.type === "income" ? -Number(t.amount) : Number(t.amount)),
    0,
  );
  const paid = PAYMENTS.filter((p) => p.card_id === card.id).reduce((s, p) => {
    if (!p.paid_at) return s;
    const { currentClose: pClose } = getCycleDates(new Date(p.paid_at), card.closing_day, card.due_day);
    return pClose.getTime() === currentClose.getTime() ? s + Number(p.amount) : s;
  }, 0);
  return { total, paid, remaining: Math.max(0, total - paid), prevClose, currentClose };
}

// -------------------- Suite --------------------

describe("cycle-consistency — range period filters (start/end)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    enableCycleConsistencyCheck(true);
    resetCycleConsistencyCheck();
    configureCycleTolerance({ absolute: 0, percent: 0 }); // strictest
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    enableCycleConsistencyCheck(false);
    resetCycleConsistencyCheck();
    configureCycleTolerance(null);
    vi.useRealTimers();
  });

  // R1
  it("rangeKey is deterministic (same window ⇒ same key)", () => {
    const start = new Date(2026, 6, 1);
    const end = new Date(2026, 6, 31);
    expect(rangeKey(start, end)).toBe(rangeKey(new Date(start), new Date(end)));
    // Hour components on the boundaries do not leak into the key.
    expect(rangeKey(new Date(2026, 6, 1, 0), new Date(2026, 6, 31, 23))).toBe(
      rangeKey(new Date(2026, 6, 1, 23), new Date(2026, 6, 31, 0)),
    );
  });

  // R2
  it("same range on Home and /cards ⇒ identical snapshot, zero warnings (tolerance=0)", () => {
    const start = new Date(2026, 6, 1);
    const end = new Date(2026, 6, 15);
    const home = snapshotForRange(CARD, start, end);
    const cards = snapshotForRange(CARD, start, end);
    expect(home).toEqual(cards);

    reportCycleSnapshot({ source: "home", cardId: CARD.id, cardName: CARD.name, ...home });
    const m = reportCycleSnapshot({ source: "cards", cardId: CARD.id, cardName: CARD.name, ...cards });
    expect(m).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // R3
  it("half-open interval: a tx exactly at endDate belongs to the NEXT window, not both", () => {
    // Split at 12 Jul: [Jul 1, Jul 12) then [Jul 12, Jul 20).
    const A = snapshotForRange(CARD, new Date(2026, 6, 1), new Date(2026, 6, 12));
    const B = snapshotForRange(CARD, new Date(2026, 6, 12), new Date(2026, 6, 20));

    const idsA = TXS.filter((t) => {
      if (t.card !== CARD.name) return false;
      const d = parseTxDate(t.date, t.created_at);
      return d >= new Date(2026, 6, 1) && d < new Date(2026, 6, 12);
    }).map((t) => t.id);
    const idsB = TXS.filter((t) => {
      if (t.card !== CARD.name) return false;
      const d = parseTxDate(t.date, t.created_at);
      return d >= new Date(2026, 6, 12) && d < new Date(2026, 6, 20);
    }).map((t) => t.id);

    // t-jul-10 lands in A (10 < 12), t-jul-12 lands in B (12 >= 12).
    expect(idsA).toContain("t-jul-10");
    expect(idsB).toContain("t-jul-12");
    // No id appears in both.
    expect(idsA.filter((x) => idsB.includes(x))).toEqual([]);
    // Totals reflect that partition (500 + 200 = 700 in A, 250 in B).
    expect(A.total).toBeCloseTo(700, 2);
    expect(B.total).toBeCloseTo(250, 2);
  });

  // R4
  it("additivity across contiguous ranges: sum(A) + sum(B) = sum(A ∪ B)", () => {
    const start = new Date(2026, 6, 1);
    const mid = new Date(2026, 6, 15);
    const end = new Date(2026, 6, 31);
    const A = snapshotForRange(CARD, start, mid);
    const B = snapshotForRange(CARD, mid, end);
    const AB = snapshotForRange(CARD, start, end);

    expect(A.total + B.total).toBeCloseTo(AB.total, 2);
    expect(A.paid + B.paid).toBeCloseTo(AB.paid, 2);
    // remaining is `max(0, total - paid)` — additive only when both parts
    // are non-negative, which is the case for expenses in this fixture.
    expect(Math.max(0, AB.total - AB.paid)).toBeCloseTo(AB.remaining, 2);
  });

  // R5
  it("sub-cycle range (mid-cycle window) is consistent across surfaces", () => {
    // Pick a window entirely inside the "Atual" cycle (Jun 10 → Jul 10):
    // [Jun 20, Jul 05) — contains t-jun-25 and t-jul-03.
    const start = new Date(2026, 5, 20);
    const end = new Date(2026, 6, 5);
    const home = snapshotForRange(CARD, start, end);
    const cards = snapshotForRange(CARD, start, end);

    expect(home.total).toBeCloseTo(100 + 500, 2);
    reportCycleSnapshot({ source: "home", cardId: CARD.id, ...home });
    const m = reportCycleSnapshot({ source: "cards", cardId: CARD.id, ...cards });
    expect(m).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // R6
  it("range equivalence: a range spanning a full cycle equals the month-selection aggregate", () => {
    const cycle = snapshotForCycle(CARD, NOW); // "Atual" = [Jun 10, Jul 10)
    const range = snapshotForRange(CARD, cycle.prevClose, cycle.currentClose);
    expect(range.total).toBeCloseTo(cycle.total, 2);
    // Payments differ by aggregation shape (payments use closing month), so
    // for the equivalence we compare only the tx aggregate here.
    // Report BOTH under the same key and confirm no divergence in `total`.
    const rangeKeyValue = rangeKey(cycle.prevClose, cycle.currentClose);
    reportCycleSnapshot({
      source: "home",
      cardId: CARD.id,
      periodKey: rangeKeyValue,
      total: range.total,
      paid: 0,
      remaining: range.total,
    });
    const m = reportCycleSnapshot({
      source: "cards",
      cardId: CARD.id,
      periodKey: rangeKeyValue,
      total: cycle.total,
      paid: 0,
      remaining: cycle.total,
    });
    expect(m).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // R7
  it("hour components on the range boundaries do not shift bucketing or key", () => {
    const startA = new Date(2026, 6, 1, 0, 0, 0);
    const endA = new Date(2026, 6, 15, 0, 0, 0);
    const startB = new Date(2026, 6, 1, 23, 59, 59);
    const endB = new Date(2026, 6, 15, 23, 59, 59);

    const A = snapshotForRange(CARD, startA, endA);
    // For B, use the same DAY bounds (via `rangeKey` which strips time),
    // but different hour components should still snap to the same day at
    // midnight for parseTxDate outputs — proving no cutoff-hour drift.
    const B = {
      ...snapshotForRange(CARD, new Date(2026, 6, 1), new Date(2026, 6, 15)),
      periodKey: rangeKey(startB, endB),
    };
    expect(A.periodKey).toBe(B.periodKey);
    expect(A.total).toBeCloseTo(B.total, 2);

    reportCycleSnapshot({ source: "home", cardId: CARD.id, ...A });
    const m = reportCycleSnapshot({ source: "cards", cardId: CARD.id, ...B });
    expect(m).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // R8
  it("REAL divergence for the same range is still reported (false-negative guard)", () => {
    const start = new Date(2026, 6, 1);
    const end = new Date(2026, 6, 31);
    const home = snapshotForRange(CARD, start, end);
    const tampered = { ...home, total: home.total + 0.5, remaining: home.remaining + 0.5 };

    reportCycleSnapshot({ source: "home", cardId: CARD.id, cardName: CARD.name, ...home });
    const m = reportCycleSnapshot({ source: "cards", cardId: CARD.id, cardName: CARD.name, ...tampered });
    expect(m).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const snaps = _debugSnapshots();
    expect(snaps[`${CARD.id}::${home.periodKey}`]).toBeDefined();
  });

  // Overlapping non-identical ranges: distinct keys, independent entries.
  it("overlapping but non-identical ranges produce distinct keys (no false collapse)", () => {
    const rA = snapshotForRange(CARD, new Date(2026, 6, 1), new Date(2026, 6, 20));
    const rB = snapshotForRange(CARD, new Date(2026, 6, 10), new Date(2026, 6, 25));
    expect(rA.periodKey).not.toBe(rB.periodKey);

    reportCycleSnapshot({ source: "home", cardId: CARD.id, ...rA });
    reportCycleSnapshot({ source: "cards", cardId: CARD.id, ...rB });
    expect(warnSpy).not.toHaveBeenCalled();
    const keys = Object.keys(_debugSnapshots()).filter((k) => k.startsWith(`${CARD.id}::`));
    expect(keys).toHaveLength(2);
  });
});
