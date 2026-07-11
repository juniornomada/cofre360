import { describe, it, expect } from "vitest";
import { parseTxDate, getCycleDates, groupByBillingCycle, type CardTransaction } from "../invoice-utils";

/**
 * Year-boundary heuristic for NUMERIC textual dates (DD/MM, DD-MM, DD/MM/YY).
 *
 * Mirrors the textual-month rules already covered in
 * `parseTxDate-january-year-boundary.test.ts`, but here we validate that the
 * same disambiguation happens when the user types the date with digits and
 * slashes/dashes — the most common pt-BR input variant.
 *
 * The invariant under test:
 *   - "DD/01" (January) with `created_at` in Nov/Dec of year N-1 → year N.
 *   - "DD/12" (December) with `created_at` in Jan/Feb of year N   → year N-1.
 *   - Explicit years ("DD/MM/YYYY", "DD/MM/YY") ALWAYS win: no shift.
 */

const CARD = { closing: 10, due: 20 };

function tx(dateText: string, createdAt: string): CardTransaction {
  return {
    id: "t", name: "t", icon: null, category: "food", card: "Card",
    date: dateText, amount: 100, type: "expense", created_at: createdAt,
    total_installments: null, installment_number: null, installment_group_id: null,
  };
}

function ymd(d: Date) {
  return { y: d.getFullYear(), m: d.getMonth(), day: d.getDate() };
}

