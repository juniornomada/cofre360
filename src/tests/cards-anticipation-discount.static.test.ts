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

  it("destaca a ação de desconto com contraste nos temas claro e escuro", () => {
    const start = cards.indexOf('data-testid="invoice-discount-action"');
    const end = cards.indexOf("</button>", start);
    const action = cards.slice(start, end);
    expect(action).toContain("onClick={openDiscountDialog}");
    expect(action).toContain("border-amber-500/70 bg-amber-50");
    expect(action).toContain("dark:border-amber-400/70 dark:bg-amber-500/15");
    expect(action).toContain("dark:text-amber-100");
    expect(action).toContain("focus-visible:ring-2");
    expect(action).toContain("Abater desconto concedido pelo banco");
    expect(action).toContain("ChevronRight");
    expect(action).toContain("h-10 w-10"); // Touch-friendly icon and descriptive action
    expect(action).not.toContain('variant="outline"');
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
