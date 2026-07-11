import { describe, it, expect } from "vitest";
import { parseTxDate } from "../invoice-utils";

// Reference fallback: created_at in July 2026.
const CREATED_AT = "2026-07-15T12:00:00Z";

function ym(d: Date) {
  return { y: d.getFullYear(), m: d.getMonth(), day: d.getDate() };
}

describe("parseTxDate — numeric textual dates (separators & order)", () => {
  it("pt-BR DD/MM without year uses fallback year", () => {
    expect(ym(parseTxDate("10/07", CREATED_AT))).toEqual({ y: 2026, m: 6, day: 10 });
  });

  it("pt-BR DD-MM without year uses fallback year", () => {
    expect(ym(parseTxDate("10-07", CREATED_AT))).toEqual({ y: 2026, m: 6, day: 10 });
  });

  it("pt-BR DD/MM/YYYY", () => {
    expect(ym(parseTxDate("10/07/2026", CREATED_AT))).toEqual({ y: 2026, m: 6, day: 10 });
  });

  it("pt-BR DD-MM-YYYY", () => {
    expect(ym(parseTxDate("10-07-2026", CREATED_AT))).toEqual({ y: 2026, m: 6, day: 10 });
  });

  it("pt-BR DD/MM/YY (2-digit year)", () => {
    expect(ym(parseTxDate("10/07/26", CREATED_AT))).toEqual({ y: 2026, m: 6, day: 10 });
  });

  it("ISO YYYY-MM-DD", () => {
    expect(ym(parseTxDate("2026-07-10", CREATED_AT))).toEqual({ y: 2026, m: 6, day: 10 });
  });

  it("ISO YYYY/MM/DD", () => {
    expect(ym(parseTxDate("2026/07/10", CREATED_AT))).toEqual({ y: 2026, m: 6, day: 10 });
  });

  it("all numeric formats (DD/MM, DD-MM, DD/MM/YYYY, ISO, extenso) collapse to same billing (y,m)", () => {
    const inputs = [
      "10/07",
      "10-07",
      "10/07/2026",
      "10-07-2026",
      "10/07/26",
      "2026-07-10",
      "2026/07/10",
      "10 jul",
      "10 julho",
    ];
    const results = inputs.map((s) => {
      const d = parseTxDate(s, CREATED_AT);
      return `${d.getFullYear()}-${d.getMonth()}`;
    });
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("2026-6");
  });

  it("year-boundary heuristic applies to numeric DD/MM near Dec→Jan", () => {
    // "02/01" with created_at end of Dec 2025 must roll into Jan 2026.
    const d = parseTxDate("02/01", "2025-12-31T23:59:00Z");
    expect(ym(d)).toEqual({ y: 2026, m: 0, day: 2 });
  });

  it("year-boundary heuristic applies to numeric DD/MM near Jan→Dec", () => {
    // "30/12" with created_at early Jan 2026 must roll back to Dec 2025.
    const d = parseTxDate("30/12", "2026-01-02T04:00:00Z");
    expect(ym(d)).toEqual({ y: 2025, m: 11, day: 30 });
  });

  it("invalid day/month falls back", () => {
    const d = parseTxDate("32/13", CREATED_AT);
    expect(d.toISOString().slice(0, 10)).toBe("2026-07-15");
  });

  it("ISO with time component still parses via native fallback", () => {
    const d = parseTxDate("2026-07-10T09:30:00Z", CREATED_AT);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(6);
    expect(d.getUTCDate()).toBe(10);
  });
});
