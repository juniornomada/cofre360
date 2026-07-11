import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * Env-var defaults are read at module load time via `defaultTolerance()`.
 * We re-import the module with different env stubs to validate each override.
 */

async function loadFresh() {
  vi.resetModules();
  return await import("../cycle-consistency");
}

describe("cycle-consistency env-var tolerance", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to 1 cent absolute and 0% relative when no env is set", async () => {
    const mod = await loadFresh();
    const t = mod.getCycleTolerance();
    expect(t.absolute).toBeCloseTo(0.01, 10);
    expect(t.percent).toBe(0);
  });

  it("respects VITE_CYCLE_TOLERANCE_CENTS", async () => {
    vi.stubEnv("VITE_CYCLE_TOLERANCE_CENTS", "5");
    const mod = await loadFresh();
    expect(mod.getCycleTolerance().absolute).toBeCloseTo(0.05, 10);
  });

  it("respects VITE_CYCLE_TOLERANCE_REAIS", async () => {
    vi.stubEnv("VITE_CYCLE_TOLERANCE_REAIS", "0.25");
    const mod = await loadFresh();
    expect(mod.getCycleTolerance().absolute).toBeCloseTo(0.25, 10);
  });

  it("CENTS wins over REAIS when both are set", async () => {
    vi.stubEnv("VITE_CYCLE_TOLERANCE_CENTS", "10");
    vi.stubEnv("VITE_CYCLE_TOLERANCE_REAIS", "9.99");
    const mod = await loadFresh();
    expect(mod.getCycleTolerance().absolute).toBeCloseTo(0.10, 10);
  });

  it("parses VITE_CYCLE_TOLERANCE_PERCENT as fraction", async () => {
    vi.stubEnv("VITE_CYCLE_TOLERANCE_PERCENT", "0.002");
    const mod = await loadFresh();
    expect(mod.getCycleTolerance().percent).toBeCloseTo(0.002, 10);
  });

  it("parses VITE_CYCLE_TOLERANCE_PERCENT as percent string (0.1%)", async () => {
    vi.stubEnv("VITE_CYCLE_TOLERANCE_PERCENT", "0.1%");
    const mod = await loadFresh();
    expect(mod.getCycleTolerance().percent).toBeCloseTo(0.001, 10);
  });

  it("ignores invalid env values and keeps defaults", async () => {
    vi.stubEnv("VITE_CYCLE_TOLERANCE_CENTS", "abc");
    vi.stubEnv("VITE_CYCLE_TOLERANCE_PERCENT", "not-a-number");
    const mod = await loadFresh();
    const t = mod.getCycleTolerance();
    expect(t.absolute).toBeCloseTo(0.01, 10);
    expect(t.percent).toBe(0);
  });

  it("ignores negative env values", async () => {
    vi.stubEnv("VITE_CYCLE_TOLERANCE_CENTS", "-5");
    vi.stubEnv("VITE_CYCLE_TOLERANCE_PERCENT", "-0.5");
    const mod = await loadFresh();
    const t = mod.getCycleTolerance();
    expect(t.absolute).toBeCloseTo(0.01, 10);
    expect(t.percent).toBe(0);
  });

  it("end-to-end: env-configured tolerance suppresses matching mismatch", async () => {
    vi.stubEnv("VITE_CYCLE_TOLERANCE_CENTS", "10"); // 10 cents
    const mod = await loadFresh();
    mod.enableCycleConsistencyCheck(true);
    mod.resetCycleConsistencyCheck();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mod.reportCycleSnapshot({ source: "home", cardId: "c1", periodKey: "k", total: 100.00, paid: 0, remaining: 100.00 });
    const mismatch = mod.reportCycleSnapshot({ source: "cards", cardId: "c1", periodKey: "k", total: 100.09, paid: 0, remaining: 100.09 });
    expect(mismatch).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
