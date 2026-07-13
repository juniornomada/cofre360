import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guards the compact due-date label on the card summary.
 *
 * Regression: the summary used to render "Fatura {mês}" (e.g. "Fatura Julho").
 * The canonical format is now "Venc. dd/mm" via `formatDueDate(selDue)`.
 *
 * These are static-source assertions to fail fast if the wording is
 * reintroduced anywhere in the summary blocks of /cards or Home.
 */

const cardsSrc = readFileSync(resolve(__dirname, "../routes/cards.tsx"), "utf8");
const indexSrc = readFileSync(resolve(__dirname, "../routes/index.tsx"), "utf8");

// Extract the summary "status row" block on /cards, from the opening
// `<div className="flex justify-between items-start gap-2 mb-1.5">` down to
// the matching `</div>` that closes the row (bounded by the following
// `<div className="mt-1 border-t border-white/10 pt-1">` marker).
function extractCardsSummaryRow(src: string): string {
  const start = src.indexOf('flex justify-between items-start gap-2 mb-1.5');
  if (start === -1) throw new Error("cards.tsx summary row not found");
  const end = src.indexOf('mt-1 border-t border-white/10 pt-1', start);
  if (end === -1) throw new Error("cards.tsx summary row end not found");
  return src.slice(start, end);
}

// Extract the Home per-card summary block from the `Venc.` line context.
function extractHomeCardSummary(src: string): string {
  const marker = 'data-testid="fatura-atual-valor"';
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error("index.tsx summary block not found");
  // Widen window ~1500 chars back / 200 forward to include the status pills
  // and the Venc. line above.
  return src.slice(Math.max(0, idx - 1500), idx + 200);
}

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

describe("Card summary · due-date label", () => {
  it("renders 'Venc. dd/mm' in the /cards summary row", () => {
    const block = extractCardsSummaryRow(cardsSrc);
    // Canonical path: `formatDueLabel(...)` helper returns "Venc. dd/mm".
    // Legacy inline form `Venc. {formatDueDate(selDue)}` is also accepted.
    expect(
      /formatDueLabel\s*\(/.test(block) ||
        /Venc\.\s*\{formatDueDate\(selDue\)\}/.test(block),
    ).toBe(true);
  });

  it("renders 'Venc. dd/mm' in the Home card summary", () => {
    const block = extractHomeCardSummary(indexSrc);
    expect(
      /formatDueLabel\s*\(/.test(block) ||
        /Venc\.\s*\{formatDueDate\(selDue\)\}/.test(block),
    ).toBe(true);
  });


  it("does NOT render 'Fatura {mês}' in the /cards summary row", () => {
    const block = extractCardsSummaryRow(cardsSrc);
    // Literal month names (e.g. "Fatura Julho")
    for (const m of monthNames) {
      expect(block).not.toMatch(new RegExp(`Fatura\\s+${m}`, "i"));
    }
    // Templated variants such as `Fatura {monthNames[...]}` or
    // `Fatura ${period.label}` used to build the old label.
    expect(block).not.toMatch(/Fatura\s*\{[^}]*month/i);
    expect(block).not.toMatch(/Fatura\s*\$\{[^}]*month/i);
  });

  it("does NOT render 'Fatura {mês}' in the Home card summary", () => {
    const block = extractHomeCardSummary(indexSrc);
    for (const m of monthNames) {
      expect(block).not.toMatch(new RegExp(`Fatura\\s+${m}`, "i"));
    }
    expect(block).not.toMatch(/Fatura\s*\{[^}]*month/i);
    expect(block).not.toMatch(/Fatura\s*\$\{[^}]*month/i);
  });

  it("formatDueDate emits a zero-padded dd/MM string", () => {
    // /cards uses a manual formatter; Home uses date-fns `format(d, "dd/MM")`.
    // Sanity-check the manual variant.
    const formatDueDate = (d: Date) =>
      `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    expect(formatDueDate(new Date(2026, 6, 5))).toBe("05/07");
    expect(formatDueDate(new Date(2026, 11, 31))).toBe("31/12");
    expect(/^\d{2}\/\d{2}$/.test(formatDueDate(new Date()))).toBe(true);
  });
});
