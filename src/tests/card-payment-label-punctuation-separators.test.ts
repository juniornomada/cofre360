import { describe, it, expect } from "vitest";
import { normalizeCardPaymentLabel } from "@/lib/card-payment-label";

/**
 * Cobertura ampliada do normalizador de rótulos legados para variações de
 * pontuação e separadores comuns em imports (CSV/PDF/OFX de bancos).
 *
 * Todos os casos devem convergir para o formato canônico
 *   "Pagamento (Total|Parcial) cartão <Nome>"
 * e a função deve ser **idempotente** — `f(f(x)) === f(x)`.
 */

const CASES: Array<{ input: string; expected: string; note?: string }> = [
  // — Hífen ASCII —
  { input: "Pagamento - Parcial - fatura - cartão - Porto Bank", expected: "Pagamento Parcial cartão Porto Bank" },
  { input: "PAGAMENTO-TOTAL-FATURA-CARTAO-Nubank", expected: "Pagamento Total cartão Nubank", note: "sem acento + hífen colado" },
  // — En-dash / Em-dash —
  { input: "Pagamento – Total – fatura – cartão – Itaú", expected: "Pagamento Total cartão Itaú" },
  { input: "Pagamento — Parcial — fatura — cartão — XP", expected: "Pagamento Parcial cartão XP" },
  // — Dois-pontos e pipe —
  { input: "pagamento: parcial | fatura | cartão | Mercado Pago", expected: "Pagamento Parcial cartão Mercado Pago" },
  { input: "Pagamento:Total:fatura:cartão:Inter", expected: "Pagamento Total cartão Inter", note: "colado sem espaços" },
  // — Underscore (comum em slugs de OFX) —
  { input: "pagamento_parcial_fatura_cartao_C6", expected: "Pagamento Parcial cartão C6" },
  // — Barra —
  { input: "Pagamento/Total/fatura/cartão/BTG", expected: "Pagamento Total cartão BTG" },
  // — Ponto médio (·) —
  { input: "Pagamento · Parcial · fatura · cartão · Santander Free", expected: "Pagamento Parcial cartão Santander Free" },
  // — Vírgula —
  { input: "Pagamento, Parcial, fatura, cartão, Neon", expected: "Pagamento Parcial cartão Neon" },
  // — Conector do/da/de/dos/das —
  { input: "Pagamento Total fatura do cartão Bradesco", expected: "Pagamento Total cartão Bradesco" },
  { input: "Pagamento Parcial fatura das cartão Latam Pass", expected: "Pagamento Parcial cartão Latam Pass" },
  // — Trailing punctuation suave —
  { input: "Pagamento Parcial fatura cartão Porto Bank.", expected: "Pagamento Parcial cartão Porto Bank" },
  { input: "Pagamento Total fatura cartão Nubank;", expected: "Pagamento Total cartão Nubank" },
  // — Leading noise —
  { input: "  --  Pagamento Parcial fatura cartão XP", expected: "Pagamento Parcial cartão XP" },
  // — Nome com hífen preservado no output —
  { input: "Pagamento Total fatura cartão Santander-Free", expected: "Pagamento Total cartão Santander-Free" },
  // — Whitespace exótico + NBSP misturado com pontuação —
  { input: "Pagamento\u00A0-\u00A0Parcial\u00A0-\u00A0fatura\u00A0-\u00A0cartão\u00A0-\u00A0BTG", expected: "Pagamento Parcial cartão BTG" },
];

describe("normalizeCardPaymentLabel — cobertura ampliada de pontuação e separadores", () => {
  for (const { input, expected, note } of CASES) {
    const label = note ? `${JSON.stringify(input)} (${note})` : JSON.stringify(input);
    it(`normaliza ${label} → ${JSON.stringify(expected)}`, () => {
      expect(normalizeCardPaymentLabel(input)).toBe(expected);
    });
  }

  it("é idempotente para todas as variações cobertas", () => {
    for (const { input } of CASES) {
      const once = normalizeCardPaymentLabel(input);
      const twice = normalizeCardPaymentLabel(once);
      expect(twice, `Não é idempotente para ${JSON.stringify(input)}`).toBe(once);
    }
  });

  it("preserva separadores dentro do nome do cartão (não interpreta como noise)", () => {
    // Hífen dentro do nome não pode ser eliminado.
    expect(normalizeCardPaymentLabel("Pagamento Total fatura cartão A-B-C"))
      .toBe("Pagamento Total cartão A-B-C");
    // Barra dentro do nome também é preservada.
    expect(normalizeCardPaymentLabel("Pagamento Parcial fatura cartão Visa/Débito"))
      .toBe("Pagamento Parcial cartão Visa/Débito");
  });

  it("não altera strings que não são rótulos de pagamento de cartão", () => {
    const unrelated = [
      "Compra no supermercado",
      "Transferência - Pix - João",
      "Pagamento de boleto",
      "Fatura cartão Porto Bank", // falta prefixo "Pagamento X" — não é rótulo legado
    ];
    for (const s of unrelated) {
      expect(normalizeCardPaymentLabel(s)).toBe(s);
    }
  });

  it("não altera rótulos já canônicos", () => {
    const canonical = [
      "Pagamento Total cartão Porto Bank",
      "Pagamento Parcial cartão Mercado Pago",
      "Pagamento Total cartão Santander-Free",
    ];
    for (const s of canonical) {
      expect(normalizeCardPaymentLabel(s)).toBe(s);
    }
  });
});
