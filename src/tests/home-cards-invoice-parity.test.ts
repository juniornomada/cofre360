import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getCycleDates,
  parseTxDate,
  monthNames,
  type CardTransaction,
} from "@/lib/invoice-utils";
import {
  reportCycleSnapshot,
  resetCycleConsistencyCheck,
  enableCycleConsistencyCheck,
  _debugSnapshots,
} from "@/lib/cycle-consistency";

/**
 * Integration test: for a fixture of cards / transactions / payments, run the
 * per-cycle aggregation exactly as the Home (`src/routes/index.tsx`) and the
 * Cards page (`src/routes/cards.tsx`) do, and assert that both surfaces
 * produce identical `{ total, paid, remaining, status }` for every card ×
 * month offset. Also feeds both snapshots into `reportCycleSnapshot` and
 * asserts no divergence is warned.
 *
 * The two `compute*` functions below MUST mirror the inline logic of the two
 * routes verbatim (same field access, same rounding, same tie-breakers).
 * When one of the routes changes its aggregation, update the mirror here.
 */

type Card = {
  id: string;
  name: string;
  color: string;
  closing_day: number;
  due_day: number;
  is_visible: boolean;
};

type Payment = {
  id: string;
  card_id: string;
  amount: number;
  paid_at: string; // ISO
};

type Snapshot = {
  total: number;
  paid: number;
  remaining: number;
  status: "empty" | "open" | "partial" | "paid";
  periodKey: string;
  monthLabel: string;
};

const CARDS: Card[] = [
  { id: "porto", name: "Porto Bank", color: "from-red-500 to-red-700", closing_day: 10, due_day: 20, is_visible: true },
  { id: "nu", name: "Nubank", color: "from-purple-500 to-purple-700", closing_day: 25, due_day: 5, is_visible: true },
];

// Reference "now" for all deterministic calculations.
const NOW = new Date(2026, 6, 15, 10, 0, 0); // 15 Jul 2026

