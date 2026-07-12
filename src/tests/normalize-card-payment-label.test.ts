import { describe, it, expect } from "vitest";
import {
  normalizeCardPaymentLabel,
  formatCardPaymentLabel,
  CARD_PAYMENT_LABEL_REGEX,
} from "@/lib/card-payment-label";

describe("normalizeCardPaymentLabel — fallback de rótulo legado", () => {
  it("mantém o rótulo canônico inalterado (idempotência sobre a saída de formatCardPaymentLabel)", () => {
    const canonical = formatCardPaymentLabel("total", "Porto Bank");
    expect(normalizeCardPaymentLabel(canonical)).toBe(canonical);
    expect(CARD_PAYMENT_LABEL_REGEX.test(canonical)).toBe(true);
  });

  it("reformata a wording legada Parcial → canônica", () => {
    expect(normalizeCardPaymentLabel("Pagamento Parcial fatura cartão Porto Bank"))
      .toBe("Pagamento Parcial cartão Porto Bank");
  });

  it("reformata a wording legada Total → canônica", () => {
    expect(normalizeCardPaymentLabel("Pagamento Total fatura cartão Mercado Pago"))
      .toBe("Pagamento Total cartão Mercado Pago");
  });

  it("tolera capitalização variada", () => {
    expect(normalizeCardPaymentLabel("pagamento parcial FATURA CARTAO Nubank"))
      .toBe("Pagamento Parcial cartão Nubank");
  });

  it("tolera 'cartao' sem acento", () => {
    expect(normalizeCardPaymentLabel("Pagamento Total fatura cartao Itaú"))
      .toBe("Pagamento Total cartão Itaú");
  });

  it("tolera preposições opcionais entre 'fatura' e 'cartão'", () => {
    expect(normalizeCardPaymentLabel("Pagamento Parcial fatura do cartão Inter"))
      .toBe("Pagamento Parcial cartão Inter");
    expect(normalizeCardPaymentLabel("Pagamento Total fatura da cartão C6"))
      .toBe("Pagamento Total cartão C6");
    expect(normalizeCardPaymentLabel("Pagamento Parcial fatura de cartão XP"))
      .toBe("Pagamento Parcial cartão XP");
  });

  it("colapsa whitespace múltiplo, NBSP e quebras de linha no nome do cartão", () => {
    const raw = "Pagamento  Parcial   fatura  cartão   Porto\u00a0Bank\n";
    expect(normalizeCardPaymentLabel(raw)).toBe("Pagamento Parcial cartão Porto Bank");
  });

  it("é idempotente (aplicar duas vezes = uma vez)", () => {
    const legacy = "Pagamento Parcial fatura cartão Porto Bank";
    const once = normalizeCardPaymentLabel(legacy);
    const twice = normalizeCardPaymentLabel(once);
    expect(twice).toBe(once);
  });

  it("não altera strings desconhecidas (não é rótulo de pagamento)", () => {
    expect(normalizeCardPaymentLabel("Compra no supermercado")).toBe("Compra no supermercado");
    expect(normalizeCardPaymentLabel("Fatura cartão Porto Bank")).toBe("Fatura cartão Porto Bank");
    expect(normalizeCardPaymentLabel("")).toBe("");
  });

  it("trata null/undefined como string vazia", () => {
    expect(normalizeCardPaymentLabel(null)).toBe("");
    expect(normalizeCardPaymentLabel(undefined)).toBe("");
  });

  it("nome do cartão com caracteres especiais é preservado", () => {
    expect(normalizeCardPaymentLabel("Pagamento Total fatura cartão Latam Pass — Itaú"))
      .toBe("Pagamento Total cartão Latam Pass — Itaú");
  });

  it("saída sempre passa pela regex canônica quando o input é reconhecido", () => {
    const inputs = [
      "Pagamento Parcial fatura cartão Porto Bank",
      "PAGAMENTO TOTAL FATURA CARTAO Nubank",
      "pagamento parcial fatura do cartão Inter",
      "Pagamento  Total   fatura   cartão   Mercado Pago",
    ];
    for (const raw of inputs) {
      const normalized = normalizeCardPaymentLabel(raw);
      expect(CARD_PAYMENT_LABEL_REGEX.test(normalized)).toBe(true);
    }
  });
});
