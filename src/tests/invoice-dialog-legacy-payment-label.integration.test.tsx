import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { normalizeCardPaymentLabel } from "@/lib/card-payment-label";

/**
 * Integração — diálogo da fatura em /cards: o texto exibido para
 * pagamentos SEMPRE aparece no formato canônico
 *   "Pagamento (Total|Parcial) cartão <Nome>"
 * mesmo quando o registro persistido ainda carrega a variante legada
 *   "Pagamento (Total|Parcial) fatura cartão <Nome>"
 * (ou variações com "fatura do/da/de cartão", "cartao" sem acento, NBSP,
 * capitalização mista, whitespace ruidoso etc.).
 *
 * Este teste reproduz o mesmo pipeline de renderização usado em
 * `src/routes/cards.tsx` para a Composição da Fatura:
 *
 *   normalizeCardPaymentLabel(tx.name)
 *     .replace(/\s*\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)\s*$/, "")
 *     .trim()
 *
 * Consumindo o mesmo helper que `cards.tsx` importa, qualquer regressão
 * na normalização quebra este teste igualzinho quebraria a UI real.
 * Cobre linhas 1813 e 2075 do arquivo (dois call sites idênticos).
 */

type PaymentRow = { id: string; name: string; amount: number };

/** Espelho fiel do transform usado no diálogo — mantido em uma função
 * para que a evolução deste teste force a evolução em `cards.tsx`. */
function renderName(raw: string): string {
  return normalizeCardPaymentLabel(raw)
    .replace(/\s*\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)\s*$/, "")
    .trim();
}

function InvoiceDialogPaymentList({ rows }: { rows: PaymentRow[] }) {
  return (
    <ul aria-label="Composição da Fatura" data-testid="invoice-dialog">
      {rows.map((tx) => (
        <li key={tx.id} data-testid="payment-row" data-id={tx.id}>
          <span data-testid="payment-name">{renderName(tx.name)}</span>
        </li>
      ))}
    </ul>
  );
}

function displayedNames(): string[] {
  const list = screen.getByTestId("invoice-dialog");
  return within(list)
    .getAllByTestId("payment-name")
    .map((el) => el.textContent ?? "");
}

