import { describe, it, expect } from "vitest";
import {
  calculateInstallmentDetails,
  type InstallmentMode,
} from "../installment-utils";
import {
  toDivideMode,
  toFixedMode,
  changeInstallmentCount,
} from "../installment-mode-toggle";

/**
 * Testes de borda com arredondamento extremo: valores muito pequenos e
 * centavos "quebrando" em N=12. Garantimos que a soma das parcelas
 * permanece coerente com o installment_source_amount dentro do drift
 * máximo teórico (cada parcela arredonda até 0,005 -> drift ≤ N/2 cents,
 * arredondado para o próximo centavo => ≤ ceil(N/2) centavos).
 */

const CENT = 0.01;

/** Drift máximo aceitável em reais para N parcelas arredondadas a 2 decimais. */
function maxDrift(count: number): number {
  return Math.ceil(count / 2) * CENT + 1e-9; // epsilon p/ float
}

/** Soma das N parcelas quando cada uma vale `valorParcela`. */
function sumOfInstallments(valorParcela: number, count: number): number {
  return Math.round(valorParcela * count * 100) / 100;
}

function assertDriftOk(source: number, count: number, valorParcela: number) {
  const sum = sumOfInstallments(valorParcela, count);
  const drift = Math.abs(sum - source);
  expect(drift).toBeLessThanOrEqual(maxDrift(count));
}

describe("Arredondamento extremo — soma de parcelas x installment_source_amount", () => {
  describe("valores muito pequenos em 12x", () => {
    const cases: Array<{ label: string; total: number }> = [
      { label: "R$ 0,01 em 12x (menor moeda)", total: 0.01 },
      { label: "R$ 0,02 em 12x", total: 0.02 },
      { label: "R$ 0,05 em 12x", total: 0.05 },
      { label: "R$ 0,11 em 12x", total: 0.11 },
      { label: "R$ 0,12 em 12x (exato: 1¢ cada)", total: 0.12 },
      { label: "R$ 0,13 em 12x", total: 0.13 },
      { label: "R$ 0,99 em 12x", total: 0.99 },
      { label: "R$ 1,00 em 12x", total: 1.0 },
    ];

    it.each(cases)("$label mantém drift ≤ ceil(N/2)¢", ({ total }) => {
      const { valorParcela } = calculateInstallmentDetails(total, 12, "divide");
      assertDriftOk(total, 12, valorParcela);
    });
  });

  describe("centavos quebrando em 12x (dízimas)", () => {
    // 100/12 = 8.3333..., 1000/12 = 83.3333..., 10/12 = 0.8333...
    const cases: Array<{ label: string; total: number }> = [
      { label: "R$ 10,00 em 12x", total: 10 },
      { label: "R$ 100,00 em 12x", total: 100 },
      { label: "R$ 1000,00 em 12x", total: 1000 },
      { label: "R$ 999,99 em 12x", total: 999.99 },
      { label: "R$ 1,99 em 12x", total: 1.99 },
      { label: "R$ 7,77 em 12x", total: 7.77 },
      { label: "R$ 33,33 em 12x", total: 33.33 },
      { label: "R$ 66,67 em 12x", total: 66.67 },
    ];

    it.each(cases)("$label mantém drift ≤ ceil(N/2)¢", ({ total }) => {
      const { valorParcela } = calculateInstallmentDetails(total, 12, "divide");
      assertDriftOk(total, 12, valorParcela);
    });
  });

  describe("valores muito pequenos em N variável (borda)", () => {
    const counts = [1, 2, 3, 5, 7, 11, 12];
    const smalls = [0.01, 0.03, 0.07, 0.11];
    for (const total of smalls) {
      for (const n of counts) {
        it(`R$ ${total.toFixed(2)} em ${n}x mantém drift ≤ ceil(N/2)¢`, () => {
          const { valorParcela } = calculateInstallmentDetails(total, n, "divide");
          assertDriftOk(total, n, valorParcela);
        });
      }
    }
  });

  describe("round-trip divide↔fixed preserva total econômico (drift ≤ N¢)", () => {
    const cases: Array<{ label: string; total: number; count: number }> = [
      { label: "R$ 0,01 em 12x", total: 0.01, count: 12 },
      { label: "R$ 0,07 em 12x", total: 0.07, count: 12 },
      { label: "R$ 100 em 12x", total: 100, count: 12 },
      { label: "R$ 999,99 em 12x", total: 999.99, count: 12 },
      { label: "R$ 1,00 em 3x", total: 1.0, count: 3 },
      { label: "R$ 10 em 7x", total: 10, count: 7 },
    ];

    it.each(cases)("$label: divide→fixed→divide", ({ total, count }) => {
      const start: InstallmentMode = "divide";
      const step1 = toFixedMode({
        fromMode: start,
        amount: total,
        fixedValue: 0,
        count,
      });
      // no modo fixed, amount == fixedValue == parcela
      expect(step1.amount).toBe(step1.fixedValue);

      const step2 = toDivideMode({
        fromMode: step1.mode,
        amount: step1.amount,
        fixedValue: step1.fixedValue,
        count,
      });

      // total após round-trip deve ficar dentro do drift
      const drift = Math.abs(step2.amount - total);
      expect(drift).toBeLessThanOrEqual(count * CENT + 1e-9);

      // e a soma real das parcelas ≈ step2.amount (invariante fixed)
      assertDriftOk(step2.amount, count, step1.fixedValue);
    });
  });

  describe("mudança de N preserva total econômico em fixed com valores quebrados", () => {
    // parcela pequena que multiplicada gera dízima
    const cases = [
      { per: 0.01, prev: 12, next: 3 },
      { per: 0.07, prev: 3, next: 12 },
      { per: 83.33, prev: 12, next: 6 }, // 1000/12
      { per: 0.83, prev: 12, next: 5 }, // 10/12
    ];

    it.each(cases)(
      "fixed per=$per: $prev→$next preserva total (drift ≤ max(prev,next)¢)",
      ({ per, prev, next }) => {
        const totalAntes = Math.round(per * prev * 100) / 100;
        const res = changeInstallmentCount({
          mode: "fixed",
          amount: per,
          fixedValue: per,
          prevCount: prev,
          newCount: next,
        });
        const totalDepois = Math.round(res.fixedValue * next * 100) / 100;
        const drift = Math.abs(totalDepois - totalAntes);
        expect(drift).toBeLessThanOrEqual(Math.max(prev, next) * CENT + 1e-9);
      },
    );
  });

  describe("invariante: em modo fixed, soma = parcela × N exatamente", () => {
    // No modo fixed não há divisão -> não há drift residual: soma bate exata.
    const cases = [
      { per: 0.01, n: 12 },
      { per: 0.33, n: 12 },
      { per: 83.33, n: 12 },
      { per: 0.07, n: 7 },
    ];
    it.each(cases)("per=$per × $n bate exato", ({ per, n }) => {
      const { valorParcela, totalCalculado } = calculateInstallmentDetails(
        0,
        n,
        "fixed",
        per,
      );
      expect(valorParcela).toBe(Math.round(per * 100) / 100);
      expect(totalCalculado).toBe(Math.round(per * n * 100) / 100);
    });
  });
});
