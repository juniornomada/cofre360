/**
 * Garantia de invariantes de arredondamento durante a propagação:
 *
 * Mesmo quando o gate REJEITA valores estruturais inválidos (nome vazio, valor
 * ≤ 0, data vazia, Nº parcelas < 1), a propagação cosmética não pode alterar
 * `amount` de nenhuma parcela — portanto o drift de arredondamento entre
 * `sum(amount)` e `installment_source_amount` deve permanecer ≤ N centavos.
 *
 * Estes testes cobrem:
 *   1) grupos com drift de arredondamento pré-existente (divide),
 *   2) tentativas de edição estrutural inválida saneadas para "sem mudança",
 *   3) propagação de category / icon / card / bank_account_id em cima disso,
 *   4) validação final via validateGroupCoherence.
 */
import { describe, it, expect } from "vitest";
import {
  detectInstallmentChanges,
  splitInstallmentChanges,
  validateGroupCoherence,
  type InstallmentGroupRow,
  type InstallmentEditSnapshot,
} from "@/lib/installment-edit";
import { calculateInstallmentDetails } from "@/lib/installment-utils";

const CENT = 0.01;

/** Constrói um grupo `divide` com o drift natural de arredondamento. */
function makeDivideGroup(source: number, n: number, over: Partial<InstallmentGroupRow> = {}): InstallmentGroupRow[] {
  const { valorParcela } = calculateInstallmentDetails(source, n, "divide");
  const groupId = "grp-" + source + "-" + n;
  const rows: InstallmentGroupRow[] = [];
  for (let i = 1; i <= n; i++) {
    rows.push({
      installment_group_id: groupId,
      installment_number: i,
      total_installments: n,
      amount: valorParcela,
      installment_source_amount: source,
      installment_mode: "divide",
      category: "Casa",
      icon: "🏠",
      card: "Nubank",
      bank_account_id: null,
      ...over,
    });
  }
  return rows;
}

/** Constrói um grupo `fixed` (todas parcelas idênticas). */
function makeFixedGroup(fixed: number, n: number): InstallmentGroupRow[] {
  const source = Math.round(fixed * n * 100) / 100;
  const groupId = "grpf-" + fixed + "-" + n;
  return Array.from({ length: n }, (_, i) => ({
    installment_group_id: groupId,
    installment_number: i + 1,
    total_installments: n,
    amount: fixed,
    installment_source_amount: source,
    installment_mode: "fixed",
    category: "Casa",
    icon: "🏠",
    card: "Nubank",
    bank_account_id: null,
  }));
}

/**
 * Simula localmente o comportamento de `propagateCosmeticFieldsToGroup`
 * (que no runtime real atinge o Supabase): copia APENAS os campos cosméticos
 * para todas as linhas do grupo — nunca amount, nunca campos estruturais.
 */
function applyCosmeticPropagation(
  rows: InstallmentGroupRow[],
  fields: { category?: string | null; icon?: string | null; card?: string | null; bank_account_id?: string | null },
): InstallmentGroupRow[] {
  return rows.map((r) => ({
    ...r,
    ...(fields.category !== undefined ? { category: fields.category } : {}),
    ...(fields.icon !== undefined ? { icon: fields.icon } : {}),
    ...(fields.card !== undefined ? { card: fields.card } : {}),
    ...(fields.bank_account_id !== undefined ? { bank_account_id: fields.bank_account_id } : {}),
  }));
}

/**
 * Simula o gate real do diálogo de edição em transactions.tsx:
 * quando um campo estrutural do draft é INVÁLIDO (vazio, ≤ 0, NaN, etc.),
 * o payload de save é sanitizado — o campo estrutural é revertido ao original
 * e apenas cosméticos válidos entram.
 *
 * Retorna o snapshot "efetivamente editado" (após saneamento) para alimentar
 * detectInstallmentChanges.
 */
