/**
 * Accessibility contract for the credit-card due-date label.
 *
 * The visible label reads "Venc. dd/mm" (abbreviated), but the accessibility
 * tree must expose the expanded form "Vencimento em dd/mm" — no legacy
 * "Fatura {mês}" wording is allowed in aria-labels, titles, or sr-only spans
 * near the due-date paragraph.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatDueAriaLabel, formatDueLabel } from "@/lib/format-due-date";

const ROUTES = [
  resolve(__dirname, "../routes/cards.tsx"),
  resolve(__dirname, "../routes/index.tsx"),
] as const;

const MONTH_NAMES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

describe("formatDueAriaLabel", () => {
  it("expands the 'Venc.' abbreviation for screen readers", () => {
    expect(formatDueAriaLabel(new Date(2026, 6, 5))).toBe("Vencimento em 05/07");
    expect(formatDueAriaLabel(new Date(2026, 11, 31))).toBe("Vencimento em 31/12");
    expect(formatDueAriaLabel(new Date(2026, 0, 9))).toBe("Vencimento em 09/01");
  });

  it("never emits the legacy 'Fatura {mês}' wording", () => {
    for (let m = 0; m < 12; m++) {
      const label = formatDueAriaLabel(new Date(2026, m, 15));
      expect(label).not.toMatch(/Fatura/i);
      for (const monthName of MONTH_NAMES_PT) {
        expect(label.toLowerCase()).not.toContain(monthName);
      }
    }
  });

  it("gives a stable fallback in loading / empty / error states", () => {
    expect(formatDueAriaLabel(null)).toBe("Vencimento indisponível");
    expect(formatDueAriaLabel(undefined)).toBe("Vencimento indisponível");
    expect(formatDueAriaLabel(new Date("not-a-date"))).toBe("Vencimento indisponível");
  });

  it("stays consistent with the visible label — same date ⇒ same digits", () => {
    const d = new Date(2026, 2, 7);
    const visible = formatDueLabel(d); // "Venc. 07/03"
    const aria = formatDueAriaLabel(d); // "Vencimento em 07/03"
    const digits = /\d{2}\/\d{2}/;
    const visibleDigits = visible.match(digits)?.[0];
    const ariaDigits = aria.match(digits)?.[0];
    expect(visibleDigits).toBe("07/03");
    expect(ariaDigits).toBe(visibleDigits);
  });
});

describe("Due-date a11y wiring — /cards and / (Home)", () => {
  for (const file of ROUTES) {
    const src = readFileSync(file, "utf8");
    const label = file.split("/").pop();

    it(`${label}: imports the a11y helper from the canonical module`, () => {
      expect(src).toMatch(
        /import\s*\{[^}]*\bformatDueAriaLabel\b[^}]*\}\s*from\s*["']@\/lib\/format-due-date["']/,
      );
    });

    it(`${label}: sets aria-label={formatDueAriaLabel(selDue)} on the due-date container`, () => {
      expect(src).toMatch(/aria-label=\{\s*formatDueAriaLabel\s*\(\s*selDue\s*\)\s*\}/);
    });

    it(`${label}: hides the abbreviated visible label from assistive tech (aria-hidden)`, () => {
      // The visible <span> that wraps formatDueLabel(selDue) must be aria-hidden
      // so screen readers announce only the expanded aria-label.
      expect(src).toMatch(/aria-hidden=["']true["']\s*>\s*\{\s*formatDueLabel\s*\(\s*selDue\s*\)\s*\}\s*<\/span>/);
    });

    it(`${label}: contains no aria-label or title with legacy "Fatura {mês}" wording`, () => {
      // Look for aria-label="..." and title="..." literals; assert none embed
      // a month name after the word "Fatura".
      const attrRe = /(?:aria-label|title)=["']([^"']+)["']/g;
      const offenders: string[] = [];
      for (const match of src.matchAll(attrRe)) {
        const value = match[1].toLowerCase();
        if (!value.includes("fatura")) continue;
        for (const m of MONTH_NAMES_PT) {
          if (value.includes(m)) offenders.push(match[0]);
        }
      }
      expect(offenders).toEqual([]);
    });

    it(`${label}: month-navigation buttons no longer say "Fatura anterior/próxima"`, () => {
      expect(src).not.toMatch(/aria-label=["']Fatura anterior["']/);
      expect(src).not.toMatch(/aria-label=["']Próxima fatura["']/);
      expect(src).not.toMatch(/aria-label=["']Fatura do mês anterior["']/);
      expect(src).not.toMatch(/aria-label=["']Fatura do próximo mês["']/);
    });
  }
});
