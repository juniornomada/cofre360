import { describe, it, expect } from "vitest";
import {
  normalizeForCheck,
  findLegacyPaymentWording,
  LEGACY_PAYMENT_LABEL_PATTERNS,
} from "../../e2e/helpers/payment-wording";

/**
 * Cobre o helper de asserção usado nos specs E2E de wording de
 * pagamento. Objetivo específico:
 *
 *   ▸ Nenhum FALSO NEGATIVO — se o texto legado aparecer com QUALQUER
 *     variação de acento, capitalização, whitespace Unicode, forma
 *     Unicode composta/decomposta ou zero-width entre tokens, o helper
 *     tem que detectar.
 *
 *   ▸ Nenhum FALSO POSITIVO — se o texto for canônico (ou totalmente
 *     não-relacionado), o helper NÃO pode acusar; o padrão exige a
 *     sequência completa "pagamento (total|parcial) fatura [do|da|de]?
 *     cartao" com boundary final.
 */

describe("normalizeForCheck — normalização Unicode para asserções E2E", () => {
  it("colapsa NFKC + NFD e remove diacríticos (ã, ç, é → a, c, e)", () => {
    expect(normalizeForCheck("Cartão")).toBe("cartao");
    expect(normalizeForCheck("Itaú")).toBe("itau");
    expect(normalizeForCheck("Ação")).toBe("acao");
    // NFD explícito: "carta" + "\u0303" combining tilde + "o"
    expect(normalizeForCheck("carta\u0303o")).toBe("cartao");
    // NFKC: dígitos fullwidth → ASCII
    expect(normalizeForCheck("Ｃartão")).toBe("cartao");
  });

  it("colapsa qualquer whitespace Unicode em espaço ASCII único", () => {
    expect(normalizeForCheck("a\u00A0b")).toBe("a b"); // NBSP
    expect(normalizeForCheck("a\u2007b")).toBe("a b"); // figure space
    expect(normalizeForCheck("a\tb")).toBe("a b"); // tab
    expect(normalizeForCheck("a\nb\r\nc")).toBe("a b c"); // quebras
    expect(normalizeForCheck("a    b")).toBe("a b"); // múltiplos
    expect(normalizeForCheck("  a b  ")).toBe("a b"); // trim
  });

  it("remove zero-width / BOM SEM criar espaço entre tokens (evita bypass)", () => {
    // Se "cart\u200Bao" virasse "cart ao", escaparia do padrão. Tem que
    // colapsar para "cartao".
    expect(normalizeForCheck("cart\u200Bao")).toBe("cartao");
    expect(normalizeForCheck("cart\u200Cao")).toBe("cartao");
    expect(normalizeForCheck("cart\u200Dao")).toBe("cartao");
    expect(normalizeForCheck("\uFEFFcartao")).toBe("cartao");
  });

  it("é idempotente: f(f(x)) === f(x)", () => {
    const samples = [
      "Pagamento Parcial fatura cartão Porto Bank",
      "PAGAMENTO\u00A0TOTAL\u200Bfatura\tcartão   Nubank",
      "carta\u0303o Itaú",
      "",
      "   ",
    ];
    for (const s of samples) {
      const once = normalizeForCheck(s);
      expect(normalizeForCheck(once)).toBe(once);
    }
  });
});

describe("findLegacyPaymentWording — sem falsos negativos", () => {
  const legacyVariations: Array<[string, string]> = [
    ["capitalização normal", "Pagamento Parcial fatura cartão Porto Bank"],
    ["tudo minúsculo", "pagamento parcial fatura cartão porto bank"],
    ["TUDO MAIÚSCULO", "PAGAMENTO TOTAL FATURA CARTÃO NUBANK"],
    ["variante Total", "Pagamento Total fatura cartão Mercado Pago"],
    ["conector 'do'", "Pagamento Parcial fatura do cartão Itaú"],
    ["conector 'da'", "Pagamento Total fatura da cartão Bradesco"],
    ["conector 'de'", "Pagamento Parcial fatura de cartão Santander"],
    ["sem acento em cartao", "Pagamento Total fatura cartao C6 Bank"],
    ["NBSP entre tokens", "Pagamento\u00A0Parcial\u00A0fatura\u00A0cartão\u00A0Nubank"],
    ["zero-width dentro de 'cartão'", "Pagamento Total fatura cart\u200Bão Inter"],
    ["combining diacritic (NFD)", "Pagamento Parcial fatura carta\u0303o Itau"],
    ["tabs e quebras", "Pagamento\tTotal   fatura\ncartão\tNubank"],
    ["múltiplos espaços", "Pagamento    Parcial    fatura    cartão    X"],
    ["misturado", "  paGaMento\u00A0TotAl\u200B fATURA  DO  cARTÃO  Y  "],
  ];

  it.each(legacyVariations)("detecta variação legada — %s", (_label, raw) => {
    const hit = findLegacyPaymentWording(raw);
    expect(hit, `deveria ter detectado wording legada em: ${JSON.stringify(raw)}`).not.toBeNull();
  });
});

describe("findLegacyPaymentWording — sem falsos positivos", () => {
  const cleanSamples: Array<[string, string]> = [
    ["formato canônico Parcial", "Pagamento Parcial cartão Porto Bank"],
    ["formato canônico Total", "Pagamento Total cartão Nubank"],
    ["misturado com transação comum", "Supermercado Extra R$ 250,00"],
    ["string vazia", ""],
    [
      "menciona 'fatura' e 'cartão' em contextos separados",
      "Fatura fechada. Você pagou o cartão hoje.",
    ],
    [
      "nome de cartão contém 'fatura' isolado",
      "Pagamento Total cartão Fatura Fácil", // "fatura" faz parte do NOME, não do template
    ],
    [
      "linha canônica com sufixo de parcela",
      "Pagamento Parcial cartão Porto Bank (1/3)",
    ],
    [
      "wording de outra entidade (assinatura, boleto)",
      "Pagamento de fatura da assinatura Netflix",
    ],
  ];

  it.each(cleanSamples)("não acusa em: %s", (_label, raw) => {
    const hit = findLegacyPaymentWording(raw);
    expect(
      hit,
      `NÃO deveria ter acusado wording legada em: ${JSON.stringify(raw)}` +
        (hit ? ` — casou /${hit.pattern.source}/ no trecho "${hit.excerpt}"` : ""),
    ).toBeNull();
  });
});

describe("LEGACY_PAYMENT_LABEL_PATTERNS — consistência com a forma normalizada", () => {
  it("todos os padrões usam a forma já normalizada (minúsculo, sem acento)", () => {
    for (const rx of LEGACY_PAYMENT_LABEL_PATTERNS) {
      const src = rx.source;
      expect(src, `padrão deve estar em minúsculo: ${src}`).toBe(src.toLowerCase());
      // Não deve conter acento na fonte da regex.
      expect(/[áàâãäéèêëíìîïóòôõöúùûüç]/i.test(src), `padrão contém acento: ${src}`).toBe(false);
      // Não deve depender de flag `i` — a normalização já cuida disso.
      expect(rx.flags.includes("i"), `padrão usa /i, redundante após normalização: ${src}`).toBe(false);
    }
  });
});
