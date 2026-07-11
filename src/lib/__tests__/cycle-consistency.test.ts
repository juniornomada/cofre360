import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  reportCycleSnapshot,
  resetCycleConsistencyCheck,
  enableCycleConsistencyCheck,
  configureCycleTolerance,
  getCycleTolerance,
  _debugSnapshots,
} from "../cycle-consistency";

describe("cycle-consistency", () => {
  beforeEach(() => {
    resetCycleConsistencyCheck();
    enableCycleConsistencyCheck(true);
    configureCycleTolerance({ absolute: 0.01, percent: 0 });
    vi.restoreAllMocks();
  });
  afterEach(() => {
    configureCycleTolerance(null);
  });

  it("does not warn when a single source reports", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mismatch = reportCycleSnapshot({
      source: "home",
      cardId: "c1",
      periodKey: "2026-07-10",
      total: 100,
      paid: 40,
      remaining: 60,
    });
    expect(mismatch).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn when two sources agree within 1 cent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportCycleSnapshot({ source: "home", cardId: "c1", periodKey: "k", total: 100.001, paid: 40, remaining: 60.001 });
    const mismatch = reportCycleSnapshot({ source: "cards", cardId: "c1", periodKey: "k", total: 100, paid: 40, remaining: 60 });
    expect(mismatch).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns exactly once when sources disagree on total", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportCycleSnapshot({ source: "home", cardId: "c1", periodKey: "k", total: 100, paid: 0, remaining: 100 });
    const mismatch = reportCycleSnapshot({ source: "cards", cardId: "c1", periodKey: "k", total: 250, paid: 0, remaining: 250 });
    expect(mismatch).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    // Second time reporting the same mismatch shouldn't spam the console.
    reportCycleSnapshot({ source: "home", cardId: "c1", periodKey: "k", total: 100, paid: 0, remaining: 100 });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("warns when only the paid amount diverges", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportCycleSnapshot({ source: "home", cardId: "c1", periodKey: "k", total: 200, paid: 0, remaining: 200 });
    reportCycleSnapshot({ source: "cards", cardId: "c1", periodKey: "k", total: 200, paid: 100, remaining: 100 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("Divergência");
  });

  it("segregates by cardId + periodKey", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportCycleSnapshot({ source: "home", cardId: "A", periodKey: "k1", total: 100, paid: 0, remaining: 100 });
    reportCycleSnapshot({ source: "cards", cardId: "B", periodKey: "k1", total: 999, paid: 0, remaining: 999 });
    reportCycleSnapshot({ source: "cards", cardId: "A", periodKey: "k2", total: 500, paid: 0, remaining: 500 });
    expect(warn).not.toHaveBeenCalled();
    expect(Object.keys(_debugSnapshots())).toHaveLength(3);
  });

  it("is a no-op when disabled", () => {
    enableCycleConsistencyCheck(false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportCycleSnapshot({ source: "home", cardId: "c1", periodKey: "k", total: 100, paid: 0, remaining: 100 });
    reportCycleSnapshot({ source: "cards", cardId: "c1", periodKey: "k", total: 999, paid: 0, remaining: 999 });
    expect(warn).not.toHaveBeenCalled();
  });

  describe("configurable tolerance", () => {
    it("default tolerance is 1 cent absolute, 0% relative", () => {
      configureCycleTolerance(null);
      const t = getCycleTolerance();
      expect(t.absolute).toBeCloseTo(0.01, 10);
      expect(t.percent).toBe(0);
    });

    it("widening absolute tolerance suppresses small mismatches", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      configureCycleTolerance({ absolute: 0.05, percent: 0 });
      reportCycleSnapshot({ source: "home", cardId: "c1", periodKey: "k", total: 100.00, paid: 0, remaining: 100.00 });
      const mismatch = reportCycleSnapshot({ source: "cards", cardId: "c1", periodKey: "k", total: 100.04, paid: 0, remaining: 100.04 });
      expect(mismatch).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    });

    it("tightening below 1 cent flags sub-cent drifts", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      configureCycleTolerance({ absolute: 0.0001, percent: 0 });
      reportCycleSnapshot({ source: "home", cardId: "c1", periodKey: "k", total: 100.000, paid: 0, remaining: 100.000 });
      const mismatch = reportCycleSnapshot({ source: "cards", cardId: "c1", periodKey: "k", total: 100.005, paid: 0, remaining: 100.005 });
      expect(mismatch).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it("percent tolerance scales with magnitude", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      // 0.1% of 10000 = 10 -> 5 reais of drift is tolerated
      configureCycleTolerance({ absolute: 0.01, percent: 0.001 });
      reportCycleSnapshot({ source: "home", cardId: "c1", periodKey: "k", total: 10000, paid: 0, remaining: 10000 });
      const mismatch = reportCycleSnapshot({ source: "cards", cardId: "c1", periodKey: "k", total: 10005, paid: 0, remaining: 10005 });
      expect(mismatch).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    });

    it("percent tolerance still flags drifts exceeding the relative bound", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      configureCycleTolerance({ absolute: 0.01, percent: 0.001 }); // 0.1%
      reportCycleSnapshot({ source: "home", cardId: "c1", periodKey: "k", total: 10000, paid: 0, remaining: 10000 });
      const mismatch = reportCycleSnapshot({ source: "cards", cardId: "c1", periodKey: "k", total: 10050, paid: 0, remaining: 10050 });
      expect(mismatch).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it("uses max(absolute, percent*magnitude) — absolute wins for small values", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      // 0.1% of 1 = 0.001, but absolute floor is 0.01
      configureCycleTolerance({ absolute: 0.01, percent: 0.001 });
      reportCycleSnapshot({ source: "home", cardId: "c1", periodKey: "k", total: 1.00, paid: 0, remaining: 1.00 });
      const mismatch = reportCycleSnapshot({ source: "cards", cardId: "c1", periodKey: "k", total: 1.008, paid: 0, remaining: 1.008 });
      expect(mismatch).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    });

    it("negative or invalid values fall back to previous setting", () => {
      configureCycleTolerance({ absolute: 0.05, percent: 0.002 });
      configureCycleTolerance({ absolute: -1, percent: -0.5 });
      const t = getCycleTolerance();
      expect(t.absolute).toBeCloseTo(0.05, 10);
      expect(t.percent).toBeCloseTo(0.002, 10);
    });
  });
});
