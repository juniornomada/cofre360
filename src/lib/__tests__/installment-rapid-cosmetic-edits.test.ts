import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mock supabase que simula uma tabela `transactions` em memória.
 * Cada UPDATE .eq("installment_group_id", groupId) é aplicado a TODAS
 * as linhas do grupo — como o Postgres faria. Um jitter async simula
 * latência de rede para expor qualquer condição de corrida.
 */
type Row = {
  id: string;
  installment_group_id: string;
  installment_number: number;
  total_installments: number;
  amount: number;
  installment_source_amount: number;
  installment_mode: "divide" | "fixed";
  category: string | null;
  icon: string | null;
  card: string | null;
  bank_account_id: string | null;
};

const store: { rows: Row[] } = { rows: [] };
const updateLog: Array<{ payload: any; groupId: any; appliedAt: number }> = [];
let appliedCounter = 0;

function jitter(): Promise<void> {
  const ms = Math.floor(Math.random() * 8);
  return new Promise((r) => setTimeout(r, ms));
}

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => ({
    update(payload: any) {
      return {
        async eq(col: string, val: any) {
          // Simula latência antes de aplicar a mutação.
          await jitter();
          if (table === "transactions" && col === "installment_group_id") {
            for (const row of store.rows) {
              if (row.installment_group_id === val) {
                Object.assign(row, payload);
              }
            }
          }
          updateLog.push({ payload, groupId: val, appliedAt: ++appliedCounter });
          return { error: null };
        },
      };
    },
  });
  return { supabase: { from: (t: string) => makeChain(t) } };
});

import {
  propagateCosmeticFieldsToGroup,
  validateGroupCoherence,
} from "@/lib/installment-edit";

const GROUP_A = "grp-A";
const GROUP_B = "grp-B";

function seedGroup(groupId: string, n = 12, sourceAmount = 1200) {
  const per = Math.round((sourceAmount / n) * 100) / 100;
  for (let i = 1; i <= n; i++) {
    store.rows.push({
      id: `${groupId}-${i}`,
      installment_group_id: groupId,
      installment_number: i,
      total_installments: n,
      amount: per,
      installment_source_amount: sourceAmount,
      installment_mode: "divide",
      category: "Original",
      icon: "📦",
      card: "Nubank",
      bank_account_id: "acc-1",
    });
  }
}

function rowsOfGroup(groupId: string): Row[] {
  return store.rows.filter((r) => r.installment_group_id === groupId);
}

beforeEach(() => {
  store.rows = [];
  updateLog.length = 0;
  appliedCounter = 0;
});

