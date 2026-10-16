import { describe, expect, it } from "vitest";
import { colorOptions } from "@/components/cards/card-color-options";
import { normalizeInvestmentColor } from "@/lib/investment-color";

describe("investment color preferences", () => {
  it("accepts the same 15 colors offered by the card palette", () => {
    expect(colorOptions).toHaveLength(15);
    for (const option of colorOptions) {
      expect(normalizeInvestmentColor(option.value)).toBe(option.value);
    }
  });

  it("keeps existing investments without a custom color unchanged", () => {
    expect(normalizeInvestmentColor(null)).toBeNull();
    expect(normalizeInvestmentColor(undefined)).toBeNull();
    expect(normalizeInvestmentColor("")).toBeNull();
  });

  it("never renders an arbitrary untrusted CSS class", () => {
    expect(normalizeInvestmentColor("bg-red-900")).toBeNull();
    expect(normalizeInvestmentColor("javascript:alert(1)")).toBeNull();
    expect(normalizeInvestmentColor("from-pink-400 to-pink-700 hover:opacity-0")).toBeNull();
  });
});
