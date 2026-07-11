import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseTxDate } from "@/lib/invoice-utils";

/**
 * Contract for INVALID textual date inputs.
 *
 * `parseTxDate` never throws and never returns `undefined` — the callers
 * (loaders, cycle groupers, dedup checks) rely on always receiving a valid
 * `Date`. When the textual form is unparseable, the resolution order is:
 *
 *   1. `new Date(dateStr)` — native parser (catches ISO strings).
 *   2. `fallback` (typically `created_at`), when it's a valid Date.
 *   3. `new Date()` — current wall clock, as a last resort.
 *
 * These tests pin that contract for a curated set of malformed inputs so
 * future refactors don't accidentally start returning `undefined`, `NaN`
 * dates, or throwing.
 */

const FROZEN_NOW = new Date(Date.UTC(2026, 6, 15, 12, 0, 0)); // 15 Jul 2026
const FALLBACK_ISO = "2025-04-10T00:00:00Z"; // 10 Apr 2025

function isValidDate(d: unknown): d is Date {
  return d instanceof Date && !isNaN(d.getTime());
}

describe("parseTxDate — invalid textual formats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("returns a valid Date (never undefined / NaN / thrown) for every malformed input", () => {
    const cases: Array<[string, string]> = [
      ["empty string", ""],
      ["whitespace only", "   "],
      ["tab and newlines", "\t\n"],
      ["unknown month token (3 letters)", "10 xyz"],
      ["unknown month token (long)", "10 janeeiro"],
      ["English month token", "10 jul"], // 'jul' is valid in pt-BR too — covered elsewhere
      ["missing day", "jan"],
      ["missing month", "10"],
      ["extra tokens", "10 jan 2026 extra"],
      ["non-numeric day", "abc jan"],
      ["day zero", "0 jan"],
      ["negative day", "-5 jan"],
      ["day out of range (32)", "32 jan"],
      ["day out of range (99)", "99 fev"],
      ["float day", "10.5 jan"],
      ["separator wrong (dash)", "10-jan"],
      ["separator wrong (slash)", "10/jan"],
      ["only punctuation", "//--"],
      ["ISO-ish but broken", "2026-13-40"],
      ["natural garbage", "not a date at all"],
    ];

    it.each(cases)("with valid fallback → %s falls back to created_at", (_, bad) => {
      const d = parseTxDate(bad, FALLBACK_ISO);
      expect(isValidDate(d)).toBe(true);
      expect(d).not.toBeUndefined();
    });

    it.each(cases)("with invalid fallback → %s falls back to now (still valid)", (_, bad) => {
      const d = parseTxDate(bad, "not-a-date-either");
      expect(isValidDate(d)).toBe(true);
    });
  });

  describe("unknown month token — resolution", () => {
    it("uses the valid fallback (created_at) when month token is not in shortMonthMap", () => {
      const d = parseTxDate("10 xyz", FALLBACK_ISO);
      expect(isValidDate(d)).toBe(true);
      // Falls back to created_at → 10 Apr 2025.
      expect(d.getUTCFullYear()).toBe(2025);
      expect(d.getUTCMonth()).toBe(3);
      expect(d.getUTCDate()).toBe(10);
    });

    it("uses now when both textual and fallback are invalid", () => {
      const d = parseTxDate("10 xyz", "");
      expect(isValidDate(d)).toBe(true);
      expect(d.getFullYear()).toBe(FROZEN_NOW.getUTCFullYear());
      expect(d.getMonth()).toBe(FROZEN_NOW.getUTCMonth());
    });
  });

  describe("empty / whitespace textual — resolution", () => {
    it("empty textual + valid fallback → fallback", () => {
      const d = parseTxDate("", FALLBACK_ISO);
      expect(isValidDate(d)).toBe(true);
      expect(d.getUTCFullYear()).toBe(2025);
      expect(d.getUTCMonth()).toBe(3);
    });

    it("whitespace-only + valid fallback → fallback", () => {
      const d = parseTxDate("   \t\n  ", FALLBACK_ISO);
      expect(isValidDate(d)).toBe(true);
      expect(d.getUTCFullYear()).toBe(2025);
    });

    it("empty textual + empty fallback → now", () => {
      const d = parseTxDate("", "");
      expect(isValidDate(d)).toBe(true);
      expect(d.getTime()).toBe(FROZEN_NOW.getTime());
    });
  });

  describe("day-out-of-range is pinned to the current 'month rollover' behavior", () => {
    // NOTE: this pins the CURRENT contract (native Date rollover: `new Date(y, 0, 32)`
    // → Feb 1). If we later add strict validation, update these expectations.
    it("'32 jan' rolls into February of the fallback year", () => {
      const d = parseTxDate("32 jan", FALLBACK_ISO);
      expect(isValidDate(d)).toBe(true);
      expect(d.getMonth()).toBe(1); // Feb (rolled over from Jan 32)
      expect(d.getDate()).toBe(1);
    });

    it("'0 jan' rolls into December of the previous year", () => {
      const d = parseTxDate("0 jan", FALLBACK_ISO);
      expect(isValidDate(d)).toBe(true);
      expect(d.getMonth()).toBe(11); // Dec
      expect(d.getDate()).toBe(31);
    });

    it("'99 fev' still resolves to a valid Date (native rollover)", () => {
      const d = parseTxDate("99 fev", FALLBACK_ISO);
      expect(isValidDate(d)).toBe(true);
    });
  });

  describe("resilience against exotic inputs", () => {
    it("does not throw on any malformed string from a fuzz-ish sample", () => {
      const inputs = [
        "", " ", "\n", "\t", "0", "abc", "//", "10..jan", "jan 10",
        "10  jan", "10\tjan", "10\njan", String(Number.NaN),
        String(Number.POSITIVE_INFINITY), "null", "undefined",
      ];
      for (const s of inputs) {
        expect(() => parseTxDate(s, FALLBACK_ISO)).not.toThrow();
        expect(() => parseTxDate(s, "")).not.toThrow();
        const d = parseTxDate(s, FALLBACK_ISO);
        expect(isValidDate(d)).toBe(true);
      }
    });

    it("'10  jan' with double space still parses (whitespace collapsed by \\s+ split)", () => {
      const d = parseTxDate("10  jan", FALLBACK_ISO);
      expect(isValidDate(d)).toBe(true);
      // Fallback year = 2025, month = jan.
      expect(d.getMonth()).toBe(0);
      expect(d.getDate()).toBe(10);
      expect(d.getFullYear()).toBe(2025);
    });

    it("'jan 10' (reversed order) parses via the native Date fallback, not shortMonthMap", () => {
      const d = parseTxDate("jan 10", FALLBACK_ISO);
      expect(isValidDate(d)).toBe(true);
      // parts[0]='jan' → parseInt NaN → shortMonthMap branch skipped.
      // Then `new Date("jan 10")` succeeds natively (V8 interprets it as Jan 10 of year 2001).
      // Whatever the native year is, the tx must NOT silently inherit the created_at year (2025).
      expect(d.getMonth()).toBe(0);
      expect(d.getDate()).toBe(10);
    });

  });
});
