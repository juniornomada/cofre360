import { describe, it, expect } from "vitest";
import {
  toDivideMode,
  toFixedMode,
  computeTotal,
  validateInstallmentInputs,
} from "../installment-mode-toggle";
import { calculateInstallmentDetails } from "../installment-utils";

describe("installment mode toggle — total consistency", () => {
  it("divide → fixed: divides the total into equal parcelas", () => {
    const out = toFixedMode({ fromMode: "divide", amount: 1000, fixedValue: 0, count: 4 });
    expect(out.mode).toBe("fixed");
    expect(out.amount).toBe(250);
    expect(out.fixedValue).toBe(250);
    expect(out.total).toBe(1000);
  });

  it("fixed → divide: multiplies parcela × N back into the total", () => {
    const out = toDivideMode({ fromMode: "fixed", amount: 250, fixedValue: 250, count: 4 });
    expect(out.mode).toBe("divide");
    expect(out.amount).toBe(1000);
    expect(out.total).toBe(1000);
  });

  it("round-trip divide→fixed→divide preserves the total (clean division)", () => {
    const a = toFixedMode({ fromMode: "divide", amount: 1200, fixedValue: 0, count: 6 });
    const b = toDivideMode({ fromMode: "fixed", amount: a.amount, fixedValue: a.fixedValue, count: 6 });
    expect(b.amount).toBe(1200);
  });

  it("round-trip fixed→divide→fixed preserves the per-parcela value", () => {
    const a = toDivideMode({ fromMode: "fixed", amount: 199.9, fixedValue: 199.9, count: 3 });
    const b = toFixedMode({ fromMode: "divide", amount: a.amount, fixedValue: 0, count: 3 });
    expect(b.amount).toBe(199.9);
    expect(b.total).toBe(599.7);
  });

  it("handles rounding when total does not divide cleanly (R$ 100 / 3)", () => {
    const out = toFixedMode({ fromMode: "divide", amount: 100, fixedValue: 0, count: 3 });
    // 100 / 3 = 33.3333... rounded to 33.33; total × N = 99.99 (1 cent diff, expected)
    expect(out.amount).toBe(33.33);
    expect(out.total).toBe(99.99);
    // The 1-cent diff also matches what calculateInstallmentDetails reports in divide mode
    const details = calculateInstallmentDetails(100, 3, "divide");
    expect(details.valorParcela).toBe(33.33);
    expect(details.diff).toBe(-0.01);
  });

  it("does not lose money when toggling with count = 1", () => {
    const a = toFixedMode({ fromMode: "divide", amount: 500, fixedValue: 0, count: 1 });
    expect(a.amount).toBe(500);
    expect(a.total).toBe(500);
    const b = toDivideMode({ fromMode: "fixed", amount: 500, fixedValue: 500, count: 1 });
    expect(b.amount).toBe(500);
  });

  it("treats invalid/zero counts as N=1 (defensive)", () => {
    const out = toFixedMode({ fromMode: "divide", amount: 300, fixedValue: 0, count: 0 });
    expect(out.amount).toBe(300);
    expect(out.total).toBe(300);
  });

  it("computeTotal agrees with calculateInstallmentDetails on the total", () => {
    // divide mode: total is the amount itself
    expect(computeTotal("divide", 1000, 0, 4)).toBe(1000);
    // fixed mode: total is parcela × N
    expect(computeTotal("fixed", 0, 250, 4)).toBe(1000);
    // matches installment-utils
    const d1 = calculateInstallmentDetails(1000, 4, "divide");
    const d2 = calculateInstallmentDetails(0, 4, "fixed", 250);
    expect(d1.totalCalculado).toBe(1000);
    expect(d2.totalCalculado).toBe(1000);
  });

  it("re-toggling to the same mode is idempotent", () => {
    const a = toFixedMode({ fromMode: "fixed", amount: 250, fixedValue: 250, count: 4 });
    expect(a.amount).toBe(250);
    expect(a.fixedValue).toBe(250);
    expect(a.total).toBe(1000);

    const b = toDivideMode({ fromMode: "divide", amount: 1000, fixedValue: 0, count: 4 });
    expect(b.amount).toBe(1000);
    expect(b.total).toBe(1000);
  });
});

describe("installment inputs validation", () => {
  it("rejects zero/negative total in divide mode", () => {
    expect(validateInstallmentInputs("divide", 0, 0, 3)).toMatch(/valor total/i);
    expect(validateInstallmentInputs("divide", -10, 0, 3)).toMatch(/valor total/i);
  });

  it("rejects zero/negative parcela in fixed mode", () => {
    expect(validateInstallmentInputs("fixed", 0, 0, 3)).toMatch(/valor por parcela/i);
  });

  it("accepts valid inputs in both modes", () => {
    expect(validateInstallmentInputs("divide", 1000, 0, 4)).toBeNull();
    expect(validateInstallmentInputs("fixed", 250, 250, 4)).toBeNull();
    // fixed mode accepts value coming from `amount` when fixedValue is not set yet
    expect(validateInstallmentInputs("fixed", 250, 0, 4)).toBeNull();
  });
});
