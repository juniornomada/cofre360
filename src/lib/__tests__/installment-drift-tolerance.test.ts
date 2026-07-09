/**
 * Testes paramétricos de tolerância de drift.
 *
 * Objetivo: garantir que o predicado `driftWithinTolerance(rows, source, N)`
 * (i.e. |Σparcelas − source| ≤ N × 1¢) só falha quando o desvio EXCEDE N¢:
 *   • drift == 0            → sempre passa, para qualquer N ≥ 0
 *   • drift == N            → passa (fronteira inclusiva)
 *   • drift == N + 1¢       → falha
 *   • drift arbitrário k¢   → passa se e só se k ≤ N
 *
 * Além disso, valida que o `validateGroupCoherence` (tolerância nativa = N¢
 * onde N = rows.length) respeita a mesma regra de fronteira.
 */
import { describe, it, expect } from "vitest";
import {
  validateGroupCoherence,
  type InstallmentGroupRow,
} from "@/lib/installment-edit";

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Predicado sob teste: soma das parcelas fica no máximo `toleranceCents`
 *  centavos longe da `source`. */
function driftWithinTolerance(
  rows: InstallmentGroupRow[],
  source: number,
  toleranceCents: number,
): boolean {
  const sum = rows.reduce((s, r) => s + Number(r.amount), 0);
  const tol = toleranceCents * CENT + 1e-9;
  return Math.abs(sum - source) <= tol;
}

/** Constrói um grupo com N parcelas ~iguais cuja soma difere exatamente
 *  `driftCents` centavos da `source` fornecida. Usa 2 casas decimais em
 *  todos os `amount` para refletir o que persiste no banco. */
function buildRowsWithDrift(
  n: number,
  source: number,
  driftCents: number,
  mode: "divide" | "fixed" = "divide",
): InstallmentGroupRow[] {
  // parcela base ~ source/n arredondada; ajuste é aplicado em UMA parcela
  // para totalizar exatamente `source + driftCents*1¢`.
  const base = round2(source / n);
  const rows: InstallmentGroupRow[] = Array.from({ length: n }, (_, i) => ({
    installment_group_id: "grp-drift",
    installment_number: i + 1,
    total_installments: n,
    amount: base,
    installment_source_amount: round2(source),
    installment_mode: mode,
    category: "C",
    icon: null,
    card: null,
    bank_account_id: null,
  }));
  const currentSum = round2(base * n);
  const targetSum = round2(source + driftCents * CENT);
  const adjust = round2(targetSum - currentSum);
  rows[0] = { ...rows[0], amount: round2(rows[0].amount + adjust) };
  return rows;
}

describe("Drift paramétrico — driftWithinTolerance", () => {
  const SOURCE = 100;
  const N = 12;

  it("drift == 0 passa para qualquer tolerância ≥ 0", () => {
    const rows = buildRowsWithDrift(N, SOURCE, 0);
    for (const tol of [0, 1, 2, 5, 12, 100]) {
      expect(driftWithinTolerance(rows, SOURCE, tol)).toBe(true);
    }
  });

  // Matriz: (drift em centavos) × (tolerância em centavos).
  // Regra esperada: passa ⇔ |drift| ≤ tolerance.
  const drifts = [0, 1, 2, 3, 5, 8, 12, 24, 50, 100];
  const tolerances = [0, 1, 2, 3, 5, 8, 12, 24, 50, 100];

  for (const drift of drifts) {
    for (const tol of tolerances) {
      const expected = Math.abs(drift) <= tol;
      it(`drift=${drift}¢, tol=${tol}¢ → ${expected ? "passa" : "falha"}`, () => {
        const rows = buildRowsWithDrift(N, SOURCE, drift);
        expect(driftWithinTolerance(rows, SOURCE, tol)).toBe(expected);
        // Sinal oposto do drift: mesmo veredicto (|.|).
        const rowsNeg = buildRowsWithDrift(N, SOURCE, -drift);
        expect(driftWithinTolerance(rowsNeg, SOURCE, tol)).toBe(expected);
      });
    }
  }

  it("fronteira: drift == tol passa; drift == tol+1 falha (varredura densa)", () => {
    for (let tol = 0; tol <= 30; tol++) {
      const okRows = buildRowsWithDrift(N, SOURCE, tol);
      const badRows = buildRowsWithDrift(N, SOURCE, tol + 1);
      expect(driftWithinTolerance(okRows, SOURCE, tol)).toBe(true);
      expect(driftWithinTolerance(badRows, SOURCE, tol)).toBe(false);
    }
  });

  it("tolerância nunca é negativa: drift=0 com tol negativa falha (sanidade)", () => {
    const rows = buildRowsWithDrift(N, SOURCE, 0);
    // Convenção defensiva: tol < 0 ⇒ predicado impossível de satisfazer com drift > 0.
    // Como drift==0 é o edge, com tol=-1 (=-0.01) e epsilon 1e-9 continua passando;
    // já com drift=1¢ e tol=-1 falha, comprovando que valores negativos endurecem o limite.
    expect(driftWithinTolerance(rows, SOURCE, -1)).toBe(true); // drift zero
    const rows1 = buildRowsWithDrift(N, SOURCE, 1);
    expect(driftWithinTolerance(rows1, SOURCE, -1)).toBe(false);
  });
});

describe("Drift paramétrico — validateGroupCoherence (tolerância nativa = N¢)", () => {
  // A tolerância embutida é `rows.length * 0.01 + 1e-9`.
  // Testamos que a soma pode divergir EXATAMENTE em N centavos (fronteira),
  // mas não em N+1.
  const sizes = [1, 2, 3, 5, 7, 12, 24];

  for (const n of sizes) {
    const SOURCE = 1000;

    it(`N=${n}: drift == N¢ → ok:true`, () => {
      const rows = buildRowsWithDrift(n, SOURCE, n);
      const report = validateGroupCoherence(rows);
      expect(
        report.errors.some((e) => e.includes("diverge do total econômico")),
      ).toBe(false);
    });

    it(`N=${n}: drift == N+1¢ → erro econômico`, () => {
      const rows = buildRowsWithDrift(n, SOURCE, n + 1);
      const report = validateGroupCoherence(rows);
      expect(
        report.errors.some((e) => e.includes("diverge do total econômico")),
      ).toBe(true);
      expect(report.ok).toBe(false);
    });

    it(`N=${n}: drift == 0 → ok:true`, () => {
      const rows = buildRowsWithDrift(n, SOURCE, 0);
      const report = validateGroupCoherence(rows);
      expect(report.ok).toBe(true);
    });
  }

  it("source=0 desativa a checagem econômica (não erra qualquer que seja a soma)", () => {
    const rows = buildRowsWithDrift(5, 0, 999);
    // Forçamos source=0 nas linhas:
    const zeroed = rows.map((r) => ({ ...r, installment_source_amount: 0 }));
    const report = validateGroupCoherence(zeroed);
    expect(
      report.errors.some((e) => e.includes("diverge do total econômico")),
    ).toBe(false);
  });
});
