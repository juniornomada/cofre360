import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Home moved from / (theme preview) to /home. Navigation by month
 * is now shared by the whole dashboard, not embedded inside CARTÕES.
 * Guard the actual UI instead of a snapshot of removed markup.
 */
const source = readFileSync(resolve(__dirname, "../routes/home.tsx"), "utf8");

function homeCardsSection(): string {
  const titleIndex = source.indexOf("CARTÕES</h2>");
  if (titleIndex === -1) throw new Error("Home CARTÕES heading missing");
  const end = source.indexOf("</section>", titleIndex);
  if (end === -1) throw new Error("Home card section closing tag missing");
  return source.slice(titleIndex, end);
}

describe("Home · CARTÕES header", () => {
  it("links to the complete cards page with 'Ver todos' instead of legacy 'Gerenciar'", () => {
    const section = homeCardsSection();
    expect(section).toContain('to="/cards"');
    expect(section).toContain("Ver todos");
    expect(section).not.toMatch(/>\s*Gerenciar\s*</);
  });

  it("keeps the shared month navigation accessible above the accounts/cards sections", () => {
    const titleIndex = source.indexOf("CARTÕES</h2>");
    const previous = source.indexOf('aria-label="Mês anterior"');
    const next = source.indexOf('aria-label="Próximo mês"');
    expect(previous).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(previous);
    expect(next).toBeLessThan(titleIndex);
    expect(source).toContain("shiftSelectedMonth(-1)");
    expect(source).toContain("shiftSelectedMonth(1)");
  });

  it("displays per-card monthly balances with visibility masking", () => {
    const section = homeCardsSection();
    expect(section).toContain("cardInvoiceSummaries[card.id]");
    expect(section).toContain("summary?.remaining");
    expect(section).toContain("balanceVisible");
    expect(section).toContain("R$ ••••");
    expect(section).toContain("summaryMonthDiffers &&");
  });
});
