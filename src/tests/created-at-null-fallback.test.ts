import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseTxDate, groupByBillingCycle, getCycleDates, type CardTransaction } from "@/lib/invoice-utils";

/**
 * `created_at` is normally an ISO string from Postgres, but null/empty/invalid
 * values can appear during optimistic UI inserts, imports, or migrations.
 * This suite pins the FALLBACK CHAIN so the behavior is predictable:
 *
 *   parseTxDate(textual, badCreatedAt) →
 *     1. If textual is "DD mmm", month index comes from the token; year
 *        comes from `new Date().getFullYear()` when the fallback is invalid,
 *        with the Dec↔Jan heuristic still applied against the CURRENT month.
 *     2. If textual is empty AND fallback is invalid, `new Date()` (now).
 *     3. If textual is a valid ISO on its own, it wins regardless.
 *
 * The wall clock is frozen so results are deterministic.
 */

const CLOSING = 10;
const DUE = 20;
const FROZEN_NOW = new Date(Date.UTC(2026, 6, 15, 12, 0, 0)); // 15 Jul 2026

function mkTx(id: string, date: string, created_at: string | null | undefined): CardTransaction {
  return {
    id, name: id, icon: null, category: "food", card: "Card",
    date, amount: 100, type: "expense",
    // The runtime signature is `string`; simulate the wire shape.
    created_at: (created_at ?? "") as string,
    total_installments: null, installment_number: null, installment_group_id: null,
  };
}

describe("parseTxDate — missing / null / invalid created_at", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const INVALID_FALLBACKS: Array<[string, string]> = [
    ["empty string", ""],
    ["whitespace-only", "   "],
    ["arbitrary garbage", "not-a-date"],
    ["numeric junk", "0000-00-00"],
  ];


  describe("textual 'DD mmm' + invalid fallback → year = current wall-clock year", () => {
    it.each(INVALID_FALLBACKS)("fallback %s → uses now-year", (_, bad) => {
      const parsed = parseTxDate("05 mar", bad);
      expect(parsed.getFullYear()).toBe(FROZEN_NOW.getUTCFullYear()); // 2026
      expect(parsed.getMonth()).toBe(2); // March
      expect(parsed.getDate()).toBe(5);
    });

    it("null fallback (coerced to '') behaves like empty string", () => {
      const t = mkTx("t", "05 mar", null);
      const parsed = parseTxDate(t.date, t.created_at);
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(2);
    });

    it("undefined fallback (coerced to '') behaves like empty string", () => {
      const t = mkTx("t", "05 mar", undefined);
      const parsed = parseTxDate(t.date, t.created_at);
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(2);
    });
  });

  describe("year-boundary heuristic still fires against the CURRENT month", () => {
    it("textual '02 jan' + invalid fallback while clock is in Dec → next year", () => {
      vi.setSystemTime(new Date(Date.UTC(2026, 11, 20, 12, 0, 0)));
      const parsed = parseTxDate("02 jan", "");
      expect(parsed.getFullYear()).toBe(2027);
      expect(parsed.getMonth()).toBe(0);
    });

    it("textual '31 dez' + invalid fallback while clock is in Jan → previous year", () => {
      vi.setSystemTime(new Date(Date.UTC(2027, 0, 3, 12, 0, 0)));
      const parsed = parseTxDate("31 dez", "");
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(11);
    });

    it("textual '02 jan' + invalid fallback while clock is mid-year → same year (no shift)", () => {
      // Frozen at Jul → jan token does NOT shift.
      const parsed = parseTxDate("02 jan", "");
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(0);
    });
  });

  describe("empty textual date + invalid fallback → now", () => {
    it("both fields empty → returns current wall clock instant", () => {
      const before = Date.now();
      const parsed = parseTxDate("", "");
      const after = Date.now();
      expect(parsed.getTime()).toBeGreaterThanOrEqual(before);
      expect(parsed.getTime()).toBeLessThanOrEqual(after);
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(6); // Jul
    });

    it("empty textual + invalid fallback → now (not epoch, not NaN)", () => {
      const parsed = parseTxDate("", "garbage");
      expect(isNaN(parsed.getTime())).toBe(false);
      expect(parsed.getFullYear()).toBe(2026);
    });
  });

  describe("textual is a full ISO → wins regardless of fallback", () => {
    it("valid ISO textual + null fallback → ISO wins", () => {
      const parsed = parseTxDate("2025-03-15T00:00:00Z", "");
      expect(parsed.getUTCFullYear()).toBe(2025);
      expect(parsed.getUTCMonth()).toBe(2);
      expect(parsed.getUTCDate()).toBe(15);
    });
  });
});

