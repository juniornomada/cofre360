import { describe, it, expect } from "vitest";
import { formatDueDate, formatDueLabel } from "@/lib/format-due-date";

describe("formatDueDate", () => {
  it("zero-pads single-digit day and month", () => {
    expect(formatDueDate(new Date(2026, 0, 5))).toBe("05/01");
    expect(formatDueDate(new Date(2026, 8, 9))).toBe("09/09");
  });

  it("renders two-digit day and month unchanged", () => {
    expect(formatDueDate(new Date(2026, 6, 10))).toBe("10/07");
    expect(formatDueDate(new Date(2026, 11, 31))).toBe("31/12");
  });

  it("covers every calendar month at the first day", () => {
    for (let m = 0; m < 12; m++) {
      const mm = String(m + 1).padStart(2, "0");
      expect(formatDueDate(new Date(2026, m, 1))).toBe(`01/${mm}`);
    }
  });

  it("handles leap-day dates", () => {
    expect(formatDueDate(new Date(2024, 1, 29))).toBe("29/02");
  });

  it("always matches the dd/MM shape for real dates", () => {
    for (let i = 0; i < 200; i++) {
      const d = new Date(2026, Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28));
      expect(formatDueDate(d)).toMatch(/^\d{2}\/\d{2}$/);
    }
  });

  it("returns the placeholder for invalid inputs instead of NaN/NaN", () => {
    expect(formatDueDate(new Date("not-a-date"))).toBe("--/--");
    expect(formatDueDate(null)).toBe("--/--");
    expect(formatDueDate(undefined)).toBe("--/--");
    // Guard against duck-typed objects.
    // @ts-expect-error intentional bad input
    expect(formatDueDate({ getDate: () => 5 })).toBe("--/--");
  });
});

describe("formatDueLabel", () => {
  it("prefixes with 'Venc. ' and never renders the legacy 'Fatura {mês}' wording", () => {
    expect(formatDueLabel(new Date(2026, 6, 5))).toBe("Venc. 05/07");
    expect(formatDueLabel(new Date(2026, 11, 31))).toBe("Venc. 31/12");
    const label = formatDueLabel(new Date(2026, 7, 10));
    expect(label.startsWith("Venc. ")).toBe(true);
    expect(label).not.toMatch(/Fatura/i);
    expect(label).not.toMatch(/janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro/i);
  });

  it("falls back to 'Venc. --/--' for invalid inputs", () => {
    expect(formatDueLabel(null)).toBe("Venc. --/--");
    expect(formatDueLabel(new Date("bad"))).toBe("Venc. --/--");
  });
});
