/**
 * parseTxDate — leap-day (29/02) behavior across separators and year-boundary heuristic.
 *
 * Contract exercised here:
 *  L1. In leap years (2024, 2028, 2000), "29/02" is a real date and every
 *      accepted separator/format resolves to Feb 29 of the intended year.
 *  L2. In non-leap years (2023, 2025, 2026, 2027, 2100), day-in-month is
 *      NOT rejected by the parser: it delegates to `new Date(y, 1, 29)`
 *      which overflows to Mar 1 of the same year. This is the documented
 *      current behavior — tests pin it so a future change is intentional.
 *  L3. The Dec↔Jan year-boundary heuristic MUST NOT trigger for February,
 *      regardless of `created_at`. A "29 fev" typed while created_at sits
 *      in Nov/Dec/Jan/Fev keeps the fallback year (no ±1 shift).
 *  L4. All accepted encodings for the same leap date collapse to the same
 *      timestamp: "29/02", "29-02", "29/02/2024", "29-02-2024",
 *      "2024-02-29", "29 fev", "29 Fev.", "29 fevereiro", "29 Fevereiro".
 *  L5. Two-digit-year expansion still works ("29/02/24" → 2024).
 *  L6. Explicit non-leap year with day 29 overflows deterministically to
 *      Mar 1 of that same year (never bleeds into another year).
 */
import { describe, it, expect } from "vitest";
import { parseTxDate } from "@/lib/invoice-utils";

const iso = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