describe("groupByBillingCycle — behavior when created_at is null/empty/invalid", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW); // 15 Jul 2026
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("textual 'DD mmm' + empty created_at → tx lands in the cycle predicted by CURRENT year", () => {
    // Frozen 15 Jul 2026, cycle window [10 Jun 2026, 10 Jul 2026) closed on
    // 10 Jul, due 20 Jul. A tx dated "20 jun" with empty created_at should
    // resolve to 20 Jun 2026 and land in that current cycle.
    const ref = new Date(FROZEN_NOW);
    const txs = [mkTx("t", "20 jun", "")];
    const periods = groupByBillingCycle(txs, CLOSING, DUE, ref);
    const p = periods.find((pd) => pd.transactions.some((x) => x.id === "t"));
    expect(p).toBeDefined();
    expect(p!.key).toBe("current");
    expect(p!.dueDate.getFullYear()).toBe(2026);
    expect(p!.dueDate.getMonth()).toBe(6); // Jul
    expect(p!.dueDate.getDate()).toBe(20);
  });

  it("multiple txs with null created_at retain deterministic classification (no random NaN drift)", () => {
    const ref = new Date(FROZEN_NOW);
    const txs = [
      mkTx("a", "05 jun", null),
      mkTx("b", "20 jun", null),
      mkTx("c", "05 jul", null),
    ];
    const periods = groupByBillingCycle(txs, CLOSING, DUE, ref);
    // Assert each tx has been placed exactly once.
    const seen = new Set<string>();
    for (const period of periods) {
      for (const t of period.transactions) {
        expect(seen.has(t.id)).toBe(false);
        seen.add(t.id);
      }
    }
    expect(seen).toEqual(new Set(["a", "b", "c"]));
  });

  it("cycle keys/labels match the ones derived from getCycleDates when fallbacks are absent", () => {
    const ref = new Date(FROZEN_NOW);
    const { currentClose, currentDue } = getCycleDates(ref, CLOSING, DUE);
    const periods = groupByBillingCycle([mkTx("t", "20 jun", "")], CLOSING, DUE, ref);
    const p = periods.find((pd) => pd.transactions.some((x) => x.id === "t"))!;
    expect(p.endDate.getTime()).toBe(currentClose.getTime());
    expect(p.dueDate.getTime()).toBe(currentDue.getTime());
  });

  it("null/empty/invalid created_at variants of the SAME tx are classified identically", () => {
    const ref = new Date(FROZEN_NOW);
    const variants = ["", "   ", "garbage", "0000-00-00"];
    const keys = variants.map((bad) => {
      const periods = groupByBillingCycle([mkTx("t", "20 jun", bad)], CLOSING, DUE, ref);
      return periods.find((pd) => pd.transactions.some((x) => x.id === "t"))!.key;
    });
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("current");
  });

  it("fully empty tx (empty date + empty created_at) resolves to `now` and lands in a deterministic cycle", () => {
    // parseTxDate falls through to `new Date()` (frozen at 15 Jul 2026, which
    // is AFTER the 10 Jul closing) → the tx belongs to the NEXT cycle whose
    // due date is 20 Aug 2026.
    const ref = new Date(FROZEN_NOW);
    const periods = groupByBillingCycle([mkTx("t", "", "")], CLOSING, DUE, ref);
    const p = periods.find((pd) => pd.transactions.some((x) => x.id === "t"));
    expect(p).toBeDefined();
    expect(p!.key).toBe("future_0");
    expect(p!.dueDate.getFullYear()).toBe(2026);
    expect(p!.dueDate.getMonth()).toBe(7); // Aug
    expect(p!.dueDate.getDate()).toBe(20);
  });


  it("Jan tx with null created_at when clock is in December rolls into the NEXT year's cycle", () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 11, 20, 12, 0, 0))); // 20 Dec 2026
    const ref = new Date();
    const periods = groupByBillingCycle([mkTx("t", "02 jan", null)], CLOSING, DUE, ref);
    const p = periods.find((pd) => pd.transactions.some((x) => x.id === "t"));
    expect(p).toBeDefined();
    // 02 Jan 2027 falls in the [10 Dec 2026, 10 Jan 2027) window → current cycle.
    expect(p!.dueDate.getFullYear()).toBe(2027);
    expect(p!.dueDate.getMonth()).toBe(0);
    expect(p!.dueDate.getDate()).toBe(20);
  });
});