function sanitizeStructuralEdits(
  original: InstallmentEditSnapshot,
  edited: InstallmentEditSnapshot,
): InstallmentEditSnapshot {
  const cleaned: InstallmentEditSnapshot = { ...edited };
  // Nome vazio / só espaços → reverte
  if (!cleaned.name || !cleaned.name.trim()) cleaned.name = original.name;
  // Valor ≤ 0 ou NaN → reverte
  if (!Number.isFinite(cleaned.amount) || cleaned.amount <= 0) cleaned.amount = original.amount;
  // Data vazia / só espaços → reverte
  if (!cleaned.date || !String(cleaned.date).trim()) cleaned.date = original.date;
  // Nº parcelas < 1 ou NaN → reverte
  const n = cleaned.total_installments;
  if (n == null || !Number.isFinite(n) || (n as number) < 1) {
    cleaned.total_installments = original.total_installments;
  }
  return cleaned;
}

describe("Drift de arredondamento resiste a propagações com rejeição estrutural", () => {
  const scenarios: Array<[number, number]> = [
    [100, 3],       // 33,33 * 3 = 99,99 → drift 1¢
    [1000, 3],      // 333,33 * 3 = 999,99 → drift 1¢
    [100, 7],       // 14,29 * 7 = 100,03 → drift 3¢
    [1000, 12],     // 83,33 * 12 = 999,96 → drift 4¢
    [1234.56, 12],  // caso quebrado clássico
    [0.01, 12],     // mínimo por parcela
    [777.77, 5],    // primos + dízima
    [999.99, 11],   // primo N
  ];

  it.each(scenarios)(
    "grupo divide %s em %sx: propagação cosmética mantém drift ≤ N¢",
    (source, n) => {
      const rows = makeDivideGroup(source, n);
      // pré-condição: grupo coerente logo após criação
      let report = validateGroupCoherence(rows);
      expect(report.ok, report.errors.join("; ")).toBe(true);

      // Etapa 1: usuário tenta edição estrutural inválida (valor = 0, nome vazio, data vazia)
      const original: InstallmentEditSnapshot = {
        name: "Compra",
        amount: rows[0].amount,
        total_installments: n,
        category: "Casa",
        icon: "🏠",
        date: "10 mar",
        card: "Nubank",
        bank_account_id: null,
      };
      const brokenEdit: InstallmentEditSnapshot = {
        ...original,
        name: "   ",
        amount: 0,
        date: "",
        total_installments: 0,
        // …mas mudanças cosméticas VÁLIDAS entram junto
        category: "Alimentação",
        icon: "🍔",
        card: "XP",
      };
      const sanitized = sanitizeStructuralEdits(original, brokenEdit);

      // Gate: só campos cosméticos sobrevivem
      const changes = detectInstallmentChanges(original, sanitized, sanitized.amount);
      const { structural, cosmetic } = splitInstallmentChanges(changes);
      expect(structural).toEqual([]);
      expect(cosmetic.sort()).toEqual(["Categoria", "Cartão", "Ícone"].sort());

      // Etapa 2: propaga cosméticos para todas as parcelas
      const propagated = applyCosmeticPropagation(rows, {
        category: sanitized.category,
        icon: sanitized.icon,
        card: sanitized.card,
      });

      // Amounts imutáveis
      for (let i = 0; i < rows.length; i++) {
        expect(propagated[i].amount).toBe(rows[i].amount);
        expect(propagated[i].installment_source_amount).toBe(rows[i].installment_source_amount);
        expect(propagated[i].installment_number).toBe(rows[i].installment_number);
        expect(propagated[i].total_installments).toBe(rows[i].total_installments);
      }

      // Drift ≤ N * 1¢
      const sum = propagated.reduce((s, r) => s + r.amount, 0);
      const drift = Math.abs(sum - source);
      expect(drift).toBeLessThanOrEqual(n * CENT + 1e-9);

      // Coerência global após propagação, com cosméticos esperados
      report = validateGroupCoherence(propagated, {
        category: "Alimentação",
        icon: "🍔",
        card: "XP",
      });
      expect(report.ok, report.errors.join("; ")).toBe(true);
    },
  );

  it.each([
    [100, 1],
    [100, 2],
    [50.5, 12],
    [1.23, 10_000],
  ])("grupo fixed base=%s em %sx: propagação preserva soma exata", (fixed, n) => {
    const rows = makeFixedGroup(fixed, n);
    const source = rows[0].installment_source_amount as number;

    const propagated = applyCosmeticPropagation(rows, {
      category: "Transporte",
      bank_account_id: "acc-1",
    });
    for (let i = 0; i < rows.length; i++) {
      expect(propagated[i].amount).toBe(fixed);
    }
    const sum = propagated.reduce((s, r) => s + r.amount, 0);
    // Em fixed a soma é exata: drift == 0 (sem erro além de FP)
    expect(Math.abs(sum - source)).toBeLessThan(1e-6);

    const report = validateGroupCoherence(propagated, {
      category: "Transporte",
      bank_account_id: "acc-1",
    });
    expect(report.ok, report.errors.join("; ")).toBe(true);
  });

  it("propagações consecutivas nunca acumulam drift (10 rodadas)", () => {
    let rows = makeDivideGroup(1000, 12); // drift natural = 4¢
    const source = 1000;
    const originalAmounts = rows.map((r) => r.amount);

    const rounds = [
      { category: "A" },
      { icon: "🎯" },
      { card: "Itaú" },
      { bank_account_id: "b1" },
      { category: "B", icon: "🍕" },
      { card: null },
      { bank_account_id: null },
      { category: "C" },
      { icon: "💼" },
      { card: "Bradesco" },
    ];
    for (const patch of rounds) {
      rows = applyCosmeticPropagation(rows, patch);
      // amounts intactos a cada rodada
      rows.forEach((r, i) => expect(r.amount).toBe(originalAmounts[i]));
      const sum = rows.reduce((s, r) => s + r.amount, 0);
      expect(Math.abs(sum - source)).toBeLessThanOrEqual(12 * CENT + 1e-9);
    }
    expect(validateGroupCoherence(rows).ok).toBe(true);
  });

  it("edições estruturais inválidas + cosméticas válidas em 12x: 0 mudança estrutural, drift ≤ 12¢", () => {
    const rows = makeDivideGroup(333.33, 12);
    const original: InstallmentEditSnapshot = {
      name: "X",
      amount: rows[0].amount,
      total_installments: 12,
      category: "Casa",
      icon: "🏠",
      date: "10 mar",
      card: "Nubank",
      bank_account_id: null,
    };
    const attempts: InstallmentEditSnapshot[] = [
      { ...original, name: "", category: "Novo" },
      { ...original, amount: -50, icon: "⚡" },
      { ...original, amount: Number.NaN, card: "Itaú" },
      { ...original, date: "   ", bank_account_id: "acc-9" },
      { ...original, total_installments: 0, category: "Y" },
      { ...original, total_installments: null, icon: "🔥" },
    ];

    let current = rows;
    for (const attempt of attempts) {
      const sanitized = sanitizeStructuralEdits(original, attempt);
      const { structural, cosmetic } = splitInstallmentChanges(
        detectInstallmentChanges(original, sanitized, sanitized.amount),
      );
      expect(structural).toEqual([]);
      expect(cosmetic.length).toBeGreaterThan(0);

      current = applyCosmeticPropagation(current, {
        category: sanitized.category,
        icon: sanitized.icon,
        card: sanitized.card,
        bank_account_id: sanitized.bank_account_id,
      });
      const sum = current.reduce((s, r) => s + r.amount, 0);
      expect(Math.abs(sum - 333.33)).toBeLessThanOrEqual(12 * CENT + 1e-9);
    }
    expect(validateGroupCoherence(current).ok).toBe(true);
  });
});
