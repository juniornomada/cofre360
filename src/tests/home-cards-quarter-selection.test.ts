/**
 * Quarter-based period-filter contract for Home and /cards.
 *
 * Extends the range-filter tests (`home-cards-range-selection.test.ts`) with
 * the specific complications of quarter selection:
 *
 *  Q1. Same quarter on Home and /cards MUST canonicalize to the same
 *      `periodKey` even when the raw encodings differ ("2026-Q3",
 *      "2026-T3", "2026-07-01__2026-09-30", start/end at any hour).
 *  Q2. If a surface skips canonicalization the reporter cannot compare
 *      the two snapshots — this is a silent-divergence trap and the test
 *      documents it. We ALSO assert that the canonical helper prevents it.
 *  Q3. Aggregate over the quarter = sum of its 3 months (additivity).
 *  Q4. Half-open interval at quarter boundaries: a tx at Oct 1 00:00
 *      belongs to Q4, never to Q3.
 *  Q5. Cross-year quarters (Q4/2025 vs Q1/2026) produce distinct keys.
 *  Q6. Invalid quarter numbers are rejected by the canonical helper.
 *  Q7. TZ / hour stability: hours on `start`/`end` don't shift the key.
 *  Q8. Real drift inside a quarter is still reported (false-negative guard).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseTxDate, type CardTransaction } from "@/lib/invoice-utils";
import {
  reportCycleSnapshot,
  resetCycleConsistencyCheck,
  enableCycleConsistencyCheck,
  configureCycleTolerance,
  _debugSnapshots,
} from "@/lib/cycle-consistency";

// ------------------------------------------------------------------
// Canonical quarter helpers — the contract the surfaces must adopt so
// that different string encodings for the same window never diverge.
// ------------------------------------------------------------------

type Quarter = 1 | 2 | 3 | 4;

function quarterBounds(year: number, q: Quarter): { start: Date; end: Date } {
  const startMonth = (q - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 1); // exclusive
  return { start, end };
}

/**
 * The single canonical string a surface must emit for a quarter window.
 * Encoding chosen: `YYYY-Q{n}`. Any other encoding — including a raw
 * `start__end` range — is normalized through this function BEFORE being
 * reported to the cycle-consistency reporter.
 */
function canonicalQuarterKey(year: number, q: Quarter): string {
  if (!Number.isInteger(year)) throw new Error("Invalid year");
  if (q < 1 || q > 4 || !Number.isInteger(q)) throw new Error("Invalid quarter");
  return `${year}-Q${q}`;
}

/** Detect the quarter that fully contains `[start, end)`; throws otherwise. */
function quarterFromRange(start: Date, end: Date): { year: number; q: Quarter } {
  // Normalize to day-only (drop hour components).
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const y = s.getFullYear();
  const startMonth = s.getMonth();
  if (s.getDate() !== 1 || startMonth % 3 !== 0) {
    throw new Error("Range start is not aligned to a quarter");
  }
  const expected = quarterBounds(y, ((startMonth / 3 + 1) as Quarter));
  if (e.getTime() !== expected.end.getTime()) {
    throw new Error("Range end does not match quarter length");
  }
  return { year: y, q: (startMonth / 3 + 1) as Quarter };
}

/** Accept ANY raw form and return the canonical key. */
function normalizeQuarterInput(raw: string | { start: Date; end: Date }): string {
  if (typeof raw === "object") {
    const { year, q } = quarterFromRange(raw.start, raw.end);
    return canonicalQuarterKey(year, q);
  }
  const trimmed = raw.trim().toUpperCase().replace(/\s+/g, "");
  // "2026-Q3" or "2026-T3" (pt-BR "Trimestre 3").
  let m = /^(\d{4})-[QT]([1-4])$/.exec(trimmed);
  if (m) return canonicalQuarterKey(Number(m[1]), Number(m[2]) as Quarter);
  // "2026Q3" / "2026T3" (no dash).
  m = /^(\d{4})[QT]([1-4])$/.exec(trimmed);
  if (m) return canonicalQuarterKey(Number(m[1]), Number(m[2]) as Quarter);
  // "YYYY-MM-DD__YYYY-MM-DD" range.
  m = /^(\d{4}-\d{2}-\d{2})__(\d{4}-\d{2}-\d{2})$/.exec(raw.trim());
  if (m) return normalizeQuarterInput({ start: new Date(m[1]), end: new Date(m[2]) });
  throw new Error(`Unrecognized quarter encoding: ${raw}`);
}

// ------------------------------------------------------------------
// Fixture
// ------------------------------------------------------------------

const CARD_ID = "porto";
const NOW = new Date(2026, 7, 15, 10, 0, 0); // 15 Aug 2026