describe("/cards — diálogo da fatura: substitui rótulos legados pelo texto canônico", () => {
  it("legado 'Pagamento Parcial fatura cartão X' vira 'Pagamento Parcial cartão X' na UI", () => {
    const rows: PaymentRow[] = [
      { id: "1", name: "Pagamento Parcial fatura cartão Porto Bank", amount: -500 },
      { id: "2", name: "Pagamento Parcial fatura cartão Mercado Pago", amount: -300 },
    ];

    render(<InvoiceDialogPaymentList rows={rows} />);

    const names = displayedNames();
    expect(names).toEqual([
      "Pagamento Parcial cartão Porto Bank",
      "Pagamento Parcial cartão Mercado Pago",
    ]);
    // Regressão explícita: a palavra "fatura" NUNCA sobrevive na UI.
    for (const n of names) expect(n).not.toMatch(/fatura/i);
  });

  it("legado 'Pagamento Total fatura cartão X' vira 'Pagamento Total cartão X' na UI", () => {
    const rows: PaymentRow[] = [
      { id: "1", name: "Pagamento Total fatura cartão Porto Bank", amount: -1953.5 },
      { id: "2", name: "Pagamento Total fatura cartão Nubank", amount: -820 },
    ];

    render(<InvoiceDialogPaymentList rows={rows} />);

    expect(displayedNames()).toEqual([
      "Pagamento Total cartão Porto Bank",
      "Pagamento Total cartão Nubank",
    ]);
  });

  it("variações legadas 'fatura do/da/de cartão' e 'cartao' sem acento também são corrigidas", () => {
    const rows: PaymentRow[] = [
      { id: "a", name: "Pagamento Parcial fatura do cartão Itaú", amount: -100 },
      { id: "b", name: "Pagamento Total fatura da cartão Bradesco", amount: -200 },
      { id: "c", name: "Pagamento Parcial fatura de cartão Santander", amount: -300 },
      { id: "d", name: "Pagamento Total fatura cartao C6 Bank", amount: -400 }, // sem acento
      { id: "e", name: "PAGAMENTO PARCIAL FATURA CARTÃO Inter", amount: -50 },   // maiúsculo
    ];

    render(<InvoiceDialogPaymentList rows={rows} />);

    expect(displayedNames()).toEqual([
      "Pagamento Parcial cartão Itaú",
      "Pagamento Total cartão Bradesco",
      "Pagamento Parcial cartão Santander",
      "Pagamento Total cartão C6 Bank",
      "Pagamento Parcial cartão Inter",
    ]);
  });

  it("ruído de whitespace (NBSP, tabs, quebras, espaços múltiplos) no rótulo legado é saneado", () => {
    const rows: PaymentRow[] = [
      // NBSP (U+00A0) entre tokens
      { id: "1", name: "Pagamento\u00A0Parcial\u00A0fatura\u00A0cartão\u00A0Porto Bank", amount: -10 },
      // Tabs + espaços múltiplos
      { id: "2", name: "Pagamento\tTotal   fatura\t cartão   Mercado Pago", amount: -20 },
      // Quebras de linha
      { id: "3", name: "Pagamento Parcial fatura\ncartão\nNubank", amount: -30 },
    ];

    render(<InvoiceDialogPaymentList rows={rows} />);

    expect(displayedNames()).toEqual([
      "Pagamento Parcial cartão Porto Bank",
      "Pagamento Total cartão Mercado Pago",
      "Pagamento Parcial cartão Nubank",
    ]);
  });

  it("rótulo canônico e rótulo desconhecido passam intactos (sem quebra em outras transações)", () => {
    const rows: PaymentRow[] = [
      // Já canônico → deve aparecer inalterado.
      { id: "canon", name: "Pagamento Parcial cartão Porto Bank", amount: -100 },
      // Compra comum → não é rótulo de pagamento; passa reto.
      { id: "compra", name: "Supermercado Extra", amount: 250 },
      // Legado no meio da lista.
      { id: "legado", name: "Pagamento Total fatura cartão Nubank", amount: -400 },
    ];

    render(<InvoiceDialogPaymentList rows={rows} />);

    expect(displayedNames()).toEqual([
      "Pagamento Parcial cartão Porto Bank",
      "Supermercado Extra",
      "Pagamento Total cartão Nubank",
    ]);
  });

  it("sufixo de parcela '(1/3)' no fim do rótulo continua sendo removido depois da normalização", () => {
    // Reproduz o pipeline completo: normaliza legado → remove sufixo de parcela.
    const rows: PaymentRow[] = [
      { id: "1", name: "Pagamento Parcial fatura cartão Porto Bank (1/3)", amount: -100 },
      { id: "2", name: "Pagamento Total fatura cartão Nubank  ( 12 / 12 )", amount: -400 },
    ];

    render(<InvoiceDialogPaymentList rows={rows} />);

    expect(displayedNames()).toEqual([
      "Pagamento Parcial cartão Porto Bank",
      "Pagamento Total cartão Nubank",
    ]);
  });

  it("o texto legado literal NUNCA chega ao DOM do diálogo (guarda de regressão)", () => {
    const rows: PaymentRow[] = [
      { id: "a", name: "Pagamento Parcial fatura cartão Porto Bank", amount: -1 },
      { id: "b", name: "Pagamento Total fatura cartão Mercado Pago", amount: -2 },
      { id: "c", name: "Pagamento Parcial fatura do cartão Itaú", amount: -3 },
    ];

    render(<InvoiceDialogPaymentList rows={rows} />);

    const dialogText = screen.getByTestId("invoice-dialog").textContent ?? "";
    expect(dialogText).not.toMatch(/Pagamento\s+(Total|Parcial)\s+fatura/i);
    expect(dialogText).not.toMatch(/\bfatura\s+(?:do|da|de)?\s*cart[aã]o\b/i);
    // Cada linha deve conter o prefixo canônico.
    expect(displayedNames().every((n) => /^Pagamento (Total|Parcial) cartão /.test(n))).toBe(true);
  });
});
