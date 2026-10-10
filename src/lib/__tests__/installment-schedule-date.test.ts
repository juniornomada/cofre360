import { describe, expect, it } from "vitest";
import { addCalendarMonthsClamped } from "@/lib/installment-schedule-date";

const ymd = (date: Date) =>
  [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");

describe("monthly financial installment dates", () => {
  it("clamps January 31 to February's last day, then recovers March 31", () => {
    const purchase = new Date(2026, 0, 31, 12);
    expect([0, 1, 2, 3].map((months) => ymd(addCalendarMonthsClamped(purchase, months)))).toEqual([
      "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30",
    ]);
    expect(ymd(purchase)).toBe("2026-01-31");
  });

  it("preserves February 29 in a leap year", () => {
    const purchase = new Date(2028, 0, 31);
    expect(ymd(addCalendarMonthsClamped(purchase, 1))).toBe("2028-02-29");
    expect(ymd(addCalendarMonthsClamped(purchase, 2))).toBe("2028-03-31");
  });

  it("handles a year rollover without skipping February", () => {
    const purchase = new Date(2026, 11, 31);
    expect([0, 1, 2, 3].map((months) => ymd(addCalendarMonthsClamped(purchase, months)))).toEqual([
      "2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31",
    ]);
  });

  it("restores the original day after a short month, not a shortened previous installment", () => {
    const purchase = new Date(2026, 0, 30);
    expect([0, 1, 2].map((months) => ymd(addCalendarMonthsClamped(purchase, months)))).toEqual([
      "2026-01-30", "2026-02-28", "2026-03-30",
    ]);
  });

  it("keeps the installment sequence anchored at the selected current installment", () => {
    const currentInstallmentDate = new Date(2026, 0, 31);
    const installmentNumbers = [3, 4, 5, 6];
    const selectedCurrentNumber = 3;
    expect(installmentNumbers.map((n) => ymd(addCalendarMonthsClamped(currentInstallmentDate, n - selectedCurrentNumber)))).toEqual([
      "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30",
    ]);
  });

  it("preserves local time and returns a distinct object", () => {
    const purchase = new Date(2028, 0, 31, 14, 25, 15, 321);
    const result = addCalendarMonthsClamped(purchase, 1);
    expect(result).not.toBe(purchase);
    expect([result.getHours(), result.getMinutes(), result.getSeconds(), result.getMilliseconds()]).toEqual([14, 25, 15, 321]);
  });
});
