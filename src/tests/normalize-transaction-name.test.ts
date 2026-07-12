import { describe, it, expect } from "vitest";
import {
  sanitizeTransactionName,
  sanitizeTransactionWrite,
  sanitizeTransactionWrites,
  isValidTransactionName,
  InvalidTransactionNameError,
} from "@/lib/normalize-transaction-name";

describe("sanitizeTransactionName", () => {
  it("passa por descrições canônicas de pagamento", () => {
    expect(sanitizeTransactionName("Pagamento Parcial cartão Porto Bank")).toBe(
      "Pagamento Parcial cartão Porto Bank",
    );
    expect(sanitizeTransactionName("Pagamento Total cartão Mercado Pago")).toBe(
      "Pagamento Total cartão Mercado Pago",
    );
  });

  it("converte rótulo legado para o canônico", () => {
    expect(
      sanitizeTransactionName("Pagamento Parcial fatura cartão Porto Bank"),
    ).toBe("Pagamento Parcial cartão Porto Bank");
    expect(
      sanitizeTransactionName("pagamento total fatura do cartao mercado pago"),
    ).toBe("Pagamento Total cartão mercado pago");
  });

  it("colapsa whitespace unicode e remove controles", () => {
    expect(sanitizeTransactionName("  Uber\u00A0Ride\n\ttrip  ")).toBe(
      "Uber Ride trip",
    );
    expect(sanitizeTransactionName("Café\u0000\u0007manhã")).toBe("Café manhã");
  });

  it("rejeita descrição vazia ou nula", () => {
    expect(() => sanitizeTransactionName("")).toThrow(InvalidTransactionNameError);
    expect(() => sanitizeTransactionName("   \n  \t")).toThrow(
      InvalidTransactionNameError,
    );
    expect(() => sanitizeTransactionName(null)).toThrow(InvalidTransactionNameError);
    expect(() => sanitizeTransactionName(undefined)).toThrow(
      InvalidTransactionNameError,
    );
  });

  it("é idempotente", () => {
    const once = sanitizeTransactionName("Pagamento Parcial fatura cartão X");
    expect(sanitizeTransactionName(once)).toBe(once);
  });
});

describe("sanitizeTransactionWrite / sanitizeTransactionWrites", () => {
  it("normaliza o campo name em objetos de insert/update", () => {
    const row = sanitizeTransactionWrite({
      name: "Pagamento Parcial fatura cartão Porto Bank",
      amount: 100,
    });
    expect(row.name).toBe("Pagamento Parcial cartão Porto Bank");
    expect(row.amount).toBe(100);
  });

  it("mantém payloads sem name intactos (update parcial)", () => {
    const row = sanitizeTransactionWrite({ amount: 42 });
    expect(row).toEqual({ amount: 42 });
  });

  it("normaliza arrays de payloads", () => {
    const rows = sanitizeTransactionWrites([
      { name: "  Padaria  " },
      { name: "Pagamento Total fatura cartão Nubank" },
    ]);
    expect(rows[0].name).toBe("Padaria");
    expect(rows[1].name).toBe("Pagamento Total cartão Nubank");
  });

  it("propaga InvalidTransactionNameError em lotes com nome vazio", () => {
    expect(() =>
      sanitizeTransactionWrites([{ name: "OK" }, { name: "   " }]),
    ).toThrow(InvalidTransactionNameError);
  });
});

describe("isValidTransactionName", () => {
  it("aceita descrições livres", () => {
    expect(isValidTransactionName("Almoço restaurante")).toBe(true);
    expect(isValidTransactionName("Transferência → Conta X")).toBe(true);
  });

  it("aceita apenas forma canônica para pagamento de cartão", () => {
    expect(isValidTransactionName("Pagamento Parcial cartão Porto Bank")).toBe(true);
    expect(isValidTransactionName("Pagamento Parcial fatura cartão Porto Bank")).toBe(false);
    expect(isValidTransactionName("pagamento parcial cartão Porto Bank")).toBe(false);
  });

  it("rejeita vazio", () => {
    expect(isValidTransactionName("")).toBe(false);
    expect(isValidTransactionName("   ")).toBe(false);
  });
});
