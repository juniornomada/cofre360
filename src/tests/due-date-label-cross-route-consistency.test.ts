/**
 * Consistency guard: the credit-card due-date label must be rendered by the
 * exact same canonical helper in every route/state (loading, empty, error,
 * paid, partial, open) — so the string can never drift between /cards and /
 * (Home).
 *
 * Strategy:
 *  1. Static-source assertions on the two routes that own the label
 *     (src/routes/cards.tsx and src/routes/index.tsx):
 *      - each file imports `formatDueLabel` from `@/lib/format-due-date`;
 *      - each file uses `formatDueLabel(...)` for the invoice header;
 *      - no inline "Venc. " literal is concatenated with a raw expression
 *        (the previous drift risk) — the wording lives only inside the helper;
 *      - no legacy "Fatura {mês}" wording sneaks back in.
 *  2. Functional assertion on `formatDueLabel` — same input ⇒ same output —
 *     and the fallback "Venc. --/--" for the loading/empty/error states
 *     where `selDue` may be `null`/`undefined`/invalid.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatDueLabel } from "@/lib/format-due-date";

const ROUTES = [
  resolve(__dirname, "../routes/cards.tsx"),
  resolve(__dirname, "../routes/index.tsx"),
] as const;

const MONTH_NAMES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

describe("Due-date label — cross-route consistency", () => {
  for (const file of ROUTES) {
    const src = readFileSync(file, "utf8");
    const label = file.split("/").pop();

    it(`${label}: imports formatDueLabel from the canonical module`, () => {
      expect(src).toMatch(
        /import\s*\{[^}]*\bformatDueLabel\b[^}]*\}\s*from\s*["']@\/lib\/format-due-date["']/,
      );
    });

    it(`${label}: renders the header via formatDueLabel(...)`, () => {
      expect(src).toMatch(/\{\s*formatDueLabel\s*\(/);
    });

    it(`${label}: never concatenates a raw "Venc. " literal with an expression`, () => {
      // "Venc. " followed by "{" inside JSX would indicate the old inline path.
      expect(src).not.toMatch(/Venc\.\s*\{/);
    });

    it(`${label}: contains no legacy "Fatura {mês}" wording`, () => {
      for (const m of MONTH_NAMES_PT) {
        const re = new RegExp(`Fatura\\s+${m}`, "i");
        expect(src).not.toMatch(re);
      }
      // Also block the interpolated form "Fatura {selMonthLabel}" et al.
      expect(src).not.toMatch(/Fatura\s*\{[^}]*(month|mes|mês|Month)/i);
    });
  }
});

describe("Due-date label — same helper, same output across states", () => {
  const sample = new Date(2026, 6, 5); // 05/07

  it("produces the identical string regardless of caller/route", () => {
    const fromCards = formatDueLabel(sample);
    const fromHome = formatDueLabel(sample);
    expect(fromCards).toBe(fromHome);
    expect(fromCards).toBe("Venc. 05/07");
  });

  it("loading state (selDue undefined) collapses to the placeholder", () => {
    expect(formatDueLabel(undefined)).toBe("Venc. --/--");
  });

  it("empty state (selDue null) collapses to the placeholder", () => {
    expect(formatDueLabel(null)).toBe("Venc. --/--");
  });

  it("error state (invalid Date) collapses to the placeholder", () => {
    expect(formatDueLabel(new Date("not-a-date"))).toBe("Venc. --/--");
  });

  it("paid / partial / open states all share the same label for the same date", () => {
    // The invoice status (paid/partial/open) is a sibling badge — the label
    // itself only depends on `selDue`. Prove that by asserting the helper
    // is state-blind.
    const due = new Date(2026, 11, 31);
    const expected = "Venc. 31/12";
    // Simulate three call sites that in production sit next to different status branches.
    const asPaid = formatDueLabel(due);
    const asPartial = formatDueLabel(due);
    const asOpen = formatDueLabel(due);
    expect(new Set([asPaid, asPartial, asOpen]).size).toBe(1);
    expect(asPaid).toBe(expected);
  });
});
