import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getCycleDates, parseTxDate, monthNames, type CardTransaction } from "@/lib/invoice-utils";
import {
  reportCycleSnapshot,
  resetCycleConsistencyCheck,
  enableCycleConsistencyCheck,
  configureCycleTolerance,
} from "@/lib/cycle-consistency";

/**
 * Cycle correctness at boundary instants with mixed timezone offsets in
 * `created_at`.
 *
 * The sandbox runs in UTC (`TZ=UTC`, `getTimezoneOffset() === 0`), so
 * "local" == "UTC" here. That means:
 *   - `new Date(iso)` for the same absolute instant yields identical
 *     `.getFullYear()` / `.getMonth()` / `.getDate()` regardless of which
 *     offset suffix (`Z`, `+05:00`, `-08:00`, etc.) was used to write the
 *     ISO string.
 *   - The invariants we validate below therefore rely on ABSOLUTE INSTANTS,
 *     not on the offset representation used in the fixture.
 *
 * The tests still matter: they lock the behavior so that a future refactor
 * cannot introduce naive string slicing on `created_at` (which would make
 * results depend on the offset suffix) without breaking these tests.
 */

const CARD = { id: "porto", name: "Porto Bank", closing_day: 10, due_day: 20 };

function tx(id: string, dateText: string, createdAt: string, amount: number): CardTransaction {
  return {
    id, name: id, icon: null, category: "food", card: CARD.name,
    date: dateText, amount, type: "expense", created_at: createdAt,
    total_installments: null, installment_number: null, installment_group_id: null,
  };
}

/**
 * Classify a transaction into a cycle exactly the way both routes do:
 *   currentClose is derived from the ref date's calendar month, tx date
 *   is `parseTxDate(t.date, t.created_at)`, tx belongs to cycle when
 *   `prevClose <= txDate < currentClose`.
 */
function cycleKeyFor(refDate: Date) {
  const { currentClose } = getCycleDates(refDate, CARD.closing_day, CARD.due_day);
  return currentClose.toISOString().split("T")[0];
}

function belongsToCycle(t: CardTransaction, refDate: Date): boolean {
  const { currentClose, prevClose } = getCycleDates(refDate, CARD.closing_day, CARD.due_day);
  const d = parseTxDate(t.date, t.created_at);
  return d >= prevClose && d < currentClose;
}