const TXS: CardTransaction[] = [
  { id: "q2-mar",  name: "Q2 boundary in",  icon: null, category: "c", date: "01 abr", amount: 100, type: "expense", created_at: "2026-04-01T00:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  { id: "q3-jul",  name: "Q3 mid",          icon: null, category: "c", date: "15 jul", amount: 250, type: "expense", created_at: "2026-07-15T00:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  { id: "q3-aug",  name: "Q3 mid",          icon: null, category: "c", date: "20 ago", amount: 400, type: "expense", created_at: "2026-08-20T00:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  { id: "q3-sep",  name: "Q3 late",         icon: null, category: "c", date: "30 set", amount: 350, type: "expense", created_at: "2026-09-30T00:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  { id: "q4-oct",  name: "Q4 boundary in",  icon: null, category: "c", date: "01 out", amount: 500, type: "expense", created_at: "2026-10-01T00:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
  { id: "q4-2025-dec", name: "Q4 2025",     icon: null, category: "c", date: "20 dez", amount: 800, type: "expense", created_at: "2025-12-20T00:00:00Z", total_installments: null, installment_number: null, installment_group_id: null },
];

function aggregateQuarter(year: number, q: Quarter) {
  const { start, end } = quarterBounds(year, q);
  const total = TXS.reduce((s, t) => {
    const d = parseTxDate(t.date, t.created_at);
    if (d < start || d >= end) return s;
    return s + (t.type === "income" ? -Number(t.amount) : Number(t.amount));
  }, 0);
  return { total, paid: 0, remaining: Math.max(0, total) };
}

// ------------------------------------------------------------------
// Suite
// ------------------------------------------------------------------

describe("cycle-consistency — quarter selection with divergent periodKey formats", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    enableCycleConsistencyCheck(true);
    resetCycleConsistencyCheck();
    configureCycleTolerance({ absolute: 0, percent: 0 });
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    enableCycleConsistencyCheck(false);
    resetCycleConsistencyCheck();
    configureCycleTolerance(null);
    vi.useRealTimers();
  });

  // -------- Canonicalization --------
  describe("canonicalQuarterKey / normalizeQuarterInput", () => {
    it("all supported encodings collapse to the same canonical key", () => {
      const canonical = canonicalQuarterKey(2026, 3);
      const inputs: Array<string | { start: Date; end: Date }> = [
        "2026-Q3",
        "2026-q3",
        "2026-T3",
        "2026-t3",
        "2026Q3",
        "2026T3",
        " 2026-Q3 ",
        "2026-07-01__2026-10-01",
        { start: new Date(2026, 6, 1), end: new Date(2026, 9, 1) },
        { start: new Date(2026, 6, 1, 23, 59), end: new Date(2026, 9, 1, 0, 0) },
      ];
      for (const raw of inputs) {
        expect(normalizeQuarterInput(raw)).toBe(canonical);
      }
    });

    it("rejects malformed encodings", () => {
      expect(() => normalizeQuarterInput("2026-Q5")).toThrow();
      expect(() => normalizeQuarterInput("2026-Q0")).toThrow();
      expect(() => normalizeQuarterInput("Q3-2026")).toThrow();
      expect(() => normalizeQuarterInput("2026-07-15__2026-10-15")).toThrow(); // misaligned
      expect(() => normalizeQuarterInput({ start: new Date(2026, 6, 2), end: new Date(2026, 9, 1) })).toThrow();
      expect(() => canonicalQuarterKey(2026.5 as unknown as number, 3 as Quarter)).toThrow();
      expect(() => canonicalQuarterKey(2026, 5 as unknown as Quarter)).toThrow();
    });
  });

  // Q1
  it("Q1 — Home ('2026-Q3') and /cards (range '2026-07-01__2026-10-01') collapse to the same key", () => {
    const homeKey = normalizeQuarterInput("2026-Q3");
    const cardsKey = normalizeQuarterInput("2026-07-01__2026-10-01");
    expect(homeKey).toBe(cardsKey);

    const snap = aggregateQuarter(2026, 3);
    reportCycleSnapshot({ source: "home",  cardId: CARD_ID, periodKey: homeKey,  ...snap });
    const m = reportCycleSnapshot({ source: "cards", cardId: CARD_ID, periodKey: cardsKey, ...snap });
    expect(m).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();

    const snaps = _debugSnapshots();
    // Exactly one entry — the surfaces did NOT create two silo'd records.
    const keys = Object.keys(snaps).filter((k) => k.startsWith(`${CARD_ID}::`));
    expect(keys).toEqual([`${CARD_ID}::${homeKey}`]);
  });

  // Q2 — trap: skipping canonicalization silently silo's the surfaces.
  it("Q2 — without canonicalization, divergent encodings silently create two entries (documented trap)", () => {
    const snap = aggregateQuarter(2026, 3);
    // Surfaces emit the raw strings — no normalization.
    reportCycleSnapshot({ source: "home",  cardId: CARD_ID, periodKey: "2026-Q3",                     ...snap });
    reportCycleSnapshot({ source: "cards", cardId: CARD_ID, periodKey: "2026-07-01__2026-10-01",      ...snap });
    reportCycleSnapshot({ source: "cards", cardId: CARD_ID, periodKey: "2026-T3",                     ...snap });

    // The reporter cannot compare across different keys → no warning.
    expect(warnSpy).not.toHaveBeenCalled();
    // Three separate silo'd records — the exact bug that Q1 prevents.
    const keys = Object.keys(_debugSnapshots()).filter((k) => k.startsWith(`${CARD_ID}::`));
    expect(keys).toHaveLength(3);

    // And with canonicalization applied, the same three inputs collapse to one.
    resetCycleConsistencyCheck();
    for (const raw of ["2026-Q3", "2026-07-01__2026-10-01", "2026-T3"]) {
      reportCycleSnapshot({ source: raw === "2026-Q3" ? "home" : "cards", cardId: CARD_ID, periodKey: normalizeQuarterInput(raw), ...snap });
    }
    const keys2 = Object.keys(_debugSnapshots()).filter((k) => k.startsWith(`${CARD_ID}::`));
    expect(keys2).toHaveLength(1);
  });

  // Q3
  it("Q3 — quarter aggregate equals the sum of its three months", () => {
    const q3 = aggregateQuarter(2026, 3);
    const jul = TXS.filter((t) => t.id === "q3-jul").reduce((s, t) => s + Number(t.amount), 0);
    const ago = TXS.filter((t) => t.id === "q3-aug").reduce((s, t) => s + Number(t.amount), 0);
    const sep = TXS.filter((t) => t.id === "q3-sep").reduce((s, t) => s + Number(t.amount), 0);
    expect(q3.total).toBeCloseTo(jul + ago + sep, 2);
    expect(q3.total).toBeCloseTo(250 + 400 + 350, 2);
  });

  // Q4
  it("Q4 — half-open at quarter boundary: Oct 1 belongs to Q4, not Q3", () => {
    const q3 = aggregateQuarter(2026, 3);
    const q4 = aggregateQuarter(2026, 4);
    // t-q4-oct (01 out) is EXCLUDED from Q3 and INCLUDED in Q4.
    expect(q3.total).not.toContain(500);
    expect(q4.total).toBeCloseTo(500, 2);
    // Symmetric on the other side: Jul 1 belongs to Q3, not Q2.
    const q2 = aggregateQuarter(2026, 2);
    // t-q2-mar is Apr 1 → belongs to Q2 (start of Q2).
    expect(q2.total).toBeCloseTo(100, 2);
  });

  // Q5
  it("Q5 — cross-year quarters produce distinct canonical keys and are segregated", () => {
    const k2025Q4 = canonicalQuarterKey(2025, 4);
    const k2026Q1 = canonicalQuarterKey(2026, 1);
    expect(k2025Q4).not.toBe(k2026Q1);

    const s2025 = aggregateQuarter(2025, 4);
    const s2026 = aggregateQuarter(2026, 1);
    expect(s2025.total).toBeCloseTo(800, 2);
    expect(s2026.total).toBeCloseTo(0, 2);

    reportCycleSnapshot({ source: "home",  cardId: CARD_ID, periodKey: k2025Q4, ...s2025 });
    reportCycleSnapshot({ source: "cards", cardId: CARD_ID, periodKey: k2025Q4, ...s2025 });
    reportCycleSnapshot({ source: "home",  cardId: CARD_ID, periodKey: k2026Q1, ...s2026 });
    reportCycleSnapshot({ source: "cards", cardId: CARD_ID, periodKey: k2026Q1, ...s2026 });
    expect(warnSpy).not.toHaveBeenCalled();

    const keys = Object.keys(_debugSnapshots()).filter((k) => k.startsWith(`${CARD_ID}::`));
    expect(keys.sort()).toEqual([`${CARD_ID}::${k2025Q4}`, `${CARD_ID}::${k2026Q1}`].sort());
  });

  // Q7
  it("Q7 — hour components on range boundaries do not shift the canonical key", () => {
    const a = normalizeQuarterInput({ start: new Date(2026, 6, 1, 0, 0, 0), end: new Date(2026, 9, 1, 0, 0, 0) });
    const b = normalizeQuarterInput({ start: new Date(2026, 6, 1, 23, 59, 59), end: new Date(2026, 9, 1, 23, 59, 59) });
    expect(a).toBe(b);
  });

  // Q8
  it("Q8 — real drift inside a quarter is still reported when both surfaces canonicalize", () => {
    const key = canonicalQuarterKey(2026, 3);
    const snap = aggregateQuarter(2026, 3);
    const tampered = { ...snap, total: snap.total + 1, remaining: snap.remaining + 1 };

    reportCycleSnapshot({ source: "home",  cardId: CARD_ID, periodKey: key, ...snap });
    const m = reportCycleSnapshot({ source: "cards", cardId: CARD_ID, periodKey: key, ...tampered });
    expect(m).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
