// Garante que, no fluxo de EDIÇÃO de uma despesa parcelada no cartão de crédito,
// alternar entre "Dividir total" (divide) e "Valor por parcela" (fixed)
// preserva o total econômico da compra (parcela × N), com as mesmas regras de
// arredondamento aplicadas no diálogo de criação (QuickAddTransactionDialog).
import { describe, it, expect } from "vitest";
import { toDivideMode, toFixedMode, computeTotal, validateInstallmentInputs } from "@/lib/installment-mode-toggle";

// Simula o estado mínimo do editTx no diálogo de edição.
type EditState = { amount: number; mode: "divide" | "fixed"; count: number };

function toggleDivide(prev: EditState): EditState {
  const next = toDivideMode({
    fromMode: prev.mode,
    amount: prev.amount,
    fixedValue: prev.mode === "fixed" ? prev.amount : 0,
    count: prev.count,
  });
  return { amount: next.amount, mode: "divide", count: prev.count };
}

function toggleFixed(prev: EditState): EditState {
  const next = toFixedMode({
    fromMode: prev.mode,
    amount: prev.amount,
    fixedValue: prev.mode === "fixed" ? prev.amount : 0,
    count: prev.count,
  });
  return { amount: next.amount, mode: "fixed", count: prev.count };
}

describe("Edição de parcelamento — consistência ao alternar modos", () => {
  it("divide→fixed preserva o total: R$ 1000 em 4x vira R$ 250/parcela", () => {
    const start: EditState = { amount: 1000, mode: "divide", count: 4 };
    const after = toggleFixed(start);
    expect(after.mode).toBe("fixed");
    expect(after.amount).toBe(250);
    expect(computeTotal(after.mode, after.amount, after.amount, after.count)).toBe(1000);
  });

  it("fixed→divide preserva o total: R$ 250/parcela em 4x vira R$ 1000 total", () => {
    const start: EditState = { amount: 250, mode: "fixed", count: 4 };
    const after = toggleDivide(start);
    expect(after.mode).toBe("divide");
    expect(after.amount).toBe(1000);
    expect(computeTotal(after.mode, after.amount, 0, after.count)).toBe(1000);
  });

  it("round-trip divide→fixed→divide é idempotente para valores múltiplos exatos", () => {
    const start: EditState = { amount: 1200, mode: "divide", count: 6 };
    const roundTrip = toggleDivide(toggleFixed(start));
    expect(roundTrip.amount).toBe(1200);
    expect(roundTrip.mode).toBe("divide");
  });

  it("valores não divisíveis exatos arredondam a 2 casas (100/3 → 33.33 × 3 = 99.99)", () => {
    const start: EditState = { amount: 100, mode: "divide", count: 3 };
    const asFixed = toggleFixed(start);
    expect(asFixed.amount).toBe(33.33);
    // O total reconstituído fica em 99.99 — a diferença de centavos é
    // exibida ao usuário pelo `hasEditDiff` no diálogo de edição.
    expect(computeTotal(asFixed.mode, asFixed.amount, asFixed.amount, asFixed.count)).toBe(99.99);
  });

  it("N=1 mantém amount inalterado nos dois sentidos", () => {
    const start: EditState = { amount: 87.5, mode: "divide", count: 1 };
    expect(toggleFixed(start).amount).toBe(87.5);
    const startFixed: EditState = { amount: 87.5, mode: "fixed", count: 1 };
    expect(toggleDivide(startFixed).amount).toBe(87.5);
  });

  it("alternar no mesmo modo é no-op (não muda o amount)", () => {
    const start: EditState = { amount: 999.99, mode: "divide", count: 5 };
    const same = toggleDivide(start);
    expect(same.amount).toBe(999.99);
    expect(same.mode).toBe("divide");
  });

  it("validação: divide sem valor total é rejeitada", () => {
    expect(validateInstallmentInputs("divide", 0, 0, 4)).toMatch(/valor total/i);
  });

  it("validação: fixed sem valor por parcela é rejeitada", () => {
    expect(validateInstallmentInputs("fixed", 0, 0, 4)).toMatch(/por parcela/i);
  });

  it("validação: entrada válida em ambos os modos retorna null", () => {
    expect(validateInstallmentInputs("divide", 1000, 0, 4)).toBeNull();
    expect(validateInstallmentInputs("fixed", 0, 250, 4)).toBeNull();
    // O diálogo de edição repassa o valor digitado em `amount` (para o modo ativo)
    // e `fixedValue = amount` quando fixed — cobrindo esse caminho:
    expect(validateInstallmentInputs("fixed", 250, 250, 4)).toBeNull();
  });
});