// Transactions cover: single-invoice, multi-parcela crossing cycles,
// an income (estorno), and boundary dates around the closing day.
const TXS: CardTransaction[] = [
  // Porto: current invoice (Jul cycle: 10 Jun – 10 Jul, due 20 Jul)
  { id: "p1", name: "Compra Jul", icon: null, category: "food", card: "porto", date: "03 jul", amount: 500, type: "expense", created_at: "2026-07-03T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  { id: "p2", name: "Estorno Jul", icon: null, category: "food", card: "porto", date: "05 jul", amount: 50, type: "income", created_at: "2026-07-05T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  // Porto: previous cycle (10 May – 10 Jun, due 20 Jun)
  { id: "p3", name: "Compra Jun", icon: null, category: "shop", card: "porto", date: "28 mai", amount: 1000, type: "expense", created_at: "2026-05-28T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  // Porto: boundary — 10 jul is the closing day itself → goes to NEXT cycle
  { id: "p4", name: "Fronteira", icon: null, category: "misc", card: "porto", date: "10 jul", amount: 200, type: "expense", created_at: "2026-07-10T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  // Porto: installment 2/3 lands in current (Jul) cycle
  { id: "p5a", name: "Parcela 1/3", icon: null, category: "shop", card: "porto", date: "20 jun", amount: 333.33, type: "expense", created_at: "2026-06-20T10:00:00Z", total_installments: 3, installment_number: 1, installment_group_id: "g1" },
  { id: "p5b", name: "Parcela 2/3", icon: null, category: "shop", card: "porto", date: "20 jul", amount: 333.33, type: "expense", created_at: "2026-06-20T10:00:00Z", total_installments: 3, installment_number: 2, installment_group_id: "g1" },
  { id: "p5c", name: "Parcela 3/3", icon: null, category: "shop", card: "porto", date: "20 ago", amount: 333.34, type: "expense", created_at: "2026-06-20T10:00:00Z", total_installments: 3, installment_number: 3, installment_group_id: "g1" },

  // Nubank: current invoice (Jul cycle: 25 Jun – 25 Jul, due 5 Aug)
  { id: "n1", name: "Compra Nu", icon: null, category: "food", card: "nu", date: "30 jun", amount: 200, type: "expense", created_at: "2026-06-30T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  // Nubank: previous cycle (25 May – 25 Jun, due 5 Jul) → fully paid below
  { id: "n2", name: "Compra Nu Jun", icon: null, category: "food", card: "nu", date: "10 jun", amount: 400, type: "expense", created_at: "2026-06-10T10:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
];

const PAYMENTS: Payment[] = [
  // Porto: partial payment of R$ 800 towards Jul invoice (paid on 18 Jul).
  { id: "pay1", card_id: "porto", amount: 800, paid_at: "2026-07-18T10:00:00Z" },
  // Nubank: full payment of R$ 400 for Jun invoice (paid on 03 Jul).
  { id: "pay2", card_id: "nu", amount: 400, paid_at: "2026-07-03T10:00:00Z" },
];

/**
 * Mirrors `src/routes/index.tsx` lines ~1210-1247.
 * Payment aggregation is done on-the-fly, per card, per render.
 */
function computeHome(card: Card, txs: CardTransaction[], payments: Payment[], refDate: Date): Snapshot {
  const cycle = getCycleDates(refDate, card.closing_day || 1, card.due_day || 10);
  const { currentClose: selClose, prevClose: selPrevClose, currentDue: selDue } = cycle;
  const selPeriodKey = selClose.toISOString().split("T")[0];

  const selTxs = txs.filter((t) => {
    if (t.card !== card.name) return false;
    const d = parseTxDate(t.date, t.created_at);
    return d >= selPrevClose && d < selClose;
  });
  const selTotal = selTxs.reduce(
    (s, t) => s + (t.type === "income" ? -Number(t.amount) : Number(t.amount)),
    0,
  );

  const cardPays = payments.filter((p) => p.card_id === card.id);
  const selPaid = cardPays.reduce((s, p) => {
    if (!p.paid_at) return s;
    const { currentClose: pClose } = getCycleDates(new Date(p.paid_at), card.closing_day || 1, card.due_day || 10);
    return pClose.toISOString().split("T")[0] === selPeriodKey ? s + Number(p.amount) : s;
  }, 0);

  const selRemaining = Math.max(0, selTotal - selPaid);
  const status: Snapshot["status"] =
    selTotal === 0 ? "empty"
    : selTotal > 0 && selRemaining < 0.01 ? "paid"
    : selPaid > 0 && selRemaining > 0.01 ? "partial"
    : "open";

  return {
    total: selTotal,
    paid: selPaid,
    remaining: selRemaining,
    status,
    periodKey: selPeriodKey,
    monthLabel: monthNames[selDue.getMonth()],
  };
}

/**
 * Mirrors `src/routes/cards.tsx` lines ~300-341 (preload of paidByPeriod) and
 * ~1130-1163 (per-cycle aggregation from the map).
 */
function buildPaidByPeriod(cards: Card[], payments: Payment[]): Record<string, Record<string, number>> {
  const byCard: Record<string, Record<string, number>> = {};
  for (const p of payments) {
    if (!p.paid_at) continue;
    const card = cards.find((c) => c.id === p.card_id);
    if (!card) continue;
    const { currentClose } = getCycleDates(new Date(p.paid_at), card.closing_day || 1, card.due_day || 10);
    const periodKey = currentClose.toISOString().split("T")[0];
    if (!byCard[p.card_id]) byCard[p.card_id] = {};
    byCard[p.card_id][periodKey] = (byCard[p.card_id][periodKey] || 0) + Number(p.amount);
  }
  return byCard;
}

function computeCards(
  card: Card,
  txs: CardTransaction[],
  paidByPeriod: Record<string, Record<string, number>>,
  refDate: Date,
): Snapshot {
  const selCycle = getCycleDates(refDate, card.closing_day, card.due_day);
  const selClose = selCycle.currentClose;
  const selPrevClose = selCycle.prevClose;
  const selDue = selCycle.currentDue;
  const selPeriodKey = selClose.toISOString().split("T")[0];

  const selTxs = txs.filter((t) => {
    if (t.card !== card.name) return false;
    const d = parseTxDate(t.date, t.created_at);
    return d >= selPrevClose && d < selClose;
  });
  const selTotal = selTxs.reduce(
    (s, t) => s + (t.type === "income" ? -Number(t.amount) : Number(t.amount)),
    0,
  );

  const selPaid = paidByPeriod[card.id]?.[selPeriodKey] || 0;
  const selRemaining = Math.max(0, selTotal - selPaid);
  const status: Snapshot["status"] =
    selTotal === 0 ? "empty"
    : selTotal > 0 && selRemaining < 0.01 ? "paid"
    : selPaid > 0 && selRemaining > 0.01 ? "partial"
    : "open";

  return {
    total: selTotal,
    paid: selPaid,
    remaining: selRemaining,
    status,
    periodKey: selPeriodKey,
    monthLabel: monthNames[selDue.getMonth()],
  };
}

// Deep-equal helper with 1-cent tolerance on money.
function expectSnapshotsMatch(a: Snapshot, b: Snapshot, ctx: string) {
  expect(a.periodKey, `${ctx}: periodKey`).toBe(b.periodKey);
  expect(a.monthLabel, `${ctx}: monthLabel`).toBe(b.monthLabel);
  expect(a.status, `${ctx}: status`).toBe(b.status);
  expect(Math.abs(a.total - b.total), `${ctx}: total drift (home=${a.total}, cards=${b.total})`).toBeLessThan(0.01);
  expect(Math.abs(a.paid - b.paid), `${ctx}: paid drift (home=${a.paid}, cards=${b.paid})`).toBeLessThan(0.01);
  expect(Math.abs(a.remaining - b.remaining), `${ctx}: remaining drift`).toBeLessThan(0.01);
}

describe("integration — home CARTÕES vs /cards invoice snapshots", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    enableCycleConsistencyCheck(true);
    resetCycleConsistencyCheck();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    enableCycleConsistencyCheck(false);
    resetCycleConsistencyCheck();
    vi.useRealTimers();
  });

  const paidByPeriod = buildPaidByPeriod(CARDS, PAYMENTS);

  // Cover previous / current / next / two-ahead months.
  const OFFSETS = [-2, -1, 0, 1, 2];

  for (const card of CARDS) {
    for (const offset of OFFSETS) {
      it(`${card.name} @ offset ${offset}: home and /cards agree on total/paid/remaining/status`, () => {
        const refDate = new Date(NOW.getFullYear(), NOW.getMonth() + offset, 15);
        const home = computeHome(card, TXS, PAYMENTS, refDate);
        const cards = computeCards(card, TXS, paidByPeriod, refDate);
        expectSnapshotsMatch(home, cards, `${card.name} offset=${offset}`);

        // Feed both into the consistency reporter — must not warn.
        const mm1 = reportCycleSnapshot({
          source: "home", cardId: card.id, cardName: card.name,
          periodKey: home.periodKey, monthLabel: home.monthLabel,
          total: home.total, paid: home.paid, remaining: home.remaining,
        });
        const mm2 = reportCycleSnapshot({
          source: "cards", cardId: card.id, cardName: card.name,
          periodKey: cards.periodKey, monthLabel: cards.monthLabel,
          total: cards.total, paid: cards.paid, remaining: cards.remaining,
        });
        expect(mm1).toBe(false);
        expect(mm2).toBe(false);
      });
    }
  }

  it("no cycle-consistency warnings are emitted across the whole fixture", () => {
    for (const offset of OFFSETS) {
      const refDate = new Date(NOW.getFullYear(), NOW.getMonth() + offset, 15);
      for (const card of CARDS) {
        const home = computeHome(card, TXS, PAYMENTS, refDate);
        const cards = computeCards(card, TXS, paidByPeriod, refDate);
        reportCycleSnapshot({ source: "home", cardId: card.id, cardName: card.name, periodKey: home.periodKey, monthLabel: home.monthLabel, ...home });
        reportCycleSnapshot({ source: "cards", cardId: card.id, cardName: card.name, periodKey: cards.periodKey, monthLabel: cards.monthLabel, ...cards });
      }
    }
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("current invoice for Porto Bank at offset 0 has the expected shape", () => {
    // Sanity anchor so future changes to the fixture surface in this file.
    // Current cycle (10 Jun – 10 Jul, due 20 Jul):
    //   500 (compra jul) - 50 (estorno) + 333.33 (parcela 2/3) = 783.33
    //   p3 (28 mai) < prev close so goes to previous cycle
    //   p4 (10 jul) is on closing day → next cycle, not this one
    const home = computeHome(CARDS[0], TXS, PAYMENTS, NOW);
    expect(home.total).toBeCloseTo(783.33, 2);
    expect(home.paid).toBeCloseTo(800, 2);
    expect(home.remaining).toBeCloseTo(0, 2);
    expect(home.status).toBe("paid");
  });

  it("Nubank previous invoice (offset -1) is fully paid; current (offset 0) is open", () => {
    const refPrev = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 15);
    const prev = computeHome(CARDS[1], TXS, PAYMENTS, refPrev);
    expect(prev.total).toBeCloseTo(400, 2);
    expect(prev.paid).toBeCloseTo(400, 2);
    expect(prev.status).toBe("paid");

    const cur = computeHome(CARDS[1], TXS, PAYMENTS, NOW);
    expect(cur.total).toBeCloseTo(200, 2);
    expect(cur.paid).toBeCloseTo(0, 2);
    expect(cur.status).toBe("open");
  });

  it("_debugSnapshots exposes matched entries for every (card, offset) pair", () => {
    for (const offset of OFFSETS) {
      const refDate = new Date(NOW.getFullYear(), NOW.getMonth() + offset, 15);
      for (const card of CARDS) {
        const home = computeHome(card, TXS, PAYMENTS, refDate);
        const cards = computeCards(card, TXS, paidByPeriod, refDate);
        reportCycleSnapshot({ source: "home", cardId: card.id, periodKey: home.periodKey, ...home });
        reportCycleSnapshot({ source: "cards", cardId: card.id, periodKey: cards.periodKey, ...cards });
      }
    }
    const snaps = _debugSnapshots();
    // Every key must have BOTH home and cards recorded, and they must agree.
    for (const [key, bySource] of Object.entries(snaps)) {
      expect(bySource.home, `${key}: home missing`).toBeDefined();
      expect(bySource.cards, `${key}: cards missing`).toBeDefined();
      expect(bySource.home.total).toBeCloseTo(bySource.cards.total, 2);
      expect(bySource.home.paid).toBeCloseTo(bySource.cards.paid, 2);
      expect(bySource.home.remaining).toBeCloseTo(bySource.cards.remaining, 2);
    }
  });
});
