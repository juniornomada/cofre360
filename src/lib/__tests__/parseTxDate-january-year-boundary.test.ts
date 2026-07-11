import { describe, it, expect } from "vitest";
import { parseTxDate, getCycleDates, type CardTransaction } from "@/lib/invoice-utils";

/**
 * Invariant: a transaction whose textual `date` is in early January
 * ("02 jan", "01 jan", "05 jan", …) must NEVER be placed in the previous
 * year's billing cycle, regardless of when `created_at` was recorded.
 *
 * The tricky case: the row was inserted moments BEFORE midnight of Dec 31
 * (created_at year = N-1) but the user typed the textual date as "02 jan"
 * (meaning Jan of year N). A naive `fallbackYear = created_at.getFullYear()`
 * would drop the tx into Jan N-1 — an entire year earlier — landing it in
 * a stale cycle. Same trap in reverse for "31 dez" recorded on Jan 1.
 */

const CARD = { closing: 10, due: 20 };
function tx(dateText: string, createdAt: string): CardTransaction {
  return {
    id: "t", name: "t", icon: null, category: "food", card: "Card",
    date: dateText, amount: 100, type: "expense", created_at: createdAt,
    total_installments: null, installment_number: null, installment_group_id: null,
  };
}

describe("parseTxDate — early-January textual dates never fall back one year", () => {
  const earlyJanDays = ["01", "02", "03", "05", "10", "15"];
  const decCreatedAts = [
    "2025-12-31T23:59:59Z",
    "2025-12-31T20:00:00-03:00", // wall-clock 31 Dec BR, UTC still Dec 31
    "2025-12-31T23:00:00Z",
    "2025-12-15T12:00:00Z",       // mid-late December
    "2025-11-20T09:00:00Z",       // late November
  ];

  it.each(
    earlyJanDays.flatMap((d) =>
      decCreatedAts.map((c) => [`${d} jan`, c] as const),
    ),
  )("textual '%s' with created_at=%s → January of the FOLLOWING year", (dateText, createdAt) => {
    const parsed = parseTxDate(dateText, createdAt);
    expect(parsed.getMonth()).toBe(0);      // January
    expect(parsed.getFullYear()).toBe(2026); // never 2025
  });

  it("early-Jan textual date lands in the January cycle, not December of previous year", () => {
    // Reference date: mid-January 2026 → currentClose = 2026-01-10.
    const refDate = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    const { currentClose, prevClose } = getCycleDates(refDate, CARD.closing, CARD.due);
    expect(currentClose.getFullYear()).toBe(2026);
    expect(currentClose.getMonth()).toBe(0);

    // Row inserted just before midnight NYE, textual date "02 jan".
    const t = tx("02 jan", "2025-12-31T23:59:00Z");
    const d = parseTxDate(t.date, t.created_at);

    // Belongs to the CURRENT cycle (prevClose ≤ d < currentClose)?
    expect(d >= prevClose).toBe(true);
    expect(d < currentClose).toBe(true);

    // And crucially: NOT in the 2025 range.
    const jan2025 = new Date(2025, 0, 2);
    expect(d.getTime()).not.toBe(jan2025.getTime());
  });

  it("textual '01 jan' with created_at literally at 2025-12-31T23:59:59.999Z", () => {
    const parsed = parseTxDate("01 jan", "2025-12-31T23:59:59.999Z");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(0);
    expect(parsed.getDate()).toBe(1);
  });

  it("does NOT over-correct: textual 'jan' with created_at already in January stays same year", () => {
    const parsed = parseTxDate("02 jan", "2026-01-05T10:00:00Z");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(0);
  });

  it("does NOT over-correct: textual 'jan' with created_at in mid-year stays same year", () => {
    // Backfilled entry: user records a Jan tx in July of same year.
    const parsed = parseTxDate("02 jan", "2026-07-15T10:00:00Z");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(0);
  });

  it("symmetric fix: '31 dez' recorded in early January belongs to the PREVIOUS year", () => {
    // Row created 01 Jan 2026 with textual "31 dez" → means 31 Dec 2025.
    const parsed = parseTxDate("31 dez", "2026-01-01T00:30:00Z");
    expect(parsed.getFullYear()).toBe(2025);
    expect(parsed.getMonth()).toBe(11);
    expect(parsed.getDate()).toBe(31);
  });

  it("symmetric fix does NOT trigger for '31 dez' created in December", () => {
    const parsed = parseTxDate("31 dez", "2025-12-31T18:00:00Z");
    expect(parsed.getFullYear()).toBe(2025);
    expect(parsed.getMonth()).toBe(11);
  });

  it("survives capitalization/whitespace variants (Jan, JAN, ' 02  jan ')", () => {
    for (const variant of ["02 jan", "02 Jan", "02 JAN", "  02   jan  ", "02\tjan"]) {
      const parsed = parseTxDate(variant, "2025-12-31T23:00:00Z");
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(0);
      expect(parsed.getDate()).toBe(2);
    }
  });

  it("cross-check across a full sweep: early-Jan textual + late-year created_at → always year+1", () => {
    for (let day = 1; day <= 10; day++) {
      for (const month of [10, 11]) { // Nov, Dec
        for (let createdDay = 15; createdDay <= 31; createdDay += 8) {
          if (month === 10 && createdDay > 30) continue;
          const created = new Date(Date.UTC(2025, month, createdDay, 12, 0, 0)).toISOString();
          const parsed = parseTxDate(`${String(day).padStart(2, "0")} jan`, created);
          expect(parsed.getFullYear(), `day=${day} createdAt=${created}`).toBe(2026);
          expect(parsed.getMonth()).toBe(0);
        }
      }
    }
  });
});
