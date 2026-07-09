/**
 * Testes de boundary para número de parcelas (N):
 *   - Valores extremos: 1, 2, 12, muito grande (10_000).
 *   - Divergência entre null / undefined / string numérica.
 *   - Garantia de que o gate (detectInstallmentChanges + splitInstallmentChanges)
 *     e os cálculos (calculateInstallmentDetails, changeInstallmentCount) não
 *     quebram e produzem resultados coerentes.
 */
import { describe, it, expect } from "vitest";
import {
  detectInstallmentChanges,
  splitInstallmentChanges,
  type InstallmentEditSnapshot,
} from "@/lib/installment-edit";
import {
  calculateInstallmentDetails,
  type InstallmentMode,
} from "@/lib/installment-utils";
import {
  changeInstallmentCount,
  validateInstallmentInputs,
} from "@/lib/installment-mode-toggle";

const CENT = 0.01;

function makeSnap(over: Partial<InstallmentEditSnapshot> = {}): InstallmentEditSnapshot {
  return {
    name: "Compra",
    amount: 100,
    total_installments: 12,
    category: "Casa",
    icon: "🏠",
    date: "10 mar",
    card: "Nubank",
    bank_account_id: null,
    ...over,
  };
}

describe("Boundary de Nº de parcelas — gate detectInstallmentChanges", () => {
  it("N igual em ambos os lados não gera 'Nº de parcelas'", () => {
    const orig = makeSnap({ total_installments: 12 });
    const edit = makeSnap({ total_installments: 12 });
    expect(detectInstallmentChanges(orig, edit, edit.amount)).not.toContain("Nº de parcelas");
  });

  const changed: Array<[any, any, string]> = [
    [1, 2, "1 → 2"],
    [12, 1, "12 → 1"],
    [2, 12, "2 → 12"],
    [12, 10_000, "12 → 10000 (muito grande)"],
    [10_000, 12, "10000 → 12"],
  ];
  it.each(changed)("N %s detecta mudança estrutural", (from, to) => {
    const orig = makeSnap({ total_installments: from });
    const edit = makeSnap({ total_installments: to });
    const changes = detectInstallmentChanges(orig, edit, edit.amount);
    expect(changes).toContain("Nº de parcelas");
    const { structural } = splitInstallmentChanges(changes);
    expect(structural).toContain("Nº de parcelas");
  });

  it("null e undefined são tratados como equivalentes (?? null) — SEM mudança", () => {
    const orig = makeSnap({ total_installments: null });
    const edit = makeSnap({ total_installments: undefined });
    expect(detectInstallmentChanges(orig, edit, edit.amount))
      .not.toContain("Nº de parcelas");
  });

  it("undefined ↔ null em ambas direções: sem falso positivo", () => {
    expect(
      detectInstallmentChanges(
        makeSnap({ total_installments: undefined }),
        makeSnap({ total_installments: null }),
        100,
      ),
    ).not.toContain("Nº de parcelas");
  });

  it("null vs 12 detecta mudança estrutural", () => {
    const changes = detectInstallmentChanges(
      makeSnap({ total_installments: null }),
      makeSnap({ total_installments: 12 }),
      100,
    );
    expect(changes).toContain("Nº de parcelas");
    expect(splitInstallmentChanges(changes).structural).toContain("Nº de parcelas");
  });

  it("string numérica '12' vs number 12 são DIFERENTES pelo comparador estrito (===)", () => {
    // O código real usa `!==` estrito — string "12" e number 12 divergem.
    // O gate ABRE. Este teste documenta esse comportamento para evitar regressão.
    const changes = detectInstallmentChanges(
      makeSnap({ total_installments: 12 }),
      // @ts-expect-error — divergência intencional de tipo
      makeSnap({ total_installments: "12" }),
      100,
    );
    expect(changes).toContain("Nº de parcelas");
  });

  it("string '0' vs number 0 (não usual, mas boundary): divergem por ===", () => {
    const changes = detectInstallmentChanges(
      makeSnap({ total_installments: 0 }),
      // @ts-expect-error
      makeSnap({ total_installments: "0" }),
      100,
    );
    expect(changes).toContain("Nº de parcelas");
  });

  it("NaN vs NaN: NaN !== NaN, então o gate sempre acusa mudança (documentado)", () => {
    const changes = detectInstallmentChanges(
      makeSnap({ total_installments: NaN }),
      makeSnap({ total_installments: NaN }),
      100,
    );
    expect(changes).toContain("Nº de parcelas");
  });
});

