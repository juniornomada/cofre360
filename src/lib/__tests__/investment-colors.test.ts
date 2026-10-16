import { describe, expect, it } from "vitest";
import {
  ASSET_CLASS_COLORS,
  INVESTMENT_COLOR_OPTIONS,
  getAssetClassColor,
  getInvestmentColor,
  normalizeInvestmentColor,
} from "@/lib/investment-colors";

describe("Individual investment colors", () => {
  it("preserves original category colors on investments without a custom color", () => {
    expect(getInvestmentColor(null, "cdb")).toBe("#22C55E");
    expect(getInvestmentColor(undefined, "fii")).toBe("#14B8A6");
    expect(getInvestmentColor("", "tesouro")).toBe("#EAB308");
    expect(getInvestmentColor(null, "unrecognized")).toBe("#94A3B8");
  });

  it("lets two investments from the same category use different colors", () => {
    expect(getInvestmentColor("#663399", "cdb")).toBe("#663399");
    expect(getInvestmentColor("#ff0000", "cdb")).toBe("#FF0000");
    expect(getAssetClassColor("cdb")).toBe("#22C55E");
  });

  it("never accepts arbitrary CSS in user-controlled color values", () => {
    for (const invalid of ["red", "var(--color)", "url(http://example.com)", "#fff", "#12345678", " #123456", "#12345G", ""]) {
      expect(normalizeInvestmentColor(invalid)).toBeNull();
      expect(getInvestmentColor(invalid, "etf")).toBe("#6366F1");
    }
  });

  it("includes the existing app palette and keeps it unique", () => {
    const colors = INVESTMENT_COLOR_OPTIONS.map((x) => x.value);
    expect(new Set(colors).size).toBe(colors.length);
    for (const color of colors) {
      expect(normalizeInvestmentColor(color)).toBe(color);
      expect(Object.values(ASSET_CLASS_COLORS)).toContain(color);
    }
  });

  it("does not change the asset-class chart colors when an individual fund is personalized", () => {
    expect(getInvestmentColor("#F97316", "fii")).toBe("#F97316");
    expect(getAssetClassColor("fii")).toBe("#14B8A6");
  });
});
