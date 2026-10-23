import { describe, expect, it } from "vitest";
import {
  daysBetween,
  iofRateForDays,
  irRateForDays,
  valuate,
  type Investment,
} from "@/lib/investments-calc";

const makeInvestment = (overrides: Partial<Investment> = {}): Investment => ({
  id: "inv-1",
  name: "CDB exemplo",
  icon: "📈",
  value: 1000,
  invested_amount: 1000,
  change: 0,
  type: "Renda fixa",
  asset_class: "cdb",
  asset_code: null,
  quantity: null,
  purchase_price: null,
  purchase_date: "2026-10-01",
  admin_fee: 0,
  yield_rate: null,
  maturity_date: null,
  current_price: null,
  last_quote_at: null,
  current_gross_value: 1100,
  current_net_value: null,
  ...overrides,
});

describe("Invest — patrimônio líquido após impostos", () => {
  it("uses calendar days, not rounded fractional hours, for tax brackets", () => {
    expect(daysBetween(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-16T12:00:00Z"))).toBe(15);
    expect(daysBetween(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-31T12:00:00Z"))).toBe(30);
  });

  it("uses the official day-by-day IOF rates, then zero from day 30", () => {
    expect(iofRateForDays(1)).toBe(0.96);
    expect(iofRateForDays(2)).toBe(0.93);
    expect(iofRateForDays(15)).toBe(0.5);
    expect(iofRateForDays(29)).toBe(0.03);
    expect(iofRateForDays(30)).toBe(0);
    expect(iofRateForDays(365)).toBe(0);
  });

  it("calculates CDB IOF first and IR over gains after IOF", () => {
    const result = valuate(makeInvestment(), new Date("2026-10-16T12:00:00Z"));
    expect(result.grossValue).toBe(1100);
    expect(result.invested).toBe(1000);
    expect(result.estimatedIOF).toBeCloseTo(50, 6);
    expect(result.estimatedTax).toBeCloseTo(11.25, 6);
    expect(result.netValue).toBeCloseTo(1038.75, 6);
    expect(result.netEstimateComplete).toBe(true);
  });

  it("does not charge IOF after 30 days and applies regressively reduced IR", () => {
    const result = valuate(makeInvestment(), new Date("2026-10-31T12:00:00Z"));
    expect(result.estimatedIOF).toBe(0);
    expect(result.estimatedTax).toBeCloseTo(22.5);
    expect(result.netValue).toBeCloseTo(1077.5);
    expect(irRateForDays(200)).toBe(0.20);
    expect(irRateForDays(721)).toBe(0.15);
  });

  it("uses a provider-supplied net balance as the single source of truth", () => {
    const result = valuate(
      makeInvestment({ current_net_value: 1050 }),
      new Date("2026-10-16T12:00:00Z"),
    );
    expect(result.netValue).toBe(1050);
    expect(result.estimatedTax).toBe(0); // do not reclassify manual gross-net difference
    expect(result.estimatedIOF).toBe(0);
    expect(result.netEstimateComplete).toBe(true);
  });

  it("estimates taxation of a CDB when the gross amount was entered manually", () => {
    const result = valuate(
      makeInvestment({ asset_class: "tesouro", admin_fee: 0.20 }),
      new Date("2026-10-31T12:00:00Z"),
    );
    expect(result.estimatedAdminFee).toBeGreaterThan(0);
    expect(result.netValue).toBeLessThan(result.grossValue);
  });

  it("keeps stock market values without fabricated withholding and warns estimation is incomplete", () => {
    const result = valuate(makeInvestment({
      asset_class: "acao",
      quantity: 10,
      purchase_price: 100,
      current_price: 110,
      current_gross_value: null,
    }), new Date("2026-10-23T12:00:00Z"));
    expect(result.netValue).toBe(result.grossValue);
    expect(result.netEstimateComplete).toBe(false);
  });

  it("does not invent a fixed income net without an investment date", () => {
    const result = valuate(makeInvestment({ purchase_date: null }));
    expect(result.netValue).toBe(result.grossValue);
    expect(result.netEstimateComplete).toBe(false);
  });

  it("preserves the automatic yield-based calculation when no manual values exist", () => {
    const result = valuate(makeInvestment({
      current_gross_value: null,
      invested_amount: 1000,
      yield_rate: 12,
    }), new Date("2026-10-16T12:00:00Z"));
    expect(result.grossValue).toBeGreaterThan(1000);
    expect(result.estimatedIOF).toBeGreaterThan(0);
    expect(result.estimatedTax).toBeGreaterThan(0);
    expect(result.netValue).toBeLessThan(result.grossValue);
  });
});
