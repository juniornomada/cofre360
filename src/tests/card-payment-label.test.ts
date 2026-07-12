import { describe, it, expect } from "vitest";
import {
  formatCardPaymentLabel,
  sanitizeCardName,
  CARD_PAYMENT_LABEL_REGEX,
} from "@/lib/card-payment-label";

describe("formatCardPaymentLabel — padronização", () => {
  it("formata Total e Parcial no template canônico", () => {
    expect(formatCardPaymentLabel("total", "Porto Bank")).toBe(
      "Pagamento Total cartão Porto Bank",
    );
    expect(formatCardPaymentLabel("partial", "Mercado Pago")).toBe(
      "Pagamento Parcial cartão Mercado Pago",
    );
  });

  it("colapsa espaços múltiplos, NBSP e tabs no nome do cartão", () => {
    expect(formatCardPaymentLabel("partial", "  Porto   Bank  ")).toBe(
      "Pagamento Parcial cartão Porto Bank",
    );
    expect(formatCardPaymentLabel("total", "Mercado\u00A0Pago")).toBe(
      "Pagamento Total cartão Mercado Pago",
    );
    expect(formatCardPaymentLabel("partial", "Porto\tBank")).toBe(
      "Pagamento Parcial cartão Porto Bank",
    );
  });

  it("remove quebras de linha do nome do cartão", () => {
    expect(formatCardPaymentLabel("partial", "Porto\nBank")).toBe(
      "Pagamento Parcial cartão Porto Bank",
    );
    expect(formatCardPaymentLabel("total", "Mercado\r\nPago")).toBe(
      "Pagamento Total cartão Mercado Pago",
    );
    const label = formatCardPaymentLabel("partial", "Nubank\nRoxinho");
    expect(label.includes("\n")).toBe(false);
    expect(label.includes("\r")).toBe(false);
  });

  it("preserva a capitalização exata do nome do cartão", () => {
    expect(formatCardPaymentLabel("partial", "porto bank")).toBe(
      "Pagamento Parcial cartão porto bank",
    );
    expect(formatCardPaymentLabel("total", "iFood Card")).toBe(
      "Pagamento Total cartão iFood Card",
    );
  });

  it("nunca inclui a palavra 'fatura', mesmo que apareça no nome bruto", () => {
    // O template é fixo; o token "fatura" no nome sobrevive apenas ali,
    // não altera o esqueleto do rótulo.
    const label = formatCardPaymentLabel("partial", "Porto Bank");
    expect(label).not.toMatch(/fatura/i);
  });

  it("retorna string vazia quando o nome resulta vazio após sanitização", () => {
    expect(formatCardPaymentLabel("total", "")).toBe("");
    expect(formatCardPaymentLabel("partial", "   ")).toBe("");
    expect(formatCardPaymentLabel("total", null)).toBe("");
    expect(formatCardPaymentLabel("partial", undefined)).toBe("");
    expect(formatCardPaymentLabel("total", "\n\t  \u00A0")).toBe("");
  });

  it("remove caracteres de controle (C0/DEL) do nome", () => {
    expect(formatCardPaymentLabel("partial", "Porto\u0000Bank")).toBe(
      "Pagamento Parcial cartão Porto Bank",
    );
    expect(formatCardPaymentLabel("total", "Mercado\u007FPago")).toBe(
      "Pagamento Total cartão Mercado Pago",
    );
  });

  it("saída sempre bate com a regex canônica", () => {
    for (const name of ["Porto Bank", "Mercado Pago", "Nubank", "C6 Black"]) {
      expect(formatCardPaymentLabel("total", name)).toMatch(
        CARD_PAYMENT_LABEL_REGEX,
      );
      expect(formatCardPaymentLabel("partial", name)).toMatch(
        CARD_PAYMENT_LABEL_REGEX,
      );
    }
  });
});

describe("sanitizeCardName", () => {
  it("é idempotente", () => {
    const once = sanitizeCardName("  Porto\n Bank  ");
    expect(sanitizeCardName(once)).toBe(once);
  });
});