describe("Edições rápidas consecutivas de campos cosméticos — coerência do grupo", () => {
  it("10 alterações rápidas de categoria em paralelo: última aplicada vence e TODAS as parcelas ficam iguais", async () => {
    seedGroup(GROUP_A);
    const categorias = [
      "Mercado", "Alimentação", "Lazer", "Saúde", "Transporte",
      "Educação", "Casa", "Trabalho", "Viagem", "Assinaturas",
    ];

    // Dispara em paralelo — o jitter faz a ordem de aplicação variar.
    await Promise.all(
      categorias.map((c) =>
        propagateCosmeticFieldsToGroup(GROUP_A, { category: c }),
      ),
    );

    const rows = rowsOfGroup(GROUP_A);
    expect(rows).toHaveLength(12);

    // Invariante 1: todas as parcelas terminam com a MESMA categoria
    // (nenhum payload deixa o grupo em estado inconsistente).
    const uniqueCats = new Set(rows.map((r) => r.category));
    expect(uniqueCats.size).toBe(1);

    // Invariante 2: a categoria final é uma das enviadas.
    expect(categorias).toContain(rows[0].category!);

    // Invariante 3: coerência estrutural / financeira preservada.
    const report = validateGroupCoherence(rows, {
      category: rows[0].category,
      icon: "📦",
      card: "Nubank",
      bank_account_id: "acc-1",
    });
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("rajada de 20 edições sequenciais alternando categoria e ícone: estado final coerente e igual em todas as parcelas", async () => {
    seedGroup(GROUP_A);
    for (let i = 0; i < 20; i++) {
      const isCat = i % 2 === 0;
      await propagateCosmeticFieldsToGroup(
        GROUP_A,
        isCat ? { category: `Cat-${i}` } : { icon: `I-${i}` },
      );
    }

    const rows = rowsOfGroup(GROUP_A);
    expect(new Set(rows.map((r) => r.category)).size).toBe(1);
    expect(new Set(rows.map((r) => r.icon)).size).toBe(1);
    // Sequencial => o último de cada tipo vence.
    expect(rows[0].category).toBe("Cat-18");
    expect(rows[0].icon).toBe("I-19");

    const report = validateGroupCoherence(rows, {
      category: rows[0].category,
      icon: rows[0].icon,
      card: "Nubank",
      bank_account_id: "acc-1",
    });
    expect(report.ok).toBe(true);
  });

  it("edições paralelas em campos DIFERENTES (categoria/ícone/cartão/conta) convergem sem conflito", async () => {
    seedGroup(GROUP_A);

    await Promise.all([
      propagateCosmeticFieldsToGroup(GROUP_A, { category: "Mercado" }),
      propagateCosmeticFieldsToGroup(GROUP_A, { icon: "🛒" }),
      propagateCosmeticFieldsToGroup(GROUP_A, { card: "XP" }),
      propagateCosmeticFieldsToGroup(GROUP_A, { bank_account_id: "acc-2" }),
      propagateCosmeticFieldsToGroup(GROUP_A, { category: "Alimentação" }),
      propagateCosmeticFieldsToGroup(GROUP_A, { icon: "🍔" }),
    ]);

    const rows = rowsOfGroup(GROUP_A);

    // Cada campo cosmético é uniforme em todas as parcelas.
    for (const field of ["category", "icon", "card", "bank_account_id"] as const) {
      const values = new Set(rows.map((r) => r[field]));
      expect(values.size, `campo ${field} deveria ser uniforme`).toBe(1);
    }

    // Valores finais só podem ser os enviados.
    expect(["Mercado", "Alimentação"]).toContain(rows[0].category);
    expect(["🛒", "🍔"]).toContain(rows[0].icon);
    expect(rows[0].card).toBe("XP");
    expect(rows[0].bank_account_id).toBe("acc-2");

    const report = validateGroupCoherence(rows, {
      category: rows[0].category,
      icon: rows[0].icon,
      card: rows[0].card,
      bank_account_id: rows[0].bank_account_id,
    });
    expect(report.ok).toBe(true);
  });

  it("edições rápidas em grupos DIFERENTES não vazam: cada grupo mantém sua própria coerência", async () => {
    seedGroup(GROUP_A);
    seedGroup(GROUP_B);

    await Promise.all([
      propagateCosmeticFieldsToGroup(GROUP_A, { category: "A1" }),
      propagateCosmeticFieldsToGroup(GROUP_B, { category: "B1" }),
      propagateCosmeticFieldsToGroup(GROUP_A, { icon: "🅰️" }),
      propagateCosmeticFieldsToGroup(GROUP_B, { icon: "🅱️" }),
      propagateCosmeticFieldsToGroup(GROUP_A, { category: "A2" }),
      propagateCosmeticFieldsToGroup(GROUP_B, { card: "XP" }),
    ]);

    const rowsA = rowsOfGroup(GROUP_A);
    const rowsB = rowsOfGroup(GROUP_B);

    // Uniformidade dentro de cada grupo.
    expect(new Set(rowsA.map((r) => r.category)).size).toBe(1);
    expect(new Set(rowsA.map((r) => r.icon)).size).toBe(1);
    expect(new Set(rowsB.map((r) => r.category)).size).toBe(1);
    expect(new Set(rowsB.map((r) => r.icon)).size).toBe(1);

    // Isolamento entre grupos: valores de A vieram de A, valores de B vieram de B.
    expect(["A1", "A2"]).toContain(rowsA[0].category);
    expect(rowsA[0].icon).toBe("🅰️");
    expect(rowsA[0].card).toBe("Nubank"); // não alterado em A
    expect(rowsB[0].category).toBe("B1");
    expect(rowsB[0].icon).toBe("🅱️");
    expect(rowsB[0].card).toBe("XP");

    // Coerência estrutural preservada em ambos.
    expect(validateGroupCoherence(rowsA).ok).toBe(true);
    expect(validateGroupCoherence(rowsB).ok).toBe(true);
  });

  it("nenhuma edição rápida altera campos estruturais (amount, installment_number, source_amount)", async () => {
    seedGroup(GROUP_A);
    const snapshotEstrutura = rowsOfGroup(GROUP_A).map((r) => ({
      id: r.id,
      installment_number: r.installment_number,
      total_installments: r.total_installments,
      amount: r.amount,
      installment_source_amount: r.installment_source_amount,
      installment_mode: r.installment_mode,
    }));

    await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        propagateCosmeticFieldsToGroup(GROUP_A, {
          category: `C-${i}`,
          icon: `I-${i}`,
          card: `Card-${i}`,
          bank_account_id: `acc-${i}`,
        }),
      ),
    );

    const depois = rowsOfGroup(GROUP_A).map((r) => ({
      id: r.id,
      installment_number: r.installment_number,
      total_installments: r.total_installments,
      amount: r.amount,
      installment_source_amount: r.installment_source_amount,
      installment_mode: r.installment_mode,
    }));

    expect(depois).toEqual(snapshotEstrutura);
  });

  it("todo UPDATE consecutivo é atômico por grupo: nunca deixa parcelas parcialmente atualizadas", async () => {
    seedGroup(GROUP_A);

    // Após CADA update aplicado, o grupo deve estar 100% uniforme.
    // Simulamos: n edições em série + verificação intermediária.
    for (let i = 0; i < 12; i++) {
      await propagateCosmeticFieldsToGroup(GROUP_A, { category: `Step-${i}` });
      const rows = rowsOfGroup(GROUP_A);
      const values = new Set(rows.map((r) => r.category));
      expect(values.size, `estado inconsistente após step ${i}`).toBe(1);
      expect(rows[0].category).toBe(`Step-${i}`);
    }
  });
});
