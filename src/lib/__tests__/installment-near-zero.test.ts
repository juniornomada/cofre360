/**
 * Entradas `amount` MENORES que 1 centavo (ou muito próximas de zero) devem:
 *
 *   1) NÃO quebrar `calculateInstallmentDetails` — sem NaN/Infinity, sem exceções;
 *   2) Arredondar deterministicamente para 2 casas (podendo virar 0,00) e nunca
 *      deixar sub-cent vazando para `amount`/`installment_source_amount`;
 *   3) Manter a soma final dentro da tolerância teórica:
 *        - modo `divide`: `|sum − round2(source)| ≤ N × 1¢`
 *        - modo `fixed` : soma exata (drift ≈ 0, ignorando FP puro)
 *   4) Sobreviver a propagação cosmética sem alterar `amount`.
 *
 * Complementa `installment-subcent-fraction` cobrindo o extremo inferior:
 * 0, valores denormais, 0.004 (arredonda p/ 0), 0.005/0.009 (arredonda p/ 1¢).
 */
import { describe, it, expect } from "vitest";
import {
  validateGroupCoherence,
  type InstallmentGroupRow,
} from "@/lib/installment-edit";
import { calculateInstallmentDetails } from "@/lib/installment-utils";

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

function buildDivideGroup(source: number, n: number): InstallmentGroupRow[] {
  const { valorParcela } = calculateInstallmentDetails(source, n, "divide");
  return Array.from({ length: n }, (_, i) => ({
    installment_group_id: "g-near-zero",
    installment_number: i + 1,
    total_installments: n,
    amount: valorParcela,
    installment_source_amount: round2(source),
    installment_mode: "divide",
    category: "Casa",
    icon: "🏠",
    card: "Nubank",
    bank_account_id: null,
  }));
}

function buildFixedGroup(per: number, n: number): InstallmentGroupRow[] {
  const { valorParcela, totalCalculado } = calculateInstallmentDetails(0, n, "fixed", per);
  return Array.from({ length: n }, (_, i) => ({
    installment_group_id: "g-near-zero-f",
    installment_number: i + 1,
    total_installments: n,
    amount: valorParcela,
    installment_source_amount: totalCalculado,
    installment_mode: "fixed",
    category: "Casa",
    icon: "🏠",
    card: "Nubank",
    bank_account_id: null,
  }));
}

