import { describe, expect, it } from "vitest";
import { buildInstallmentCurrentCorrectionPlan } from "@/lib/installment-edit";

describe("installment current correction plan", () => {
  it("expands a partial 3/4 launch to 2/4", () => {
    const plan = buildInstallmentCurrentCorrectionPlan([4], 3, 2, 4);
    expect(plan.conflict).toBeNull();
    expect(plan.desiredNumbers).toEqual([2, 3, 4]);
    expect(plan.reusableOtherCount).toBe(1);
    expect(plan.insertNumbers).toEqual([4]);
    expect(plan.deleteOtherNumbers).toEqual([]);
  });

  it("shrinks a partial 2/4 launch to 3/4", () => {
    const plan = buildInstallmentCurrentCorrectionPlan([3, 4], 2, 3, 4);
    expect(plan.conflict).toBeNull();
    expect(plan.desiredNumbers).toEqual([3, 4]);
    expect(plan.reusableOtherCount).toBe(1);
    expect(plan.insertNumbers).toEqual([]);
    expect(plan.deleteOtherNumbers).toEqual([4]);
  });

  it("blocks renumbering into an installment that already exists before the edited row", () => {
    const plan = buildInstallmentCurrentCorrectionPlan([1, 2, 4], 3, 2, 4);
    expect(plan.conflict).toContain("Já existe a parcela 2/4");
  });
});
