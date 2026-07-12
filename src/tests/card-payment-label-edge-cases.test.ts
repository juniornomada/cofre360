import { describe, it, expect } from "vitest";
import {
  formatCardPaymentLabel,
  sanitizeCardName,
  normalizeCardPaymentLabel,
  CARD_PAYMENT_LABEL_REGEX,
} from "@/lib/card-payment-label";

describe("formatCardPaymentLabel — hífen, acentos e espaços múltiplos", () => {
  it("preserva hífen no nome do cartão", () => {
    const out = formatCardPaymentLabel("partial", "Porto-Bank");
    expect(out).toBe("Pagamento Parcial cartão Porto-Bank");
    expect(CARD_PAYMENT_LABEL_REGEX.test(out)).toBe(true);
  });

  it("preserva hífens múltiplos e en/em dash", () => {
    expect(formatCardPaymentLabel("total", "Banco-do-Brasil")).toBe(
      "Pagamento Total cartão Banco-do-Brasil",
    );
    expect(formatCardPaymentLabel("partial", "Cartão – Premium")).toBe(
      "Pagamento Parcial cartão Cartão – Premium",
    );
    expect(formatCardPaymentLabel("partial", "Cartão — Black")).toBe(
      "Pagamento Parcial cartão Cartão — Black",
    );
  });

  it("preserva acentos e cedilha", () => {
    expect(formatCardPaymentLabel("total", "Conceição")).toBe(
      "Pagamento Total cartão Conceição",
    );
    expect(formatCardPaymentLabel("partial", "Ação Visa Ouro")).toBe(
      "Pagamento Parcial cartão Ação Visa Ouro",
    );
    expect(formatCardPaymentLabel("total", "Itaú Uniclass")).toBe(
      "Pagamento Total cartão Itaú Uniclass",
    );
    expect(formatCardPaymentLabel("partial", "São Paulo Card")).toBe(
      "Pagamento Parcial cartão São Paulo Card",
    );
  });

  it("colapsa múltiplos espaços internos em um único espaço", () => {
    expect(formatCardPaymentLabel("partial", "Porto     Bank")).toBe(
      "Pagamento Parcial cartão Porto Bank",
    );
    expect(formatCardPaymentLabel("total", "  Mercado    Pago  ")).toBe(
      "Pagamento Total cartão Mercado Pago",
    );
  });

  it("colapsa NBSP, tabs e quebras de linha", () => {
    expect(formatCardPaymentLabel("partial", "Porto\u00A0Bank")).toBe(
      "Pagamento Parcial cartão Porto Bank",
    );
    expect(formatCardPaymentLabel("total", "Nu\tBank\nCard")).toBe(
      "Pagamento Total cartão Nu Bank Card",
    );
    expect(formatCardPaymentLabel("partial", "Linha1\r\nLinha2")).toBe(
      "Pagamento Parcial cartão Linha1 Linha2",
    );
  });

  it("preserva hífen mesmo com espaços colados em volta", () => {
    // Hífen sem espaços permanece colado; com espaços vira "X - Y".
    expect(formatCardPaymentLabel("total", "Visa-Ouro")).toBe(
      "Pagamento Total cartão Visa-Ouro",
    );
    expect(formatCardPaymentLabel("total", "Visa - Ouro")).toBe(
      "Pagamento Total cartão Visa - Ouro",
    );
    expect(formatCardPaymentLabel("total", "Visa  -  Ouro")).toBe(
      "Pagamento Total cartão Visa - Ouro",
    );
  });

  it("combina hífen + acento + espaços em um único caso", () => {
    const out = formatCardPaymentLabel(
      "partial",
      "  Conceição\u00A0-\tSão   Paulo  ",
    );
    expect(out).toBe("Pagamento Parcial cartão Conceição - São Paulo");
    expect(CARD_PAYMENT_LABEL_REGEX.test(out)).toBe(true);
  });
});

describe("sanitizeCardName — normalização isolada", () => {
  it("mantém hífen adjacente sem espaços", () => {
    expect(sanitizeCardName("Porto-Bank")).toBe("Porto-Bank");
  });

  it("mantém acentos e ç", () => {
    expect(sanitizeCardName("Conceição")).toBe("Conceição");
  });

  it("colapsa espaços múltiplos", () => {
    expect(sanitizeCardName("A    B   C")).toBe("A B C");
  });
});

describe("normalizeCardPaymentLabel — fallback com hífen/acentos/espaços", () => {
  it("converte legado com nome contendo hífen", () => {
    expect(
      normalizeCardPaymentLabel("Pagamento Parcial fatura cartão Porto-Bank"),
    ).toBe("Pagamento Parcial cartão Porto-Bank");
  });

  it("converte legado com acentos no nome", () => {
    expect(
      normalizeCardPaymentLabel("pagamento total fatura do cartao Conceição"),
    ).toBe("Pagamento Total cartão Conceição");
  });

  it("converte legado com múltiplos espaços entre tokens", () => {
    expect(
      normalizeCardPaymentLabel(
        "Pagamento   Parcial   fatura   cartão   Mercado   Pago",
      ),
    ).toBe("Pagamento Parcial cartão Mercado Pago");
  });

  it("converte legado com NBSP e tab intercalados", () => {
    expect(
      normalizeCardPaymentLabel(
        "Pagamento\u00A0Total\tfatura da\ncartão\u00A0Nubank Ultravioleta",
      ),
    ).toBe("Pagamento Total cartão Nubank Ultravioleta");
  });

  it("é idempotente com hífens e acentos", () => {
    const once = normalizeCardPaymentLabel(
      "Pagamento Parcial fatura cartão Itaú-Personnalité",
    );
    expect(once).toBe("Pagamento Parcial cartão Itaú-Personnalité");
    expect(normalizeCardPaymentLabel(once)).toBe(once);
  });

  it("mantém canônico inalterado quando nome já contém hífen/acento", () => {
    const canonical = "Pagamento Total cartão Itaú-Personnalité";
    expect(normalizeCardPaymentLabel(canonical)).toBe(canonical);
  });
});
