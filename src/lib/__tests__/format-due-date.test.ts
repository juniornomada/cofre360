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

describe("formatDueLabel · single-digit day/month consistency", () => {
  // Regression: previously the label could render as "Venc. 3/08" or
  // "Venc. 10/8". The canonical output MUST zero-pad both fields so the
  // shape is always "Venc. dd/mm".

  it("zero-pads single-digit day (never 'Venc. 3/08')", () => {
    expect(formatDueLabel(new Date(2026, 7, 3))).toBe("Venc. 03/08");
    expect(formatDueLabel(new Date(2026, 7, 3))).not.toMatch(/Venc\.\s+\d\/\d{2}$/);
  });

  it("zero-pads single-digit month (never 'Venc. 10/8')", () => {
    expect(formatDueLabel(new Date(2026, 7, 10))).toBe("Venc. 10/08");
    expect(formatDueLabel(new Date(2026, 7, 10))).not.toMatch(/Venc\.\s+\d{2}\/\d$/);
  });

  it("zero-pads both single-digit day and month (never 'Venc. 3/8')", () => {
    expect(formatDueLabel(new Date(2026, 7, 3))).not.toMatch(/Venc\.\s+\d\/\d$/);
    expect(formatDueLabel(new Date(2026, 0, 1))).toBe("Venc. 01/01");
    expect(formatDueLabel(new Date(2026, 8, 9))).toBe("Venc. 09/09");
  });

  it("emits strictly 'Venc. dd/mm' for every day of every month (leap year)", () => {
    for (let m = 0; m < 12; m++) {
      const daysInMonth = new Date(2024, m + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const label = formatDueLabel(new Date(2024, m, d));
        expect(label).toMatch(/^Venc\. \d{2}\/\d{2}$/);
      }
    }
  });

  it("formatDueDate mirrors the same zero-padding contract", () => {
    expect(formatDueDate(new Date(2026, 7, 3))).toBe("03/08");
    expect(formatDueDate(new Date(2026, 7, 10))).toBe("10/08");
    expect(formatDueDate(new Date(2026, 0, 1))).toBe("01/01");
    // Never a single-digit segment.
    for (let m = 0; m < 12; m++) {
      for (const d of [1, 2, 3, 9, 10, 15, 28]) {
        expect(formatDueDate(new Date(2026, m, d))).toMatch(/^\d{2}\/\d{2}$/);
      }
    }
  });
});