describe("parseTxDate — numeric DD/MM heuristic across Dec↔Jan boundary", () => {
  describe("01/01 (New Year's Day) recorded before midnight NYE → next year", () => {
    const earlyJanDays = ["01/01", "02/01", "03/01", "05/01", "10/01", "01-01", "05-01"];
    const decCreatedAts = [
      "2025-12-31T23:59:59Z",
      "2025-12-31T20:00:00-03:00",
      "2025-12-15T12:00:00Z",
      "2025-11-20T09:00:00Z",
    ];

    it.each(
      earlyJanDays.flatMap((d) => decCreatedAts.map((c) => [d, c] as const)),
    )("'%s' with created_at=%s → January 2026", (dateText, createdAt) => {
      const parsed = parseTxDate(dateText, createdAt);
      expect(parsed.getMonth()).toBe(0);
      expect(parsed.getFullYear()).toBe(2026);
    });
  });

  describe("31/12 (New Year's Eve) recorded after midnight → previous year", () => {
    const lateDecDays = ["31/12", "30/12", "28/12", "25/12", "31-12", "28-12"];
    const janCreatedAts = [
      "2026-01-01T00:30:00Z",
      "2026-01-02T04:00:00Z",
      "2026-01-05T12:00:00Z",
      "2026-02-10T09:00:00Z",
    ];

    it.each(
      lateDecDays.flatMap((d) => janCreatedAts.map((c) => [d, c] as const)),
    )("'%s' with created_at=%s → December 2025", (dateText, createdAt) => {
      const parsed = parseTxDate(dateText, createdAt);
      expect(parsed.getMonth()).toBe(11);
      expect(parsed.getFullYear()).toBe(2025);
    });
  });

  it("'31/12' with created_at IN December stays same year (no over-correction)", () => {
    expect(ymd(parseTxDate("31/12", "2025-12-31T18:00:00Z")))
      .toEqual({ y: 2025, m: 11, day: 31 });
    expect(ymd(parseTxDate("31/12", "2025-12-15T10:00:00Z")))
      .toEqual({ y: 2025, m: 11, day: 31 });
  });

  it("'01/01' with created_at IN January stays same year (no over-correction)", () => {
    expect(ymd(parseTxDate("01/01", "2026-01-05T10:00:00Z")))
      .toEqual({ y: 2026, m: 0, day: 1 });
    expect(ymd(parseTxDate("01/01", "2026-01-01T00:00:01Z")))
      .toEqual({ y: 2026, m: 0, day: 1 });
  });

  it("mid-year created_at with mid-year DD/MM keeps fallback year unchanged", () => {
    expect(ymd(parseTxDate("10/07", "2026-07-15T12:00:00Z")))
      .toEqual({ y: 2026, m: 6, day: 10 });
    expect(ymd(parseTxDate("15/06", "2026-03-01T09:00:00Z")))
      .toEqual({ y: 2026, m: 5, day: 15 });
  });

  describe("explicit year always wins over heuristic (DD/MM/YYYY & DD/MM/YY)", () => {
    it("'01/01/2025' with created_at Dec 2025 → 01 Jan 2025 (NOT shifted to 2026)", () => {
      expect(ymd(parseTxDate("01/01/2025", "2025-12-31T23:00:00Z")))
        .toEqual({ y: 2025, m: 0, day: 1 });
    });

    it("'31/12/2026' with created_at Jan 2026 → 31 Dec 2026 (NOT shifted to 2025)", () => {
      expect(ymd(parseTxDate("31/12/2026", "2026-01-02T00:30:00Z")))
        .toEqual({ y: 2026, m: 11, day: 31 });
    });

    it("2-digit year '01/01/26' with created_at Dec 2025 → 01 Jan 2026 (no double-shift)", () => {
      expect(ymd(parseTxDate("01/01/26", "2025-12-31T23:00:00Z")))
        .toEqual({ y: 2026, m: 0, day: 1 });
    });

    it("2-digit year '31/12/25' with created_at Jan 2026 → 31 Dec 2025 (no double-shift)", () => {
      expect(ymd(parseTxDate("31/12/25", "2026-01-02T00:00:00Z")))
        .toEqual({ y: 2025, m: 11, day: 31 });
    });
  });

  it("'01/01' lands in the correct billing cycle at year rollover", () => {
    const refDate = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    const { currentClose, prevClose } = getCycleDates(refDate, CARD.closing, CARD.due);
    const parsed = parseTxDate("01/01", "2025-12-31T23:59:00Z");
    expect(parsed >= prevClose).toBe(true);
    expect(parsed < currentClose).toBe(true);
    expect(parsed.getFullYear()).toBe(2026);
  });

  it("'31/12' lands in the correct billing cycle when created in early January", () => {
    // 31/12/2025 belongs to the cycle closing 10/01/2026, due 20/01/2026.
    const refDate = new Date(2026, 0, 15);
    const periods = groupByBillingCycle(
      [tx("31/12", "2026-01-02T00:30:00Z")],
      CARD.closing, CARD.due, refDate,
    );
    const decPeriod = periods.find((p) => p.transactions.length > 0);
    expect(decPeriod).toBeDefined();
    expect(decPeriod!.dueDate.getFullYear()).toBe(2026);
    expect(decPeriod!.dueDate.getMonth()).toBe(0);
    expect(decPeriod!.dueDate.getDate()).toBe(20);
  });

  it("numeric and textual variants of the same boundary date agree on year", () => {
    const createdDec = "2025-12-31T23:59:00Z";
    const createdJan = "2026-01-02T00:30:00Z";

    // "01/01" ≡ "01 jan" when created just before midnight NYE.
    expect(parseTxDate("01/01", createdDec).getTime())
      .toBe(parseTxDate("01 jan", createdDec).getTime());

    // "31/12" ≡ "31 dez" when created just after midnight NYE.
    expect(parseTxDate("31/12", createdJan).getTime())
      .toBe(parseTxDate("31 dez", createdJan).getTime());
  });

  it("DD-MM (dash separator) behaves identically to DD/MM at the boundary", () => {
    expect(parseTxDate("01-01", "2025-12-31T23:00:00Z").getFullYear()).toBe(2026);
    expect(parseTxDate("31-12", "2026-01-02T00:00:00Z").getFullYear()).toBe(2025);
  });

  it("full sweep: every Jan day 1–10 with late-year created_at → next year", () => {
    for (let day = 1; day <= 10; day++) {
      const dd = String(day).padStart(2, "0");
      for (const createdMonth of [10, 11]) {
        for (let createdDay = 15; createdDay <= 30; createdDay += 5) {
          const created = new Date(Date.UTC(2025, createdMonth, createdDay, 12)).toISOString();
          const parsed = parseTxDate(`${dd}/01`, created);
          expect(parsed.getFullYear(), `${dd}/01 created ${created}`).toBe(2026);
          expect(parsed.getMonth()).toBe(0);
          expect(parsed.getDate()).toBe(day);
        }
      }
    }
  });

  it("full sweep: every Dec day 20–31 with early-year created_at → previous year", () => {
    for (let day = 20; day <= 31; day++) {
      const dd = String(day).padStart(2, "0");
      for (const createdMonth of [0, 1]) {
        for (let createdDay = 1; createdDay <= 15; createdDay += 5) {
          const created = new Date(Date.UTC(2026, createdMonth, createdDay, 12)).toISOString();
          const parsed = parseTxDate(`${dd}/12`, created);
          expect(parsed.getFullYear(), `${dd}/12 created ${created}`).toBe(2025);
          expect(parsed.getMonth()).toBe(11);
          expect(parsed.getDate()).toBe(day);
        }
      }
    }
  });
});
