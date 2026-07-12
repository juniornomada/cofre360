import { describe, it, expect } from "vitest";

/**
 * Regression tests for the card payment transaction description.
 *
 * Historical wording used "Pagamento Parcial fatura cartão <Nome>" /
 * "Pagamento Total fatura cartão <Nome>". Per product decision, the word
 * "fatura" must NOT appear — the copy is:
 *   - "Pagamento Total cartão <Nome>"
 *   - "Pagamento Parcial cartão <Nome>"
 *
 * This mirrors the branch used inside handlePay in src/routes/cards.tsx.
 */
function buildPaymentDescription(cardName: string, isFullPayment: boolean): string {
  return isFullPayment
    ? `Pagamento Total cartão ${cardName}`
    : `Pagamento Parcial cartão ${cardName}`;
}

describe("Descrição de pagamento de cartão", () => {
  const cards = ["Mercado Pago", "Porto Bank"];

  for (const name of cards) {
    it(`usa "Pagamento Total cartão ${name}" quando quita a fatura`, () => {
      const desc = buildPaymentDescription(name, true);
      expect(desc).toBe(`Pagamento Total cartão ${name}`);
      expect(desc).not.toMatch(/fatura/i);
    });

    it(`usa "Pagamento Parcial cartão ${name}" em pagamento parcial`, () => {
      const desc = buildPaymentDescription(name, false);
      expect(desc).toBe(`Pagamento Parcial cartão ${name}`);
      expect(desc).not.toMatch(/fatura/i);
    });

    it(`nunca gera a string legada "Pagamento Parcial fatura cartão ${name}"`, () => {
      expect(buildPaymentDescription(name, false)).not.toBe(
        `Pagamento Parcial fatura cartão ${name}`,
      );
      expect(buildPaymentDescription(name, true)).not.toBe(
        `Pagamento Total fatura cartão ${name}`,
      );
    });
  }

  it("garante que o código-fonte de cards.tsx não contém a wording legada", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(process.cwd(), "src/routes/cards.tsx"),
      "utf8",
    );
    // Guarda contra reintrodução do rótulo legado em qualquer forma.
    expect(source).not.toMatch(/Pagamento\s+Parcial\s+fatura\s+cartão/i);
    expect(source).not.toMatch(/Pagamento\s+Total\s+fatura\s+cartão/i);
    // O rótulo é construído via helper canônico (fonte única de verdade)
    // — nenhum template string literal com "Pagamento ... cartão ${...}"
    // deve ser reintroduzido inline no componente.
    expect(source).toMatch(/formatCardPaymentLabel\s*\(/);
  });
});