describe("parseTxDate — 29/02 leap-day handling", () => {
  // --------------- L1: leap years ---------------
  describe("L1 — leap years accept 29/02 across every separator/format", () => {
    const leapYears = [2000, 2004, 2020, 2024, 2028] as const;
    const encodings = (y: number) => [
      { label: "DD/MM (fallback year)", input: "29/02", fallback: `${y}-08-15T10:00:00Z` },
      { label: "DD-MM (fallback year)", input: "29-02", fallback: `${y}-08-15T10:00:00Z` },
      { label: "DD/MM/YYYY",            input: `29/02/${y}`, fallback: "2000-01-01T00:00:00Z" },
      { label: "DD-MM-YYYY",            input: `29-02-${y}`, fallback: "2000-01-01T00:00:00Z" },
      { label: "ISO YYYY-MM-DD",        input: `${y}-02-29`, fallback: "2000-01-01T00:00:00Z" },
      { label: "DD fev",                input: "29 fev",    fallback: `${y}-08-15T10:00:00Z` },
      { label: "DD Fev.",               input: "29 Fev.",   fallback: `${y}-08-15T10:00:00Z` },
      { label: "DD fevereiro",          input: "29 fevereiro", fallback: `${y}-08-15T10:00:00Z` },
      { label: "DD Fevereiro",          input: "29 Fevereiro", fallback: `${y}-08-15T10:00:00Z` },
    ];

    for (const y of leapYears) {
      it(`year ${y} — every encoding resolves to ${y}-02-29`, () => {
        const expected = iso(y, 1, 29);
        for (const { label, input, fallback } of encodings(y)) {
          const d = parseTxDate(input, fallback);
          expect({ label, ts: d.getTime() }).toEqual({ label, ts: expected });
          expect(d.getDate()).toBe(29);
          expect(d.getMonth()).toBe(1);
          expect(d.getFullYear()).toBe(y);
        }
      });
    }

    it("L5 — 2-digit-year expansion still lands on Feb 29 in leap years", () => {
      expect(parseTxDate("29/02/24", "2000-01-01T00:00:00Z").getTime()).toBe(iso(2024, 1, 29));
      expect(parseTxDate("29-02-04", "2000-01-01T00:00:00Z").getTime()).toBe(iso(2004, 1, 29));
      expect(parseTxDate("29/02/00", "2000-01-01T00:00:00Z").getTime()).toBe(iso(2000, 1, 29));
    });
  });

  // --------------- L2/L6: non-leap Feb 29 falls back to created_at ---------------
  describe("L2/L6 — non-leap years reject Feb 29 and fall back to created_at", () => {
    // Since Feb 29 is not a real date in a non-leap year, `parseTxDate` MUST
    // NOT silently roll into Mar 1 (that would put the tx in the wrong
    // billing cycle). It falls back to `created_at`, keeping the tx anchored
    // to a well-defined moment.
    const nonLeap = [1900, 2023, 2025, 2026, 2027, 2100] as const;

    for (const y of nonLeap) {
      it(`year ${y} — every encoding of 29/02 falls back to created_at`, () => {
        const fb = `${y}-08-15T10:00:00Z`;
        const fbTs = new Date(fb).getTime();
        const inputs = [
          "29/02",
          "29-02",
          `29/02/${y}`,
          `29-02-${y}`,
          `${y}-02-29`,
          "29 fev",
          "29 Fev.",
          "29 fevereiro",
          "29 Fevereiro",
        ];
        for (const input of inputs) {
          const d = parseTxDate(input, fb);
          expect({ input, ts: d.getTime() }).toEqual({ input, ts: fbTs });
        }
      });
    }

    it("L2 — 1900 is NOT a leap year (Gregorian century rule): falls back", () => {
      const fb = "1900-01-01T00:00:00Z";
      expect(parseTxDate("29/02/1900", fb).getTime()).toBe(new Date(fb).getTime());
    });

    it("L1 vs L2 — 2000 IS a leap year (divisible by 400): stays on Feb 29", () => {
      expect(parseTxDate("29/02/2000", "2000-01-01T00:00:00Z").getTime()).toBe(iso(2000, 1, 29));
    });
  });

  // --------------- L3: heuristic must NOT touch February ---------------
  describe("L3 — Feb inputs never leak into an adjacent year via the boundary heuristic", () => {
    it("non-leap 29 fev with created_at in Nov/Dec falls back (never rolls into next year)", () => {
      const nov = "2025-11-30T23:00:00Z";
      const dec = "2025-12-15T12:00:00Z";
      expect(parseTxDate("29 fev", nov).getTime()).toBe(new Date(nov).getTime());
      expect(parseTxDate("29 fev", dec).getTime()).toBe(new Date(dec).getTime());
      // Crucially, never lands in Feb 29 2026 either.
      expect(parseTxDate("29 fev", nov).getFullYear()).toBe(2025);
      expect(parseTxDate("29 fev", dec).getFullYear()).toBe(2025);
    });

    it("leap 29 fev with created_at in Jan/Fev keeps the fallback year", () => {
      const jan = parseTxDate("29 fev", "2024-01-05T00:00:00Z");
      const feb = parseTxDate("29 fev", "2024-02-28T23:59:00Z");
      expect(jan.getTime()).toBe(iso(2024, 1, 29));
      expect(feb.getTime()).toBe(iso(2024, 1, 29));
    });

    it("29/02 numeric with fallback near year boundary falls back (non-leap)", () => {
      const dec = "2026-12-31T23:59:59Z";
      const jan = "2026-01-01T00:00:01Z";
      expect(parseTxDate("29/02", dec).getTime()).toBe(new Date(dec).getTime());
      expect(parseTxDate("29/02", jan).getTime()).toBe(new Date(jan).getTime());
    });

    it("29-02 dash with fallback near year boundary — leap year still resolves to Feb 29", () => {
      const dec = parseTxDate("29-02", "2028-12-31T23:59:59Z");
      const jan = parseTxDate("29-02", "2028-01-01T00:00:01Z");
      expect(dec.getTime()).toBe(iso(2028, 1, 29));
      expect(jan.getTime()).toBe(iso(2028, 1, 29));
    });
  });


  // --------------- L4: canonicalization across encodings ---------------
  describe("L4 — every accepted encoding for the same leap date collapses to one timestamp", () => {
    it("2024-02-29: all separators & month-name variants are equal", () => {
      const canonical = iso(2024, 1, 29);
      const fb = "2024-08-15T10:00:00Z";
      const variants = [
        parseTxDate("29/02", fb),
        parseTxDate("29-02", fb),
        
        parseTxDate("29/02/2024", "2000-01-01T00:00:00Z"),
        parseTxDate("29-02-2024", "2000-01-01T00:00:00Z"),
        parseTxDate("2024-02-29", "2000-01-01T00:00:00Z"),
        parseTxDate("29 fev", fb),
        parseTxDate("29 Fev", fb),
        parseTxDate("29 fev.", fb),
        parseTxDate("29 Fev.", fb),
        parseTxDate("29 fevereiro", fb),
        parseTxDate("29 Fevereiro", fb),
        parseTxDate("29  fevereiro", fb), // double-space
      ];
      for (const v of variants) expect(v.getTime()).toBe(canonical);
    });
  });
});