describe("Amount < 1¢ ou próximo de zero — cálculo não quebra e drift respeitado", () => {
  describe("calculateInstallmentDetails não retorna NaN/Infinity nem lança", () => {
    const smalls = [
      0,
      1e-12,
      1e-9,
      1e-6,
      0.001,
      0.004,     // arredonda p/ 0,00
      0.0049,    // arredonda p/ 0,00
      0.005,     // halfway — banker's/round-half-to-even em JS Math.round arredonda p/ 0,01
      0.009,     // arredonda p/ 0,01
      Number.MIN_VALUE, // denormal
    ];
    const counts = [1, 2, 3, 12];

    for (const total of smalls) {
      for (const n of counts) {
        it(`divide: total=${total}, n=${n} não quebra`, () => {
          const r = calculateInstallmentDetails(total, n, "divide");
          expect(Number.isFinite(r.valorParcela)).toBe(true);
          expect(Number.isFinite(r.totalCalculado)).toBe(true);
          expect(r.valorParcela).toBeGreaterThanOrEqual(0);
          // sempre 2 casas
          expect(round2(r.valorParcela)).toBe(r.valorParcela);
          expect(round2(r.totalCalculado)).toBe(r.totalCalculado);
        });

        it(`fixed: per=${total}, n=${n} não quebra e soma é exata`, () => {
          const r = calculateInstallmentDetails(0, n, "fixed", total);
          expect(Number.isFinite(r.valorParcela)).toBe(true);
          expect(r.valorParcela).toBeGreaterThanOrEqual(0);
          expect(round2(r.valorParcela)).toBe(r.valorParcela);
          expect(r.totalCalculado).toBe(round2(r.valorParcela * n));
        });
      }
    }
  });

  describe("modo divide: soma respeita |sum − round2(source)| ≤ N¢", () => {
    const cases: Array<{ label: string; source: number; n: number }> = [
      { label: "0 em 12x → todas parcelas 0,00", source: 0, n: 12 },
      { label: "0.001 em 3x (arredonda source p/ 0,00)", source: 0.001, n: 3 },
      { label: "0.004 em 5x (arredonda source p/ 0,00)", source: 0.004, n: 5 },
      { label: "0.005 em 2x (fronteira halfway)", source: 0.005, n: 2 },
      { label: "0.009 em 12x", source: 0.009, n: 12 },
      { label: "MIN_VALUE em 12x", source: Number.MIN_VALUE, n: 12 },
      { label: "1e-9 em 7x", source: 1e-9, n: 7 },
      { label: "0.01 em 12x (mínima moeda)", source: 0.01, n: 12 },
    ];

    it.each(cases)("$label", ({ source, n }) => {
      const rows = buildDivideGroup(source, n);
      // Nenhum sub-cent nos campos persistidos
      for (const r of rows) {
        expect(round2(r.amount)).toBe(r.amount);
        expect(r.amount).toBeGreaterThanOrEqual(0);
      }
      const sum = rows.reduce((s, r) => s + r.amount, 0);
      expect(Math.abs(sum - round2(source))).toBeLessThanOrEqual(n * CENT + 1e-9);
      expect(validateGroupCoherence(rows).ok).toBe(true);
    });
  });

  describe("modo fixed: soma exata mesmo com parcela sub-cent (arredondada)", () => {
    const cases: Array<{ label: string; per: number; n: number }> = [
      { label: "per=0 × 12", per: 0, n: 12 },
      { label: "per=0.001 × 12 (vira 0,00)", per: 0.001, n: 12 },
      { label: "per=0.004 × 7", per: 0.004, n: 7 },
      { label: "per=0.005 × 3", per: 0.005, n: 3 },
      { label: "per=0.009 × 5", per: 0.009, n: 5 },
      { label: "per=MIN_VALUE × 4", per: Number.MIN_VALUE, n: 4 },
    ];

    it.each(cases)("$label — soma == parcela × N exato", ({ per, n }) => {
      const rows = buildFixedGroup(per, n);
      const source = rows[0].installment_source_amount as number;
      const sum = rows.reduce((s, r) => s + r.amount, 0);
      expect(Math.abs(sum - source)).toBeLessThan(1e-6);
      expect(validateGroupCoherence(rows).ok).toBe(true);
    });
  });

  describe("propagação cosmética não altera amount em grupos near-zero", () => {
    const cases: Array<[number, number]> = [
      [0, 12],
      [0.001, 12],
      [0.005, 3],
      [0.01, 12],
      [1e-9, 7],
    ];
    it.each(cases)("source=%s em %sx", (source, n) => {
      const rows = buildDivideGroup(source, n);
      const before = rows.map((r) => r.amount);
      const propagated = rows.map((r) => ({
        ...r,
        category: "Alimentação",
        icon: "🍔",
        card: "XP",
        bank_account_id: "acc-1",
      }));
      propagated.forEach((r, i) => expect(r.amount).toBe(before[i]));
      const sum = propagated.reduce((s, r) => s + r.amount, 0);
      expect(Math.abs(sum - round2(source))).toBeLessThanOrEqual(n * CENT + 1e-9);
      expect(
        validateGroupCoherence(propagated, {
          category: "Alimentação",
          icon: "🍔",
          card: "XP",
          bank_account_id: "acc-1",
        }).ok,
      ).toBe(true);
    });
  });

  describe("entradas patológicas: NaN / Infinity / negativas não geram lixo", () => {
    it("divide com total NaN retorna valores finitos (tratado como 0)", () => {
      const r = calculateInstallmentDetails(Number.NaN, 3, "divide");
      // A implementação usa `amount || 0`, então NaN vira 0.
      expect(Number.isFinite(r.valorParcela)).toBe(true);
      expect(r.valorParcela).toBe(0);
    });
    it("fixed com per=Infinity é sanitizado ou marcado (não lança)", () => {
      // Não exigimos comportamento específico além de "não lançar" e retornar número.
      expect(() => calculateInstallmentDetails(0, 3, "fixed", Number.POSITIVE_INFINITY)).not.toThrow();
    });
    it("divide com n=0 é normalizado para n=1 (não divide por zero)", () => {
      const r = calculateInstallmentDetails(0.01, 0, "divide");
      expect(r.count).toBe(1);
      expect(Number.isFinite(r.valorParcela)).toBe(true);
    });
  });
});
