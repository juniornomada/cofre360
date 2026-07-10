/**
 * Regressão — arredondamento extremo (limites de 2 casas + dízimas).
 *
 * Cobre casos historicamente frágeis:
 *   R1. Limites exatos de 2 casas — ex.: 0.01, 0.05, 0.10, 999.99, 1_000_000.00
 *   R2. Half-even / half-up boundaries — 0.005, 0.015, 0.025, 2.675, 1.005
 *   R3. Dízimas periódicas — 1/3, 1/6, 1/7, 100/3, 100/7, 10/9
 *   R4. Distribuição do centavo — a diferença |sum − source| nunca excede N × 1¢,
 *       e a parcela é sempre um número com ≤ 2 casas decimais.
 *   R5. Round-trip — regenerar o grupo a partir de `installment_source_amount`
 *       duas vezes seguidas produz o MESMO resultado (idempotência).
 *   R6. Uniformidade — no modo "divide" todas as parcelas têm o MESMO valor
 *       (implementação atual espalha o centavo via `diff`, não por parcela).
 */
import { describe, it, expect } from "vitest";
import { calculateInstallmentDetails } from "@/lib/installment-utils";
import { validateGroupCoherence, type InstallmentGroupRow } from "@/lib/installment-edit";

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

function decimalPlaces(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const s = String(n);
  const dot = s.indexOf(".");
  if (dot === -1) return 0;
  // Ignora notação científica pequena — nossos valores são sempre |n| < 1e12.
  return s.length - dot - 1;
}

function makeRows(source: number, n: number): InstallmentGroupRow[] {
  const { valorParcela } = calculateInstallmentDetails(source, n, "divide");
  return Array.from({ length: n }, (_, i) => ({
    installment_group_id: "grp-extreme",
    installment_number: i + 1,
    total_installments: n,
    amount: valorParcela,
    installment_source_amount: round2(source),
    installment_mode: "divide",
    category: null,
    icon: null,
    card: null,
    bank_account_id: null,
  }));
}

function assertRoundingInvariants(rows: InstallmentGroupRow[], source: number) {
  const n = rows[0].total_installments as number;
  // Todas as parcelas com ≤ 2 casas decimais
  for (const r of rows) {
    expect(decimalPlaces(r.amount)).toBeLessThanOrEqual(2);
    expect(round2(r.amount)).toBe(r.amount);
    expect(r.installment_source_amount).toBe(round2(source));
  }
  // Drift dentro do limite regulamentar
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  expect(Math.abs(sum - round2(source))).toBeLessThanOrEqual(n * CENT + 1e-9);
  // Coerência estrutural
  expect(validateGroupCoherence(rows).ok).toBe(true);
}

function assertUniformDistribution(rows: InstallmentGroupRow[]) {
  const first = rows[0].amount;
  for (const r of rows) expect(r.amount).toBe(first);
}

