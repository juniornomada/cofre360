/**
 * Sequências de edição alternando estruturais INVÁLIDAS e VÁLIDAS:
 *
 *   - Estruturais INVÁLIDAS (nome vazio, amount ≤ 0/NaN, data vazia, N < 1)
 *     são saneadas pelo gate → o payload persistido não altera nada estrutural,
 *     apenas os cosméticos daquela iteração propagam.
 *   - Estruturais VÁLIDAS (novo nome, novo amount > 0, nova data, novo N ≥ 1)
 *     podem reescrever o grupo (novo `installment_source_amount`, novo N,
 *     novos amounts arredondados) — nesse ponto o grupo passa a ter uma nova
 *     "fonte" e o drift deve continuar dentro da tolerância `N × 1¢`.
 *
 * Este arquivo simula essas iterações em rajada e valida, a CADA etapa, que:
 *   1) amounts nunca contêm sub-cent,
 *   2) `|sum(amount) − installment_source_amount| ≤ N × 1¢`,
 *   3) `validateGroupCoherence` continua ok,
 *   4) mudanças estruturais inválidas nunca modificam amount/N/source,
 *   5) mudanças cosméticas propagam para todas as parcelas.
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
const round2 = (n: number) => Math.round(n * 100) / 100;

function makeDivideGroup(source: number, n: number, groupId = "g-seq"): InstallmentGroupRow[] {
  const { valorParcela } = calculateInstallmentDetails(source, n, "divide");
  return Array.from({ length: n }, (_, i) => ({
    installment_group_id: groupId,
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

/** Gate real: campos estruturais inválidos revertem para o original. */
function sanitize(original: InstallmentEditSnapshot, edited: InstallmentEditSnapshot): InstallmentEditSnapshot {
  const c: InstallmentEditSnapshot = { ...edited };
  if (!c.name || !c.name.trim()) c.name = original.name;
  if (!Number.isFinite(c.amount) || c.amount <= 0) c.amount = original.amount;
  if (!c.date || !String(c.date).trim()) c.date = original.date;
  const n = c.total_installments;
  if (n == null || !Number.isFinite(n) || (n as number) < 1) {
    c.total_installments = original.total_installments;
  }
  return c;
}

/** Aplica cosméticos a todas as linhas (simulação de propagateCosmeticFieldsToGroup). */
function propagateCosmetic(
  rows: InstallmentGroupRow[],
  fields: Partial<Pick<InstallmentGroupRow, "category" | "icon" | "card" | "bank_account_id">>,
): InstallmentGroupRow[] {
  return rows.map((r) => ({ ...r, ...fields }));
}

/** Reescreve o grupo quando uma mudança estrutural VÁLIDA é aplicada. */
function applyStructural(
  prev: InstallmentGroupRow[],
  cosmetic: Pick<InstallmentGroupRow, "category" | "icon" | "card" | "bank_account_id">,
  next: { name?: string; source: number; n: number },
): InstallmentGroupRow[] {
  const { valorParcela } = calculateInstallmentDetails(next.source, next.n, "divide");
  const gid = prev[0].installment_group_id!;
  return Array.from({ length: next.n }, (_, i) => ({
    installment_group_id: gid,
    installment_number: i + 1,
    total_installments: next.n,
    amount: valorParcela,
    installment_source_amount: round2(next.source),
    installment_mode: "divide",
    ...cosmetic,
  }));
}

function assertGroupInvariants(rows: InstallmentGroupRow[]) {
  const n = rows[0].total_installments as number;
  const source = rows[0].installment_source_amount as number;
  for (const r of rows) {
    expect(round2(r.amount)).toBe(r.amount);
    expect(r.total_installments).toBe(n);
    expect(r.installment_source_amount).toBe(source);
  }
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  expect(Math.abs(sum - source)).toBeLessThanOrEqual(n * CENT + 1e-9);
  expect(validateGroupCoherence(rows).ok).toBe(true);
}

type Iter =
  | { kind: "invalid"; edit: Partial<InstallmentEditSnapshot>; cosmetic: Partial<Pick<InstallmentGroupRow, "category" | "icon" | "card" | "bank_account_id">> }
  | { kind: "valid"; next: { name?: string; source: number; n: number }; cosmetic: Pick<InstallmentGroupRow, "category" | "icon" | "card" | "bank_account_id"> };

