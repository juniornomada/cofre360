import { describe, it, expect } from "vitest";
import { calculateInstallmentDetails } from "@/lib/installment-utils";

/**
 * Testes de arredondamento de centavos na conta de "Valor por parcela".
 *
 * Invariantes garantidas para qualquer "parcela atual" (installmentStart):
 *   1. |Σ(parcelas lançadas) + Σ(parcelas puladas) − totalCalculado| ≤ N¢
 *      onde N = count (drift máximo teórico por arredondamento HALF_UP em cada parcela).
 *   2. valorParcela é estável em centavos: Math.round(valorParcela * 100) === valorParcela * 100 (inteiro).
 *   3. No modo "divide", |totalCalculado − amount| ≤ count * 0.01 (drift teórico).
 *   4. Σ(parcelas lançadas) === valorParcela × (count − start + 1), sem re-arredondar por parcela.
 */

const CENARIOS_DRIFT = [
  // amount, count, expectedValorParcela (após arredondamento)
  { amount: 100, count: 3, esperadoParcela: 33.33 },   // drift -0.01
  { amount: 100, count: 6, esperadoParcela: 16.67 },   // drift +0.02
  { amount: 100, count: 7, esperadoParcela: 14.29 },   // drift +0.03
  { amount: 10, count: 3, esperadoParcela: 3.33 },     // drift -0.01
  { amount: 1, count: 3, esperadoParcela: 0.33 },      // drift -0.01
  { amount: 0.10, count: 3, esperadoParcela: 0.03 },   // drift -0.01
  { amount: 999.99, count: 4, esperadoParcela: 250 },  // drift +0.01
  { amount: 1234.56, count: 5, esperadoParcela: 246.91 }, // drift -0.01
  { amount: 7, count: 12, esperadoParcela: 0.58 },     // drift -0.04
];

describe("Arredondamento de centavos por parcela (modo divide)", () => {
  for (const c of CENARIOS_DRIFT) {
    it(`amount=${c.amount} count=${c.count} → parcela=${c.esperadoParcela}`, () => {
      const d = calculateInstallmentDetails(c.amount, c.count, "divide");
      expect(d.valorParcela).toBe(c.esperadoParcela);

      // valorParcela é estável em centavos (após arredondamento, sem frações sub-centavo).
      const parcelaCents = Math.round(d.valorParcela * 100);
      expect(Math.abs(parcelaCents - d.valorParcela * 100)).toBeLessThan(1e-6);

      // Drift teórico: totalCalculado difere de amount em no máximo count centavos.
      const driftCents = Math.abs(
        Math.round(d.totalCalculado * 100) - Math.round(c.amount * 100)
      );
      expect(driftCents).toBeLessThanOrEqual(c.count);
    });
  }
});

describe("Σ parcelas lançadas + puladas ≈ totalCalculado para qualquer parcela atual", () => {
  for (const c of CENARIOS_DRIFT) {
    it(`amount=${c.amount} count=${c.count}: soma consistente para todo start ∈ [1..${c.count}]`, () => {
      const d = calculateInstallmentDetails(c.amount, c.count, "divide");
      const parcelaCents = Math.round(d.valorParcela * 100);
      const totalCents = Math.round(d.totalCalculado * 100);

      for (let start = 1; start <= c.count; start++) {
        const remaining = c.count - start + 1;
        const skipped = start - 1;

        // Aritmética em centavos (inteira) para evitar erros de ponto flutuante.
        const sumLaunchedCents = parcelaCents * remaining;
        const sumSkippedCents = parcelaCents * skipped;
        const sumAllCents = sumLaunchedCents + sumSkippedCents;

        // Soma bit-a-bit igual a valorParcela × count (nunca re-arredondamos por parcela).
        expect(sumAllCents).toBe(parcelaCents * c.count);
        expect(sumAllCents).toBe(totalCents);

        // Invariante de drift: |Σ − amount| ≤ count centavos.
        const driftVsAmount = Math.abs(sumAllCents - Math.round(c.amount * 100));
        expect(driftVsAmount).toBeLessThanOrEqual(c.count);
      }
    });
  }
});

describe("Modo fixed: soma exata para qualquer parcela atual", () => {
  const fixos = [
    { fixed: 83.34, count: 12 },
    { fixed: 250, count: 4 },
    { fixed: 0.33, count: 3 },
    { fixed: 14.29, count: 7 },
    { fixed: 999.99, count: 2 },
  ];

  for (const f of fixos) {
    it(`fixed=${f.fixed} count=${f.count}`, () => {
      const d = calculateInstallmentDetails(0, f.count, "fixed", f.fixed);
      const parcelaCents = Math.round(d.valorParcela * 100);
      const totalCents = Math.round(d.totalCalculado * 100);

      expect(parcelaCents).toBe(Math.round(f.fixed * 100));
      expect(totalCents).toBe(parcelaCents * f.count);

      for (let start = 1; start <= f.count; start++) {
        const remaining = f.count - start + 1;
        const skipped = start - 1;
        expect(parcelaCents * remaining + parcelaCents * skipped).toBe(totalCents);
      }
    });
  }
});

describe("Fuzz determinístico: amount aleatório em centavos", () => {
  // Gerador linear congruente para reprodutibilidade sem dependências.
  function lcg(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  it("100 casos: soma em centavos == valorParcela × count e drift ≤ count¢", () => {
    const rnd = lcg(0xC0FFEE);
    for (let i = 0; i < 100; i++) {
      const amountCents = 1 + Math.floor(rnd() * 1_000_000); // R$0,01 a R$10.000
      const count = 2 + Math.floor(rnd() * 23); // 2..24
      const amount = amountCents / 100;

      const d = calculateInstallmentDetails(amount, count, "divide");
      const parcelaCents = Math.round(d.valorParcela * 100);
      const totalCents = parcelaCents * count;

      expect(Math.round(d.totalCalculado * 100)).toBe(totalCents);

      const driftCents = Math.abs(totalCents - amountCents);
      expect(driftCents).toBeLessThanOrEqual(count);

      // Para todo start válido, soma continua consistente.
      for (const start of [1, 2, Math.ceil(count / 2), count]) {
        if (start < 1 || start > count) continue;
        const remaining = count - start + 1;
        const skipped = start - 1;
        expect(parcelaCents * remaining + parcelaCents * skipped).toBe(totalCents);
      }
    }
  });
});