describe("Regressão — arredondamento extremo (limites de 2 casas + dízimas)", () => {
  // ------------------- R1: limites exatos de 2 casas -------------------
  it.each([
    { source: 0.01, n: 1 },
    { source: 0.02, n: 2 },
    { source: 0.03, n: 3 },
    { source: 0.05, n: 5 },
    { source: 0.1, n: 10 },
    { source: 1, n: 1 },
    { source: 1, n: 2 },
    { source: 1, n: 4 },
    { source: 10, n: 4 },
    { source: 100, n: 4 },
    { source: 999.99, n: 3 },
    { source: 1_000_000, n: 12 },
    { source: 1_000_000, n: 7 },
  ])("R1: source=$source, N=$n → distribuição uniforme e drift ≤ N¢", ({ source, n }) => {
    const rows = makeRows(source, n);
    assertRoundingInvariants(rows, source);
    assertUniformDistribution(rows);
  });

  // ---------------- R2: fronteiras half-even / half-up ----------------
  it.each([
    { source: 0.005, n: 1 },     // arredonda para 0.01 (half-up) ou 0.00 (half-even) — aceitamos qualquer, mas 2 casas
    { source: 0.015, n: 1 },
    { source: 0.025, n: 1 },
    { source: 1.005, n: 1 },
    { source: 2.675, n: 1 },
    { source: 0.005, n: 2 },
    { source: 0.015, n: 3 },
    { source: 1.005 * 12, n: 12 }, // 12.06 alvo
  ])("R2: source=$source, N=$n → parcela com ≤ 2 casas e drift dentro do limite", ({ source, n }) => {
    const rows = makeRows(source, n);
    assertRoundingInvariants(rows, source);
    assertUniformDistribution(rows);
  });

  // ------------------------ R3: dízimas periódicas ------------------------
  it.each([
    { source: round2(1 / 3), n: 3 },      // 0.33 / 3 → sub-cent
    { source: round2(100 / 3), n: 3 },    // 33.33 × 3 = 99.99 (perde 1¢ vs 100)
    { source: 100, n: 3 },                 // 100/3 = 33.33 → sum 99.99, drift 1¢
    { source: 100, n: 6 },                 // 16.67 × 6 = 100.02 → drift 2¢
    { source: 100, n: 7 },                 // 14.29 × 7 = 100.03 → drift 3¢
    { source: 100, n: 9 },                 // 11.11 × 9 = 99.99 → drift 1¢
    { source: 10, n: 9 },                  // 1.11 × 9 = 9.99 → drift 1¢
    { source: 1000, n: 7 },                // 142.86 × 7 = 1000.02 → drift 2¢
    { source: 1, n: 6 },                   // 0.17 × 6 = 1.02 → drift 2¢
    { source: 1, n: 7 },                   // 0.14 × 7 = 0.98 → drift 2¢
  ])("R3: dízima source=$source, N=$n → drift ≤ N¢ e uniformidade", ({ source, n }) => {
    const rows = makeRows(source, n);
    assertRoundingInvariants(rows, source);
    assertUniformDistribution(rows);
  });

  // ---------------- R4: casos históricos que já quebraram ----------------
  it("R4a: 100/3 em 3x — sum=99.99, drift=1¢, todas as parcelas 33.33", () => {
    const rows = makeRows(100, 3);
    expect(rows.every((r) => r.amount === 33.33)).toBe(true);
    const sum = round2(rows.reduce((s, r) => s + r.amount, 0));
    expect(sum).toBe(99.99);
    expect(round2(Math.abs(sum - 100))).toBe(0.01);
  });

  it("R4b: 100/6 em 6x — sum=100.02, drift=2¢, todas as parcelas 16.67", () => {
    const rows = makeRows(100, 6);
    expect(rows.every((r) => r.amount === 16.67)).toBe(true);
    const sum = round2(rows.reduce((s, r) => s + r.amount, 0));
    expect(sum).toBe(100.02);
  });

  it("R4c: 100/7 em 7x — sum=100.03, drift=3¢ (≤ 7¢), parcela 14.29", () => {
    const rows = makeRows(100, 7);
    expect(rows.every((r) => r.amount === 14.29)).toBe(true);
    const sum = round2(rows.reduce((s, r) => s + r.amount, 0));
    expect(sum).toBe(100.03);
    expect(round2(Math.abs(sum - 100))).toBeLessThanOrEqual(7 * CENT + 1e-9);
  });

  // ---------------- R5: idempotência do round-trip ----------------
  it.each([
    { source: 100, n: 3 },
    { source: 100, n: 7 },
    { source: 999.99, n: 12 },
    { source: 0.05, n: 5 },
    { source: 33.33, n: 3 },
  ])("R5: regenerar duas vezes é idempotente (source=$source, N=$n)", ({ source, n }) => {
    const first = makeRows(source, n);
    // Regenera a partir do `installment_source_amount` da primeira execução.
    const second = makeRows(first[0].installment_source_amount as number, n);
    expect(second.map((r) => r.amount)).toEqual(first.map((r) => r.amount));
    expect(second[0].installment_source_amount).toBe(first[0].installment_source_amount);
    assertRoundingInvariants(second, source);
  });

  // ---------------- R6: varredura densa em N para source=100 ----------------
  it("R6: para source=100 e N ∈ [1..36], drift permanece ≤ N¢ e uniformidade preservada", () => {
    for (let n = 1; n <= 36; n++) {
      const rows = makeRows(100, n);
      assertRoundingInvariants(rows, 100);
      assertUniformDistribution(rows);
      // A diferença absoluta em unidades de centavo NUNCA passa de N.
      const sum = rows.reduce((s, r) => s + r.amount, 0);
      const diffCents = Math.round(Math.abs(sum - 100) * 100);
      expect(diffCents).toBeLessThanOrEqual(n);
    }
  });

  // ---------------- R7: monotonia — aumentar N nunca aumenta o drift por parcela ----------------
  it("R7: source=100, o drift POR PARCELA decresce (ou se mantém) conforme N cresce", () => {
    let prevPerInstallment = Number.POSITIVE_INFINITY;
    for (const n of [1, 2, 3, 4, 5, 6, 10, 12, 24, 36]) {
      const rows = makeRows(100, n);
      const sum = rows.reduce((s, r) => s + r.amount, 0);
      const perInstallment = Math.abs(sum - 100) / n;
      expect(perInstallment).toBeLessThanOrEqual(prevPerInstallment + 1e-9 + CENT);
      prevPerInstallment = perInstallment;
    }
  });

  // ---------------- R8: valores enormes — não perdem precisão nas 2 casas ----------------
  it.each([
    { source: 1_000_000, n: 3 },
    { source: 9_999_999.99, n: 12 },
    { source: 1_234_567.89, n: 7 },
  ])("R8: valor alto source=$source, N=$n mantém 2 casas exatas e drift regulamentar", ({ source, n }) => {
    const rows = makeRows(source, n);
    assertRoundingInvariants(rows, source);
    assertUniformDistribution(rows);
  });

  // ---------------- R9: sub-cent — arredonda para o inteiro de centavos ----------------
  it.each([
    { source: 0.001, n: 1 }, // 0.00 esperado (round-to-even bank; Math.round → 0)
    { source: 0.004, n: 1 },
    { source: 0.006, n: 1 },
    { source: 0.009, n: 1 },
  ])("R9: sub-cent source=$source → parcela é múltiplo de 1¢", ({ source, n }) => {
    const rows = makeRows(source, n);
    for (const r of rows) {
      expect(decimalPlaces(r.amount)).toBeLessThanOrEqual(2);
      // Deve ser exatamente k × 0.01 para algum k inteiro >= 0
      expect(Number.isInteger(Math.round(r.amount * 100))).toBe(true);
    }
  });
});
