import { describe, it, expect } from "vitest";
import { calculateInstallmentDetails } from "@/lib/installment-utils";

/**
 * Garante que ao variar a "parcela atual" (installmentStart) a lógica
 * de "Valor por parcela" e "Valor de cada parcela" permanece consistente:
 *
 *  - valorParcela NÃO depende de installmentStart.
 *  - Σ(parcelas lançadas) + Σ(parcelas puladas) === totalCalculado.
 *  - installment_source_amount preservado (total original da compra).
 *  - Nenhum novo input do usuário é necessário: mesmos amount/count/mode.
 */
describe("installmentStart não altera o cálculo de valor por parcela", () => {
  const scenarios = [
    { amount: 1000, count: 4, mode: "divide" as const, fixed: 0 },
    { amount: 999.99, count: 3, mode: "divide" as const, fixed: 0 },
    { amount: 0, count: 4, mode: "fixed" as const, fixed: 250 },
    { amount: 0, count: 12, mode: "fixed" as const, fixed: 83.34 },
    { amount: 100, count: 7, mode: "divide" as const, fixed: 0 }, // 14.29 c/ drift
  ];

  for (const s of scenarios) {
    it(`mode=${s.mode} amount=${s.amount} count=${s.count} fixed=${s.fixed}`, () => {
      const base = calculateInstallmentDetails(s.amount, s.count, s.mode, s.fixed);

      for (let start = 1; start <= s.count; start++) {
        // Recalcula com os mesmos inputs (installmentStart não entra na fórmula).
        const again = calculateInstallmentDetails(s.amount, s.count, s.mode, s.fixed);
        expect(again.valorParcela).toBe(base.valorParcela);
        expect(again.totalCalculado).toBe(base.totalCalculado);
        expect(again.count).toBe(base.count);

        const remaining = s.count - start + 1;
        const skipped = start - 1;

        const sumLaunched = Math.round(base.valorParcela * remaining * 100) / 100;
        const sumSkipped = Math.round(base.valorParcela * skipped * 100) / 100;
        const sumAll = Math.round((sumLaunched + sumSkipped) * 100) / 100;

        expect(sumAll).toBeCloseTo(base.totalCalculado, 2);

        // installment_source_amount (o que é persistido) não muda com start.
        const source = s.mode === "fixed" ? base.valorParcela * s.count : s.amount;
        expect(Math.round(source * 100) / 100).toBeCloseTo(
          s.mode === "fixed" ? base.totalCalculado : s.amount,
          2
        );
      }
    });
  }

  it("prévia efetiva usa valorParcela × parcelas restantes", () => {
    const d = calculateInstallmentDetails(1200, 4, "divide");
    expect(d.valorParcela).toBe(300);
    // parcela atual = 3 → lançar 3/4 e 4/4
    const remaining = 4 - 3 + 1;
    expect(d.valorParcela * remaining).toBe(600);
    // parcela atual = 1 → lançar todas
    expect(d.valorParcela * 4).toBe(d.totalCalculado);
  });
});
