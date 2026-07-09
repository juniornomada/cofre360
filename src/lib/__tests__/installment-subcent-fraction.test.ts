/**
 * Entradas de `amount` com frações de centavo (ex.: 1.005, 2.675, 3.14159)
 * ou aritmética binária "traiçoeira" (0.1 + 0.2, etc.) devem:
 *
 *   1) ser arredondadas de forma determinística a 2 casas por
 *      `calculateInstallmentDetails` — nunca deixar sub-cent "vazando"
 *      para os campos persistidos;
 *   2) manter drift `|sum(amount) - installment_source_amount| ≤ N¢`
 *      antes e depois de propagações cosméticas;
 *   3) preservar o invariante do modo `fixed` (soma exata);
 *   4) sobreviver a múltiplas rodadas de propagação sem acumular erro.
 *
 * Esses casos complementam `installment-extreme-rounding` e
 * `installment-rounding-invariance` cobrindo especificamente entradas
 * pré-arredondamento (sub-centavo) que o usuário poderia digitar via
 * calculadora, importação de CSV ou colagem de PDF.
 */
import { describe, it, expect } from "vitest";
import {
  validateGroupCoherence,
  type InstallmentGroupRow,
} from "@/lib/installment-edit";
import { calculateInstallmentDetails } from "@/lib/installment-utils";

const CENT = 0.01;

function buildDivideGroup(source: number, n: number): InstallmentGroupRow[] {
  const { valorParcela } = calculateInstallmentDetails(source, n, "divide");
  // O que persiste é SEMPRE o `source` arredondado a 2 casas — sub-cent nunca vaza.
  const roundedSource = Math.round(source * 100) / 100;
  return Array.from({ length: n }, (_, i) => ({
    installment_group_id: "g-subcent",
    installment_number: i + 1,
    total_installments: n,
    amount: valorParcela,
    installment_source_amount: roundedSource,
    installment_mode: "divide",
    category: "Casa",
    icon: "🏠",
    card: "Nubank",
    bank_account_id: null,
  }));
}

function buildFixedGroup(perInstallment: number, n: number): InstallmentGroupRow[] {
  const { valorParcela, totalCalculado } = calculateInstallmentDetails(
    0,
    n,
    "fixed",
    perInstallment,
  );
  return Array.from({ length: n }, (_, i) => ({
    installment_group_id: "g-subcent-f",
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

function propagateCosmetic(
  rows: InstallmentGroupRow[],
  fields: Partial<Pick<InstallmentGroupRow, "category" | "icon" | "card" | "bank_account_id">>,
): InstallmentGroupRow[] {
  return rows.map((r) => ({ ...r, ...fields }));
}

describe("Arredondamento de amount com frações de centavo (sub-cent)", () => {
  describe("modo divide: sub-cent nunca vaza para amount/source persistidos", () => {
    const cases: Array<{ label: string; source: number; n: number }> = [
      { label: "1.005 (banker's rounding halfway) em 3x", source: 1.005, n: 3 },
      { label: "2.675 (halfway clássico do IEEE 754) em 4x", source: 2.675, n: 4 },
      { label: "0.1 + 0.2 = 0.30000000000000004 em 2x", source: 0.1 + 0.2, n: 2 },
      { label: "π em 12x", source: Math.PI, n: 12 },
      { label: "9.999 em 3x (arredonda p/ 10,00)", source: 9.999, n: 3 },
      { label: "99.995 em 5x", source: 99.995, n: 5 },
      { label: "123.4567 em 7x", source: 123.4567, n: 7 },
      { label: "1000.005 em 12x", source: 1000.005, n: 12 },
    ];

    it.each(cases)("$label — amounts têm no máx. 2 casas e drift ≤ N¢", ({ source, n }) => {
      const rows = buildDivideGroup(source, n);
      const roundedSource = Math.round(source * 100) / 100;

      // Nenhum campo persistido carrega sub-cent.
      for (const r of rows) {
        expect(Math.round(r.amount * 100) / 100).toBe(r.amount);
        expect(Math.round((r.installment_source_amount as number) * 100) / 100).toBe(
          r.installment_source_amount,
        );
      }

      const sum = rows.reduce((s, r) => s + r.amount, 0);
      expect(Math.abs(sum - roundedSource)).toBeLessThanOrEqual(n * CENT + 1e-9);

      expect(validateGroupCoherence(rows).ok).toBe(true);
    });

    it.each(cases)(
      "$label — propagação cosmética não altera amount nem aumenta drift",
      ({ source, n }) => {
        const rows = buildDivideGroup(source, n);
        const before = rows.map((r) => r.amount);
        const propagated = propagateCosmetic(rows, {
          category: "Alimentação",
          icon: "🍔",
          card: "XP",
          bank_account_id: "acc-1",
        });
        propagated.forEach((r, i) => expect(r.amount).toBe(before[i]));

        const roundedSource = Math.round(source * 100) / 100;
        const sum = propagated.reduce((s, r) => s + r.amount, 0);
        expect(Math.abs(sum - roundedSource)).toBeLessThanOrEqual(n * CENT + 1e-9);

        expect(
          validateGroupCoherence(propagated, {
            category: "Alimentação",
            icon: "🍔",
            card: "XP",
            bank_account_id: "acc-1",
          }).ok,
        ).toBe(true);
      },
    );
  });

  describe("modo fixed: sub-cent na parcela também é arredondado", () => {
    const cases: Array<{ label: string; per: number; n: number }> = [
      { label: "1.005 × 12", per: 1.005, n: 12 },
      { label: "2.675 × 4", per: 2.675, n: 4 },
      { label: "(0.1 + 0.2) × 10", per: 0.1 + 0.2, n: 10 },
      { label: "π × 3", per: Math.PI, n: 3 },
      { label: "83.3333333 × 12 (dízima)", per: 83.3333333, n: 12 },
    ];

    it.each(cases)("$label — parcela arredondada a 2 casas e soma exata", ({ per, n }) => {
      const rows = buildFixedGroup(per, n);
      const perRounded = Math.round(per * 100) / 100;
      for (const r of rows) {
        expect(r.amount).toBe(perRounded);
      }
      const source = rows[0].installment_source_amount as number;
      const sum = rows.reduce((s, r) => s + r.amount, 0);
      // Em fixed a soma é exata (ignorando FP puro).
      expect(Math.abs(sum - source)).toBeLessThan(1e-6);
      expect(validateGroupCoherence(rows).ok).toBe(true);
    });
  });

  describe("propagações consecutivas com fonte sub-cent não acumulam drift", () => {
    it("1000.005 em 12x sobrevive a 10 rodadas de propagação", () => {
      let rows = buildDivideGroup(1000.005, 12);
      const roundedSource = 1000.01; // 1000.005 arredonda para 1000,01
      const originalAmounts = rows.map((r) => r.amount);

      const patches: Array<Parameters<typeof propagateCosmetic>[1]> = [
        { category: "A" }, { icon: "🎯" }, { card: "Itaú" }, { bank_account_id: "b1" },
        { category: "B", icon: "🍕" }, { card: null }, { bank_account_id: null },
        { category: "C" }, { icon: "💼" }, { card: "Bradesco" },
      ];
      for (const p of patches) {
        rows = propagateCosmetic(rows, p);
        rows.forEach((r, i) => expect(r.amount).toBe(originalAmounts[i]));
        const sum = rows.reduce((s, r) => s + r.amount, 0);
        expect(Math.abs(sum - roundedSource)).toBeLessThanOrEqual(12 * CENT + 1e-9);
      }
      expect(validateGroupCoherence(rows).ok).toBe(true);
    });
  });
});