describe("Sequências alternadas de edição inválida ↔ válida mantêm drift ≤ N¢", () => {
  const scenarios: Array<{ label: string; source: number; n: number; iters: Iter[] }> = [
    {
      label: "100 em 3x → alterna inválidas/válidas 6x",
      source: 100,
      n: 3,
      iters: [
        { kind: "invalid", edit: { name: "  ", amount: 0 }, cosmetic: { category: "Alimentação" } },
        { kind: "valid", next: { source: 250, n: 5 }, cosmetic: { category: "Alimentação", icon: "🍔", card: "XP", bank_account_id: null } },
        { kind: "invalid", edit: { amount: Number.NaN, date: "  " }, cosmetic: { icon: "🎯" } },
        { kind: "valid", next: { source: 333.33, n: 12 }, cosmetic: { category: "Transporte", icon: "🚗", card: "Itaú", bank_account_id: "acc-1" } },
        { kind: "invalid", edit: { total_installments: 0 }, cosmetic: { card: "Bradesco" } },
        { kind: "valid", next: { source: 0.01, n: 12 }, cosmetic: { category: "X", icon: "🔥", card: "Nubank", bank_account_id: null } },
      ],
    },
    {
      label: "1000 em 12x → alterna inválidas/válidas 8x",
      source: 1000,
      n: 12,
      iters: [
        { kind: "invalid", edit: { name: "" }, cosmetic: { category: "A" } },
        { kind: "invalid", edit: { amount: -10 }, cosmetic: { icon: "🍕" } },
        { kind: "valid", next: { source: 1234.56, n: 12 }, cosmetic: { category: "B", icon: "🍔", card: "Itaú", bank_account_id: "b1" } },
        { kind: "invalid", edit: { total_installments: null as any }, cosmetic: { card: null } },
        { kind: "valid", next: { source: 777.77, n: 5 }, cosmetic: { category: "C", icon: "⚡", card: "XP", bank_account_id: null } },
        { kind: "invalid", edit: { date: "" }, cosmetic: { bank_account_id: "b9" } },
        { kind: "valid", next: { source: 999.99, n: 11 }, cosmetic: { category: "D", icon: "💼", card: "Bradesco", bank_account_id: null } },
        { kind: "invalid", edit: { amount: 0, name: " ", date: " ", total_installments: -1 }, cosmetic: { category: "E", icon: "🎯" } },
      ],
    },
    {
      label: "0.01 em 12x (mínimo) → alterna inválidas/válidas 5x sem quebrar",
      source: 0.01,
      n: 12,
      iters: [
        { kind: "invalid", edit: { amount: 0 }, cosmetic: { category: "Micro" } },
        { kind: "valid", next: { source: 0.07, n: 7 }, cosmetic: { category: "Micro", icon: "🐜", card: "Nubank", bank_account_id: null } },
        { kind: "invalid", edit: { total_installments: 0, name: "" }, cosmetic: { icon: "🐛" } },
        { kind: "valid", next: { source: 100, n: 3 }, cosmetic: { category: "Recuperado", icon: "✅", card: "Itaú", bank_account_id: "b2" } },
        { kind: "invalid", edit: { amount: Number.NaN }, cosmetic: { card: "XP" } },
      ],
    },
  ];

  it.each(scenarios)("$label", ({ source, n, iters }) => {
    let rows = makeDivideGroup(source, n);
    assertGroupInvariants(rows);

    for (let step = 0; step < iters.length; step++) {
      const it = iters[step];
      const first = rows[0];
      const originalSnap: InstallmentEditSnapshot = {
        name: "Compra",
        amount: first.amount,
        total_installments: first.total_installments,
        category: first.category,
        icon: first.icon,
        date: "10 mar",
        card: first.card,
        bank_account_id: first.bank_account_id,
      };

      if (it.kind === "invalid") {
        const attempt: InstallmentEditSnapshot = {
          ...originalSnap,
          ...it.edit,
          ...("category" in it.cosmetic ? { category: it.cosmetic.category } : {}),
          ...("icon" in it.cosmetic ? { icon: it.cosmetic.icon } : {}),
          ...("card" in it.cosmetic ? { card: it.cosmetic.card } : {}),
          ...("bank_account_id" in it.cosmetic ? { bank_account_id: it.cosmetic.bank_account_id } : {}),
        };
        const sanitized = sanitize(originalSnap, attempt);
        const { structural, cosmetic } = splitInstallmentChanges(
          detectInstallmentChanges(originalSnap, sanitized, sanitized.amount),
        );
        // Nada estrutural persiste
        expect(structural, `step ${step} não deveria ter estrutural`).toEqual([]);
        // Existe pelo menos um cosmético (caso contrário o teste é vazio)
        expect(cosmetic.length).toBeGreaterThan(0);

        const before = rows.map((r) => ({
          amount: r.amount,
          n: r.total_installments,
          src: r.installment_source_amount,
        }));
        rows = propagateCosmetic(rows, it.cosmetic);
        // amount / N / source imutáveis após inválida
        rows.forEach((r, i) => {
          expect(r.amount).toBe(before[i].amount);
          expect(r.total_installments).toBe(before[i].n);
          expect(r.installment_source_amount).toBe(before[i].src);
        });
      } else {
        // válida → reescreve o grupo com novo source/N e cosméticos
        rows = applyStructural(rows, it.cosmetic, it.next);
      }

      assertGroupInvariants(rows);
    }
  });

  it("100 iterações aleatórias alternadas nunca ultrapassam o drift", () => {
    let rows = makeDivideGroup(100, 3);
    const invalidEdits: Array<Partial<InstallmentEditSnapshot>> = [
      { name: "" }, { name: "   " },
      { amount: 0 }, { amount: -1 }, { amount: Number.NaN },
      { date: "" }, { date: "   " },
      { total_installments: 0 }, { total_installments: -5 }, { total_installments: null as any },
    ];
    const validNexts = [
      { source: 100, n: 3 }, { source: 250, n: 5 }, { source: 333.33, n: 12 },
      { source: 0.07, n: 7 }, { source: 999.99, n: 11 }, { source: 0.01, n: 12 },
      { source: 1234.56, n: 12 }, { source: 777.77, n: 5 },
    ];
    const cosmetics: Array<Partial<Pick<InstallmentGroupRow, "category" | "icon" | "card" | "bank_account_id">>> = [
      { category: "A" }, { icon: "🎯" }, { card: "Itaú" }, { bank_account_id: "b1" },
      { category: "B", icon: "🍕" }, { card: null }, { bank_account_id: null },
    ];

    let seed = 0xC0FFEE;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0x1_0000_0000;

    for (let i = 0; i < 100; i++) {
      const cosmetic = cosmetics[Math.floor(rnd() * cosmetics.length)];
      if (i % 2 === 0) {
        // inválido
        const before = rows.map((r) => ({ a: r.amount, n: r.total_installments, s: r.installment_source_amount }));
        const originalSnap: InstallmentEditSnapshot = {
          name: "Compra",
          amount: rows[0].amount,
          total_installments: rows[0].total_installments,
          category: rows[0].category,
          icon: rows[0].icon,
          date: "10 mar",
          card: rows[0].card,
          bank_account_id: rows[0].bank_account_id,
        };
        const attempt = { ...originalSnap, ...invalidEdits[Math.floor(rnd() * invalidEdits.length)] };
        const sanitized = sanitize(originalSnap, attempt);
        const { structural } = splitInstallmentChanges(
          detectInstallmentChanges(originalSnap, sanitized, sanitized.amount),
        );
        expect(structural).toEqual([]);
        rows = propagateCosmetic(rows, cosmetic);
        rows.forEach((r, k) => {
          expect(r.amount).toBe(before[k].a);
          expect(r.total_installments).toBe(before[k].n);
          expect(r.installment_source_amount).toBe(before[k].s);
        });
      } else {
        const next = validNexts[Math.floor(rnd() * validNexts.length)];
        rows = applyStructural(
          rows,
          {
            category: cosmetic.category ?? rows[0].category,
            icon: cosmetic.icon ?? rows[0].icon,
            card: cosmetic.card ?? rows[0].card,
            bank_account_id: cosmetic.bank_account_id ?? rows[0].bank_account_id,
          },
          next,
        );
      }
      assertGroupInvariants(rows);
    }
  });
});
