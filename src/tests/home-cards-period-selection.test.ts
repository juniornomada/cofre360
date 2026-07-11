import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getCycleDates, parseTxDate, monthNames, type CardTransaction } from "@/lib/invoice-utils";
import {
  reportCycleSnapshot,
  resetCycleConsistencyCheck,
  enableCycleConsistencyCheck,
  configureCycleTolerance,
  _debugSnapshots,
} from "@/lib/cycle-consistency";

/**
 * Cycle-consistency checks when Home and /cards are looking at DIFFERENT
 * periods (partial month selection via `?mes=YYYY-MM` on /cards while Home
 * shows another month, or a different reference day within the same month).
 *
 * Guarantees exercised:
 *  1. Distinct `(cardId, periodKey)` pairs are stored independently: no
 *     false mismatch when two surfaces target different months.
 *  2. Same `periodKey` from different reference days within the same cycle
 *     yields identical snapshots (period is defined by cycle, not by the
 *     specific day selected).
 *  3. Same `periodKey` reported from two surfaces with different reference
 *     dates still matches (surface-to-surface consistency across offsets).
 *  4. Segregation is per-card: two cards on the same period are independent.
 *  5. Multi-month sweep with mismatched offsets between Home and /cards
 *     produces zero warnings for periods that overlap, and independent
 *     entries for periods that do not.
 */

type Card = {
  id: string;
  name: string;
  closing_day: number;
  due_day: number;
};

type Payment = { id: string; card_id: string; amount: number; paid_at: string };

const CARDS: Card[] = [
  { id: "porto", name: "Porto Bank", closing_day: 10, due_day: 20 },
  { id: "nu", name: "Nubank", closing_day: 25, due_day: 5 },
];

const NOW = new Date(2026, 6, 15, 10, 0, 0); // 15 Jul 2026