describe("Boundary de Nº de parcelas — cálculos não quebram", () => {
  const cases: Array<{ n: any; expected: number; label: string }> = [
    { n: 1, expected: 1, label: "N=1 (min)" },
    { n: 2, expected: 2, label: "N=2" },
    { n: 12, expected: 12, label: "N=12 (típico)" },
    { n: 10_000, expected: 10_000, label: "N=10000 (muito grande)" },
    { n: 0, expected: 1, label: "N=0 saneado para 1" },
    { n: -5, expected: 1, label: "N negativo saneado para 1" },
    { n: 1.7, expected: 1, label: "N fracionário → floor" },
    { n: 12.9, expected: 12, label: "N=12.9 → 12" },
    { n: null, expected: 1, label: "N=null saneado para 1" },
    { n: undefined, expected: 1, label: "N=undefined saneado para 1" },
    { n: NaN, expected: 1, label: "N=NaN saneado para 1" },
  ];

  it.each(cases)("$label: calculateInstallmentDetails não lança e count = $expected", ({ n, expected }) => {
    const res = calculateInstallmentDetails(1200, n as number, "divide");
    expect(res.count).toBe(expected);
    expect(Number.isFinite(res.valorParcela)).toBe(true);
    expect(Number.isFinite(res.totalCalculado)).toBe(true);
  });

  it("N muito grande (10_000) em 1200: parcela ≥ 0 e soma respeita drift ⌈N/2⌉¢", () => {
    const total = 1200;
    const n = 10_000;
    const { valorParcela, totalCalculado } = calculateInstallmentDetails(total, n, "divide");
    expect(valorParcela).toBeGreaterThanOrEqual(0);
    const drift = Math.abs(totalCalculado - total);
    expect(drift).toBeLessThanOrEqual(Math.ceil(n / 2) * CENT + 1e-9);
  });

  it("N=1 em qualquer modo: parcela == total", () => {
    const r1 = calculateInstallmentDetails(999.99, 1, "divide");
    expect(r1.valorParcela).toBe(999.99);
    expect(r1.totalCalculado).toBe(999.99);

    const r2 = calculateInstallmentDetails(0, 1, "fixed", 999.99);
    expect(r2.valorParcela).toBe(999.99);
    expect(r2.totalCalculado).toBe(999.99);
  });

  it("changeInstallmentCount: prev/next inválidos (0, negativo, NaN) são saneados", () => {
    const inputs = [
      { prev: 0, next: 12 },
      { prev: 12, next: 0 },
      { prev: -3, next: 6 },
      { prev: NaN, next: 12 },
      { prev: 12, next: NaN },
    ];
    for (const { prev, next } of inputs) {
      const r = changeInstallmentCount({
        mode: "divide",
        amount: 1200,
        prevCount: prev,
        newCount: next,
      });
      expect(Number.isFinite(r.amount)).toBe(true);
      expect(Number.isFinite(r.fixedValue)).toBe(true);
      expect(r.total).toBe(1200);
    }
  });

  it("validateInstallmentInputs: N=0 e N negativos são aceitos pelo saneador (min = 1) e retornam null com valor válido", () => {
    // O saneador interno faz Math.max(1, floor(count)); portanto o único erro
    // real virá do valor, não de N. Isso documenta o contrato atual.
    expect(validateInstallmentInputs("divide", 100, 0, 0)).toBeNull();
    expect(validateInstallmentInputs("divide", 100, 0, -10)).toBeNull();
    expect(validateInstallmentInputs("divide", 0, 0, 12)).not.toBeNull(); // valor inválido
  });

  const modes: InstallmentMode[] = ["divide", "fixed"];
  const ns = [1, 2, 12, 10_000];
  for (const mode of modes) {
    for (const n of ns) {
      it(`invariantes financeiras: mode=${mode} N=${n} — não NaN, drift ≤ ⌈N/2⌉¢`, () => {
        const total = 1234.56;
        const per = Math.round((total / n) * 100) / 100;
        const res = calculateInstallmentDetails(
          mode === "divide" ? total : 0,
          n,
          mode,
          mode === "fixed" ? per : 0,
        );
        expect(Number.isNaN(res.valorParcela)).toBe(false);
        expect(Number.isNaN(res.totalCalculado)).toBe(false);
        expect(res.count).toBe(n);
        const drift = Math.abs(res.totalCalculado - (mode === "divide" ? total : per * n));
        expect(drift).toBeLessThanOrEqual(Math.ceil(n / 2) * CENT + 1e-9);
      });
    }
  }
});
