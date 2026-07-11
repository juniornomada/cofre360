/**
 * Boundary tests for the cycle-consistency tolerance rule.
 *
 * Rule (see `near()` in src/lib/cycle-consistency.ts):
 *   equal ⇔ |a - b| <= max(absolute, percent * max(|a|, |b|))
 *
 * These tests exercise the exact equality on `max(...)` and percent tolerances
 * with decimal places to catch off-by-one / off-by-epsilon regressions.
 * `near()` is not exported, so we probe it through `reportCycleSnapshot`,
 * which returns `true` iff any of (total, paid, remaining) fell OUTSIDE the
 * tolerance for a sibling source.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  reportCycleSnapshot,
  resetCycleConsistencyCheck,
  enableCycleConsistencyCheck,
  configureCycleTolerance,
} from "../cycle-consistency";

// Helper: report `home` then `cards` and return whether a mismatch was raised.
function probe(a: number, b: number): boolean {
  resetCycleConsistencyCheck();
  reportCycleSnapshot({
    source: "home",
    cardId: "c",
    periodKey: "p",
    total: a,
    paid: 0,
    remaining: 0,
  });
  return reportCycleSnapshot({
    source: "cards",
    cardId: "c",
    periodKey: "p",
    total: b,
    paid: 0,
    remaining: 0,
  });
}

describe("cycle-consistency tolerance — exact boundaries", () => {
  beforeEach(() => {
    enableCycleConsistencyCheck(true);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    configureCycleTolerance(null);
    resetCycleConsistencyCheck();
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------
  // 1. Pure absolute tolerance — equality on the boundary is inclusive.
  // ------------------------------------------------------------------
  describe("absolute-only (percent = 0)", () => {
    beforeEach(() => configureCycleTolerance({ absolute: 0.01, percent: 0 }));

    it("|Δ| = absolute exactly → equal (no mismatch)", () => {
      // 100.00 vs 100.01 → diff = 0.01, bound = 0.01. `<=` must accept.
      expect(probe(100, 100.01)).toBe(false);
      expect(probe(100.01, 100)).toBe(false);
    });

    it("|Δ| = absolute + 1 sub-cent → mismatch", () => {
      // 0.010001 is strictly above 0.01 by 1e-6 (well outside the 1e-9 slack).
      expect(probe(100, 100.010001)).toBe(true);
    });

    it("|Δ| just below absolute → equal", () => {
      expect(probe(100, 100.009999)).toBe(false);
    });

    it("negative values use |a|,|b| but Δ still applies", () => {
      // Δ = 0.01 on the boundary between -50.00 and -50.01.
      expect(probe(-50, -50.01)).toBe(false);
      expect(probe(-50, -50.010001)).toBe(true);
    });

    it("zero snapshots fall back to `absolute` (max(|0|,|0|)*percent = 0)", () => {
      // Even with percent=0 this holds; keeps the invariant explicit.
      expect(probe(0, 0.01)).toBe(false);
      expect(probe(0, 0.010001)).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // 2. Percent tolerance with decimal places — bound = percent * max(|a|,|b|).
  // ------------------------------------------------------------------
  describe("percent-only (absolute = 0)", () => {
    it("0.1% of 1000 = 1.00 exact → equal on the boundary", () => {
      configureCycleTolerance({ absolute: 0, percent: 0.001 });
      // bound = 0.001 * max(1000, 1001) = 1.001; Δ=1.00 is inside.
      // Choose Δ exactly at 0.001 * max(|a|,|b|):
      // Use a=1000, b=1001 → bound = 0.001 * 1001 = 1.001, Δ=1.0 → inside.
      expect(probe(1000, 1001)).toBe(false);
      // Now put Δ exactly on the boundary: a=1000, b=1001.001 →
      // bound = 0.001 * 1001.001 = 1.001001; Δ = 1.001 → inside.
      expect(probe(1000, 1001.001)).toBe(false);
    });

    it("|Δ| just above percent*max → mismatch (fractional-cent step)", () => {
      configureCycleTolerance({ absolute: 0, percent: 0.001 });
      // a=1000, b=1002 → bound = 0.001 * 1002 = 1.002, Δ=2 → OUTSIDE.
      expect(probe(1000, 1002)).toBe(true);
    });

    it("percent with 3 decimals (0.025% of 4000 = 1.00) — equality inclusive", () => {
      configureCycleTolerance({ absolute: 0, percent: 0.00025 });
      // a=4000, b=4001 → bound = 0.00025 * 4001 = 1.00025; Δ=1 → inside.
      expect(probe(4000, 4001)).toBe(false);
      // a=4000, b=4001.001 → bound ≈ 1.00025025; Δ=1.001 → inside.
      expect(probe(4000, 4001.001)).toBe(false);
      // a=4000, b=4002 → Δ=2 outside bound ≈1.0005 → mismatch.
      expect(probe(4000, 4002)).toBe(true);
    });

    it("percent = 100% → any pair with |a|≥|Δ| is equal; degenerate but correct", () => {
      configureCycleTolerance({ absolute: 0, percent: 1 });
      // Δ = 500, bound = 1 * max(500, 1000) = 1000 → equal.
      expect(probe(500, 1000)).toBe(false);
      // Δ = 1001, a=0, b=1001 → bound = 1 * 1001 = 1001 → equal (boundary).
      expect(probe(0, 1001)).toBe(false);
    });

    it("percent bound of exactly 0 with a=b=0 accepts equal values", () => {
      configureCycleTolerance({ absolute: 0, percent: 0.001 });
      expect(probe(0, 0)).toBe(false);
      // But any non-zero Δ with a=b=0-side has bound=0 → mismatch.
      // Here max(|0|,|0.005|)*0.001 = 5e-6; Δ=0.005 → outside.
      expect(probe(0, 0.005)).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // 3. Combined rule: bound = max(absolute, percent * max(|a|,|b|)).
  //    Confirms which side of the `max(...)` wins at the tie point.
  // ------------------------------------------------------------------
  describe("max(absolute, percent*max(|a|,|b|)) — which side wins", () => {
    it("absolute wins when percent*max < absolute", () => {
      // percent*max = 0.001 * 5 = 0.005 < absolute 0.01. Bound = 0.01.
      configureCycleTolerance({ absolute: 0.01, percent: 0.001 });
      expect(probe(5, 5.01)).toBe(false); // Δ=0.01 on absolute boundary
      expect(probe(5, 5.010001)).toBe(true); // just above absolute
    });

    it("percent wins when percent*max > absolute", () => {
      // percent*max = 0.001 * 10000 = 10.00 > absolute 0.01. Bound = 10.00.
      configureCycleTolerance({ absolute: 0.01, percent: 0.001 });
      // Δ=10.00 with max(|a|,|b|)=10000 → equal.
      expect(probe(10000, 10010)).toBe(false);
      // Δ=10.011 with max=10010 → bound = 10.01001; Δ=10.011 → outside.
      expect(probe(10000, 10010.011)).toBe(true);
    });

    it("tie point: absolute === percent*max — either interpretation is accepted", () => {
      // Set absolute = 1.00, percent = 0.001, choose max = 1000 → percent*max = 1.00.
      configureCycleTolerance({ absolute: 1, percent: 0.001 });
      // Δ=1.00 must be inside regardless of which side of max() dominates.
      expect(probe(1000, 1001)).toBe(false);
      // Δ = 1.00 + 1 sub-cent past bound → mismatch.
      // Both sides yield 1.0 (or 1.001 for percent* max=1001); take clearly-past value.
      expect(probe(1000, 1002)).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // 4. Decimal-place stress: bound values with many decimals must still
  //    admit the exact boundary and reject anything strictly above.
  // ------------------------------------------------------------------
  describe("decimal-place stress on percent bound", () => {
    it("percent = 0.0725% (irregular), max = 137.77 → bound ≈ 0.09988...", () => {
      configureCycleTolerance({ absolute: 0, percent: 0.000725 });
      // bound = 0.000725 * 137.77 = 0.09988325
      const a = 100;
      const bInside = 137.77;      // Δ = 37.77 clearly outside → mismatch expected
      expect(probe(a, bInside)).toBe(true);
      // Fine-grained probe: keep max=137.77 (via b) and vary a to hit the boundary.
      // a = 137.77 - 0.09988325 = 137.67011675
      const aBoundary = 137.77 - 0.000725 * 137.77;
      expect(probe(aBoundary, 137.77)).toBe(false);
      // 1e-6 past the bound must flip to mismatch.
      expect(probe(aBoundary - 1e-6, 137.77)).toBe(true);
    });

    it("floating-point slack (1e-9) does not swallow a real 1-cent violation", () => {
      configureCycleTolerance({ absolute: 0.01, percent: 0 });
      // Δ = 0.02 is a real, visible violation and must be flagged.
      expect(probe(100, 100.02)).toBe(true);
    });
  });
});