const TXS: CardTransaction[] = [
  { id: "p1", name: "Compra Jul", icon: null, category: "food", card: "Porto Bank", date: "03 jul", amount: 500, type: "expense", created_at: "2026-07-03T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  { id: "p2", name: "Compra Jun", icon: null, category: "shop", card: "Porto Bank", date: "28 mai", amount: 1000, type: "expense", created_at: "2026-05-28T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  { id: "p3", name: "Compra Ago", icon: null, category: "food", card: "Porto Bank", date: "12 jul", amount: 250, type: "expense", created_at: "2026-07-12T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  { id: "n1", name: "Compra Nu", icon: null, category: "food", card: "Nubank", date: "30 jun", amount: 200, type: "expense", created_at: "2026-06-30T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
];

const PAYMENTS: Payment[] = [
  { id: "pay1", card_id: "porto", amount: 300, paid_at: "2026-07-18T10:00:00Z" },
  { id: "pay2", card_id: "nu", amount: 200, paid_at: "2026-07-30T10:00:00Z" },
];

function snapshotFor(card: Card, refDate: Date) {
  const cycle = getCycleDates(refDate, card.closing_day, card.due_day);
  const { currentClose, prevClose, currentDue } = cycle;
  const periodKey = currentClose.toISOString().split("T")[0];

  const total = TXS.filter((t) => {
    if (t.card !== card.name) return false;
    const d = parseTxDate(t.date, t.created_at);
    return d >= prevClose && d < currentClose;
  }).reduce((s, t) => s + (t.type === "income" ? -Number(t.amount) : Number(t.amount)), 0);

  const paid = PAYMENTS.filter((p) => p.card_id === card.id).reduce((s, p) => {
    if (!p.paid_at) return s;
    const { currentClose: pClose } = getCycleDates(new Date(p.paid_at), card.closing_day, card.due_day);
    return pClose.toISOString().split("T")[0] === periodKey ? s + Number(p.amount) : s;
  }, 0);

  const remaining = Math.max(0, total - paid);
  return { total, paid, remaining, periodKey, monthLabel: monthNames[currentDue.getMonth()] };
}

describe("cycle-consistency — differing period selection between Home and /cards", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    enableCycleConsistencyCheck(true);
    resetCycleConsistencyCheck();
    configureCycleTolerance({ absolute: 0.01, percent: 0 });
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    enableCycleConsistencyCheck(false);
    resetCycleConsistencyCheck();
    configureCycleTolerance(null);
    vi.useRealTimers();
  });

  it("Home on July and /cards on August produce distinct periodKeys and no warning", () => {
    const card = CARDS[0];
    const homeRef = new Date(2026, 6, 15); // Jul
    const cardsRef = new Date(2026, 7, 15); // Aug (user switched month on /cards)

    const home = snapshotFor(card, homeRef);
    const cards = snapshotFor(card, cardsRef);

    expect(home.periodKey).not.toBe(cards.periodKey);

    reportCycleSnapshot({ source: "home", cardId: card.id, cardName: card.name, ...home });
    reportCycleSnapshot({ source: "cards", cardId: card.id, cardName: card.name, ...cards });

    expect(warnSpy).not.toHaveBeenCalled();
    const snaps = _debugSnapshots();
    expect(Object.keys(snaps)).toHaveLength(2);
    expect(snaps[`${card.id}::${home.periodKey}`].home).toBeDefined();
    expect(snaps[`${card.id}::${home.periodKey}`].cards).toBeUndefined();
    expect(snaps[`${card.id}::${cards.periodKey}`].cards).toBeDefined();
    expect(snaps[`${card.id}::${cards.periodKey}`].home).toBeUndefined();
  });

  it("different reference days within the SAME cycle yield identical periodKey and snapshot", () => {
    const card = CARDS[0]; // closing day 10 → cycle boundaries fall on day 10
    // Pick reference dates all strictly within a single cycle (11 Jul → 9 Aug).
    const refs = [
      new Date(2026, 6, 11), // just after close
      new Date(2026, 6, 20),
      new Date(2026, 7, 1),
      new Date(2026, 7, 9),  // day before next close
    ];
    const snaps = refs.map((r) => snapshotFor(card, r));
    const first = snaps[0];
    for (const s of snaps.slice(1)) {
      expect(s.periodKey).toBe(first.periodKey);
      expect(s.total).toBeCloseTo(first.total, 2);
      expect(s.paid).toBeCloseTo(first.paid, 2);
      expect(s.remaining).toBeCloseTo(first.remaining, 2);
    }
  });

  it("same periodKey reported from different refDates by both surfaces MUST agree", () => {
    // Home reads with clock at 15 Jul; /cards was navigated with ?mes=2026-07
    // that mapped to a refDate of 1 Jul. Both should end up in the SAME cycle.
    const card = CARDS[0];
    const homeRef = new Date(2026, 6, 28); // late Jul
    const cardsRef = new Date(2026, 6, 15); // mid Jul (both after close on 10 Jul → same cycle)

    const home = snapshotFor(card, homeRef);
    const cards = snapshotFor(card, cardsRef);

    expect(home.periodKey).toBe(cards.periodKey);

    const m1 = reportCycleSnapshot({ source: "home", cardId: card.id, cardName: card.name, ...home });
    const m2 = reportCycleSnapshot({ source: "cards", cardId: card.id, cardName: card.name, ...cards });
    expect(m1).toBe(false);
    expect(m2).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("two different cards on the same period are segregated (no cross-card mismatch)", () => {
    const porto = snapshotFor(CARDS[0], NOW);
    const nu = snapshotFor(CARDS[1], NOW);

    // Even if totals happen to look similar for two cards, the reporter must
    // key on cardId — different cards on the same periodKey (unlikely but
    // possible when closing days align) must never collide.
    reportCycleSnapshot({ source: "home", cardId: "porto", cardName: "Porto Bank", ...porto });
    reportCycleSnapshot({ source: "cards", cardId: "porto", cardName: "Porto Bank", ...porto });
    reportCycleSnapshot({ source: "home", cardId: "nu", cardName: "Nubank", ...nu });
    reportCycleSnapshot({ source: "cards", cardId: "nu", cardName: "Nubank", ...nu });

    expect(warnSpy).not.toHaveBeenCalled();
    const snaps = _debugSnapshots();
    expect(snaps[`porto::${porto.periodKey}`]).toBeDefined();
    expect(snaps[`nu::${nu.periodKey}`]).toBeDefined();
  });

  it("multi-month sweep with mismatched offsets: overlapping periods match, non-overlapping stay independent", () => {
    // Home iterates Jun/Jul, /cards iterates Jul/Aug (user browsing).
    // The overlap is Jul: for that period both surfaces must produce matching
    // snapshots. Jun (home-only) and Aug (cards-only) live in separate keys.
    const card = CARDS[0];
    const homeMonths = [new Date(2026, 5, 15), new Date(2026, 6, 15)];
    const cardsMonths = [new Date(2026, 6, 15), new Date(2026, 7, 15)];

    for (const r of homeMonths) {
      const s = snapshotFor(card, r);
      reportCycleSnapshot({ source: "home", cardId: card.id, cardName: card.name, ...s });
    }
    for (const r of cardsMonths) {
      const s = snapshotFor(card, r);
      reportCycleSnapshot({ source: "cards", cardId: card.id, cardName: card.name, ...s });
    }

    expect(warnSpy).not.toHaveBeenCalled();
    const snaps = _debugSnapshots();

    // Exactly 3 distinct periodKeys: Jun, Jul (overlap), Aug.
    const cardKeys = Object.keys(snaps).filter((k) => k.startsWith(`${card.id}::`));
    expect(cardKeys).toHaveLength(3);

    // The overlap key must have BOTH sources recorded and agreeing.
    const overlap = Object.values(snaps).find((by) => by.home && by.cards);
    expect(overlap).toBeDefined();
    expect(overlap!.home.total).toBeCloseTo(overlap!.cards.total, 2);
    expect(overlap!.home.paid).toBeCloseTo(overlap!.cards.paid, 2);
    expect(overlap!.home.remaining).toBeCloseTo(overlap!.cards.remaining, 2);
  });

  it("a REAL divergence for the same period is still reported (guard against false negatives)", () => {
    const card = CARDS[0];
    const home = snapshotFor(card, NOW);
    const tampered = { ...home, paid: home.paid + 5 }; // simulate a drift in /cards

    reportCycleSnapshot({ source: "home", cardId: card.id, cardName: card.name, ...home });
    const mismatch = reportCycleSnapshot({ source: "cards", cardId: card.id, cardName: card.name, ...tampered });

    expect(mismatch).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [msg, meta] = warnSpy.mock.calls[0] as [string, any];
    expect(msg).toContain(card.id);
    expect(msg).toContain(home.periodKey);
    expect(meta.cardId).toBe(card.id);
    expect(meta.periodKey).toBe(home.periodKey);
  });
});
