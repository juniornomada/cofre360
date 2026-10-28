import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cards = readFileSync(resolve(process.cwd(), "src/routes/cards.tsx"), "utf8");

describe("Cartões — registrar desconto de antecipação diretamente da fatura", () => {
  it("abre uma ação própria e apresenta prévia do desconto e novo total da fatura", () => {
    expect(cards).toContain('data-testid="invoice-discount-action"');
    expect(cards).toContain("Registrar desconto de antecipação");
    expect(cards).toContain('data-testid="invoice-discount-dialog"');
    expect(cards).toContain("Total após desconto");
    expect(cards).toContain("Confirmar desconto");
  });

  it("contabiliza o desconto como crédito do próprio cartão, não receita bancária nem despesa", () => {
    expect(cards).toContain('type: "income",');
    expect(cards).toContain('category: ANTICIPATION_DISCOUNT_CATEGORY');
    expect(cards).toContain('bank_account_id: null,');
    expect(cards).toContain('card: invoiceCard.name,');
    expect(cards).toContain('amount: cents / 100,');
    expect(cards).toContain('date: creditDate,');
    expect(cards).toContain('isAnticipationDiscountCredit(tx) ? "Crédito de antecipação" : tx.category');
  });

  it("protege contra valores incorretos, faturas pagas e clique duplicado", () => {
    expect(cards).toContain("validateAnticipationDiscount(cents, totalCents, paidCents)");
    expect(cards).toContain("discountSavingRef.current = true");
    expect(cards).toContain("if (discountSavingRef.current ||");
    expect(cards).toContain('onConflict: "id", ignoreDuplicates: true');
    expect(cards).toContain("Informe somente o desconto efetivamente concedido pelo emissor.");
  });
});