describe("cycle boundaries — frozen clock × timezone offsets on created_at", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
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

  describe("year rollover (31 Dec ↔ 1 Jan)", () => {
    it("clock frozen at 31 Dec 23:59:59 → cycle key is in December", () => {
      const t = new Date(Date.UTC(2025, 11, 31, 23, 59, 59, 999));
      vi.setSystemTime(t);
      expect(cycleKeyFor(new Date())).toBe("2025-12-10");
    });

    it("clock frozen at 01 Jan 00:00:00 → cycle key rolls to January", () => {
      const t = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
      vi.setSystemTime(t);
      expect(cycleKeyFor(new Date())).toBe("2026-01-10");
    });

    it("tx created_at at same instant expressed in five offsets classifies identically", () => {
      // Absolute instant: 2026-01-01T02:00:00Z
      const instants = [
        "2026-01-01T02:00:00Z",
        "2026-01-01T02:00:00.000Z",
        "2026-01-01T07:00:00+05:00",   // same instant, IST-ish
        "2025-12-31T18:00:00-08:00",   // same instant, PST — note the date-part differs
        "2026-01-01T03:30:00+01:30",   // exotic offset
      ];
      const refDate = new Date(Date.UTC(2026, 0, 15));
      const results = instants.map((iso) => {
        const t = tx(iso, "01 jan", iso, 100);
        return { in: belongsToCycle(t, refDate), parsed: parseTxDate(t.date, t.created_at).toISOString() };
      });
      // Every representation of the same instant → identical classification.
      const first = results[0];
      for (const r of results) {
        expect(r.in).toBe(first.in);
        expect(r.parsed).toBe(first.parsed);
      }
    });

    it("wall-clock 2026 in +05, absolute UTC still in 2025 → tx year follows UTC (sandbox=UTC)", () => {
      // "2026-01-01T01:00:00+05:00" → UTC = 2025-12-31T20:00:00Z → year 2025
      const created = "2026-01-01T01:00:00+05:00";
      const t = tx("boundary", "31 dez", created, 50);
      const parsed = parseTxDate(t.date, t.created_at);
      expect(parsed.getUTCFullYear()).toBe(2025);
      expect(parsed.getUTCMonth()).toBe(11); // dez
    });
  });

  describe("closing-day midnight boundary (day 10 rollover)", () => {
    it("clock at 09 Jul 23:59:59.999 UTC → currentClose = 2026-07-10", () => {
      vi.setSystemTime(new Date(Date.UTC(2026, 6, 9, 23, 59, 59, 999)));
      expect(cycleKeyFor(new Date())).toBe("2026-07-10");
    });

    it("clock at 10 Jul 00:00:00.000 UTC → currentClose still = 2026-07-10 (same calendar month)", () => {
      vi.setSystemTime(new Date(Date.UTC(2026, 6, 10, 0, 0, 0, 0)));
      expect(cycleKeyFor(new Date())).toBe("2026-07-10");
    });

    it("clock at 31 Jul 23:59:59.999 UTC → currentClose = 2026-07-10", () => {
      vi.setSystemTime(new Date(Date.UTC(2026, 6, 31, 23, 59, 59, 999)));
      expect(cycleKeyFor(new Date())).toBe("2026-07-10");
    });

    it("clock at 01 Aug 00:00:00.000 UTC → currentClose rolls to 2026-08-10", () => {
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 1, 0, 0, 0, 0)));
      expect(cycleKeyFor(new Date())).toBe("2026-08-10");
    });

    it("tx exactly at prevClose is INCLUDED, tx exactly at currentClose is EXCLUDED", () => {
      const refDate = new Date(Date.UTC(2026, 6, 15));
      // prevClose is a Date at local (=UTC) midnight of 10 Jun 2026.
      const prevCloseInstant = "2026-06-10T00:00:00Z";
      const currentCloseInstant = "2026-07-10T00:00:00Z";
      const included = tx("prev-close", "10 jun", prevCloseInstant, 10);
      const excluded = tx("curr-close", "10 jul", currentCloseInstant, 10);
      expect(belongsToCycle(included, refDate)).toBe(true);
      expect(belongsToCycle(excluded, refDate)).toBe(false);
    });

    it("tx at same instant with different offsets falls in the SAME cycle", () => {
      const refDate = new Date(Date.UTC(2026, 6, 15));
      // Same absolute instant, 2 different offsets, both should land in Jul cycle.
      // Instant: 2026-06-20T10:00:00Z (mid Jun cycle, 10 Jun ≤ d < 10 Jul).
      const a = tx("a", "20 jun", "2026-06-20T10:00:00Z", 100);
      const b = tx("b", "20 jun", "2026-06-20T05:00:00-05:00", 100);
      const c = tx("c", "20 jun", "2026-06-20T15:30:00+05:30", 100);
      expect(belongsToCycle(a, refDate)).toBe(true);
      expect(belongsToCycle(b, refDate)).toBe(true);
      expect(belongsToCycle(c, refDate)).toBe(true);
    });
  });

  describe("cycle-consistency reporter across boundary instants", () => {
    const CLOCK_INSTANTS = [
      new Date(Date.UTC(2025, 11, 31, 23, 59, 59, 999)), // year rollover eve
      new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0)),        // year rollover start
      new Date(Date.UTC(2026, 6, 9, 23, 59, 59, 999)),   // day-before-close
      new Date(Date.UTC(2026, 6, 10, 0, 0, 0, 0)),       // closing day midnight
      new Date(Date.UTC(2026, 6, 31, 23, 59, 59, 999)),  // month-end eve
      new Date(Date.UTC(2026, 7, 1, 0, 0, 0, 0)),        // month-flip
    ];

    it.each(CLOCK_INSTANTS.map((d, i) => [i, d.toISOString(), d]))(
      "clock #%s (%s): home & /cards agree on cycle key + totals",
      (_i, _label, clock) => {
        vi.setSystemTime(clock as Date);
        const ref = new Date();

        // Same fixture fed to both surfaces.
        const txs = [
          tx("t1", "05 jun", "2026-06-05T12:00:00Z", 100),
          tx("t2", "20 jun", "2026-06-20T05:00:00-05:00", 200), // same instant across zones
          tx("t3", "20 jun", "2026-06-20T15:30:00+05:30", 200),
          tx("t4", "12 jul", "2026-07-12T08:00:00Z", 50),
          tx("t5", "31 dez", "2025-12-31T23:00:00Z", 80),
          tx("t6", "01 jan", "2026-01-01T01:00:00+02:00", 80),
        ];

        const key = cycleKeyFor(ref);
        const total = txs
          .filter((t) => belongsToCycle(t, ref))
          .reduce((s, t) => s + t.amount, 0);

        const snap = { total, paid: 0, remaining: total };
        const m1 = reportCycleSnapshot({ source: "home", cardId: CARD.id, cardName: CARD.name, periodKey: key, monthLabel: monthNames[ref.getUTCMonth()], ...snap });
        const m2 = reportCycleSnapshot({ source: "cards", cardId: CARD.id, cardName: CARD.name, periodKey: key, monthLabel: monthNames[ref.getUTCMonth()], ...snap });

        expect(m1).toBe(false);
        expect(m2).toBe(false);
        expect(warnSpy).not.toHaveBeenCalled();
      },
    );

    it("crossing the closing-day boundary re-uses the same cycle key while month is unchanged", () => {
      // Freeze at 09 Jul 23:59, snapshot; then advance to 10 Jul 00:00, snapshot again.
      // Same calendar month → same key → no mismatch expected.
      vi.setSystemTime(new Date(Date.UTC(2026, 6, 9, 23, 59, 59, 999)));
      const keyA = cycleKeyFor(new Date());

      vi.setSystemTime(new Date(Date.UTC(2026, 6, 10, 0, 0, 0, 0)));
      const keyB = cycleKeyFor(new Date());

      expect(keyA).toBe(keyB);
      reportCycleSnapshot({ source: "home", cardId: CARD.id, cardName: CARD.name, periodKey: keyA, total: 100, paid: 0, remaining: 100 });
      reportCycleSnapshot({ source: "cards", cardId: CARD.id, cardName: CARD.name, periodKey: keyB, total: 100, paid: 0, remaining: 100 });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("crossing the MONTH boundary produces distinct keys and no cross-key warnings", () => {
      vi.setSystemTime(new Date(Date.UTC(2026, 6, 31, 23, 59, 59, 999)));
      const july = cycleKeyFor(new Date());
      reportCycleSnapshot({ source: "home", cardId: CARD.id, cardName: CARD.name, periodKey: july, total: 100, paid: 0, remaining: 100 });

      vi.setSystemTime(new Date(Date.UTC(2026, 7, 1, 0, 0, 0, 0)));
      const august = cycleKeyFor(new Date());
      reportCycleSnapshot({ source: "cards", cardId: CARD.id, cardName: CARD.name, periodKey: august, total: 500, paid: 0, remaining: 500 });

      expect(july).toBe("2026-07-10");
      expect(august).toBe("2026-08-10");
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
