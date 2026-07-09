import { describe, it, expect } from "vitest";
import { changeInstallmentCount, computeTotal } from "../installment-mode-toggle";

describe("changeInstallmentCount — preserves economic total across N changes", () => {
  it("divide mode: total stays put when N grows", () => {
    const out = changeInstallmentCount({ mode: "divide", amount: 1200, prevCount: 4, newCount: 6 });
    expect(out.mode).toBe("divide");
    expect(out.amount).toBe(1200);
    expect(out.total).toBe(1200);
    expect(out.fixedValue).toBe(200);
  });

  it("divide mode: total stays put when N shrinks", () => {
    const out = changeInstallmentCount({ mode: "divide", amount: 1000, prevCount: 10, newCount: 2 });
    expect(out.amount).toBe(1000);
    expect(out.fixedValue).toBe(500);
    expect(out.total).toBe(1000);
  });

  it("fixed mode: per-parcela recomputes so parcela × N stays equal to prev total", () => {
    // Was fixed R$ 250 × 4 = R$ 1000. Switch to 5x → each parcela = R$ 200.
    const out = changeInstallmentCount({ mode: "fixed", amount: 250, prevCount: 4, newCount: 5 });
    expect(out.mode).toBe("fixed");
    expect(out.amount).toBe(200);
    expect(out.fixedValue).toBe(200);
    expect(out.total).toBe(1000);
  });

  it("fixed mode: shrinking N raises per-parcela while total is preserved", () => {
    // Was fixed R$ 100 × 12 = R$ 1200. Switch to 3x → each parcela = R$ 400.
    const out = changeInstallmentCount({ mode: "fixed", amount: 100, prevCount: 12, newCount: 3 });
    expect(out.amount).toBe(400);
    expect(out.total).toBe(1200);
  });

  it("fixed mode: non-integer division rounds cleanly to 2 decimals", () => {
    // R$ 100 × 3 = R$ 300; split into 7x → 42.857… → 42.86 (parcela × N ≈ 300.02).
    const out = changeInstallmentCount({ mode: "fixed", amount: 100, prevCount: 3, newCount: 7 });
    expect(out.amount).toBeCloseTo(42.86, 2);
    expect(out.total).toBe(300);
  });

  it("idempotent: prevCount === newCount is a no-op in both modes", () => {
    const div = changeInstallmentCount({ mode: "divide", amount: 999.99, prevCount: 6, newCount: 6 });
    expect(div.amount).toBe(999.99);
    const fix = changeInstallmentCount({ mode: "fixed", amount: 83.33, prevCount: 6, newCount: 6 });
    expect(fix.amount).toBe(83.33);
    expect(fix.total).toBe(round2(83.33 * 6));
  });

  it("computeTotal after changeInstallmentCount matches the invariant", () => {
    // divide: total is exactly what the user typed.
    const a = changeInstallmentCount({ mode: "divide", amount: 750, prevCount: 3, newCount: 5 });
    expect(computeTotal(a.mode, a.amount, a.fixedValue, 5)).toBe(750);

    // fixed: total = new per × new N, and equals prev per × prev N.
    const b = changeInstallmentCount({ mode: "fixed", amount: 150, prevCount: 8, newCount: 4 });
    expect(computeTotal(b.mode, b.amount, b.fixedValue, 4)).toBe(1200);
    expect(150 * 8).toBe(1200);
  });

  it("degenerate counts (0 / NaN) are clamped to 1 without breaking invariants", () => {
    const out = changeInstallmentCount({ mode: "fixed", amount: 200, prevCount: 0, newCount: Number.NaN });
    // prev clamps to 1 → total = 200; new clamps to 1 → per = 200.
    expect(out.amount).toBe(200);
    expect(out.total).toBe(200);
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
