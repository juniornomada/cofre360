import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase: capture update payloads keyed by table + filter.
type UpdateCall = { table: string; payload: any; eqCol?: string; eqVal?: any };
const updateCalls: UpdateCall[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => ({
    update(payload: any) {
      const capture: UpdateCall = { table, payload };
      updateCalls.push(capture);
      return {
        eq(col: string, val: any) {
          capture.eqCol = col;
          capture.eqVal = val;
          return Promise.resolve({ error: null });
        },
      };
    },
  });
  return { supabase: { from: (t: string) => makeChain(t) } };
});

import { propagateCosmeticFieldsToGroup } from "@/lib/installment-edit";

const GROUP_ID = "grp-12x";

beforeEach(() => {
  updateCalls.length = 0;
});

describe("Propagação automática de campos cosméticos em parcelamento 12x", () => {
  it("alterar categoria em uma parcela propaga para todas as 12 via único UPDATE por grupo", async () => {
    await propagateCosmeticFieldsToGroup(GROUP_ID, { category: "Mercado" });

    expect(updateCalls).toHaveLength(1);
    const call = updateCalls[0];
    expect(call.table).toBe("transactions");
    expect(call.eqCol).toBe("installment_group_id");
    expect(call.eqVal).toBe(GROUP_ID);
    // Payload contém somente o campo alterado — o WHERE atinge todas as 12 parcelas.
    expect(call.payload).toEqual({ category: "Mercado" });
  });

  it("alterar ícone em uma parcela propaga para todas as 12", async () => {
    await propagateCosmeticFieldsToGroup(GROUP_ID, { icon: "🛒" });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].eqVal).toBe(GROUP_ID);
    expect(updateCalls[0].payload).toEqual({ icon: "🛒" });
  });

  it("alterar cartão em uma parcela propaga para todas as 12", async () => {
    await propagateCosmeticFieldsToGroup(GROUP_ID, { card: "Nubank" });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].eqVal).toBe(GROUP_ID);
    expect(updateCalls[0].payload).toEqual({ card: "Nubank" });
  });

  it("alterar categoria + ícone + cartão simultaneamente propaga os três em um único UPDATE por grupo", async () => {
    await propagateCosmeticFieldsToGroup(GROUP_ID, {
      category: "Mercado",
      icon: "🛒",
      card: "Nubank",
    });

    expect(updateCalls).toHaveLength(1);
    const call = updateCalls[0];
    expect(call.eqCol).toBe("installment_group_id");
    expect(call.eqVal).toBe(GROUP_ID);
    expect(call.payload).toEqual({
      category: "Mercado",
      icon: "🛒",
      card: "Nubank",
    });
  });

  it("não altera outros campos: valor/data/número da parcela ficam ausentes do payload", async () => {
    await propagateCosmeticFieldsToGroup(GROUP_ID, {
      category: "Mercado",
      icon: "🛒",
      card: "Nubank",
      bank_account_id: null,
    });

    expect(updateCalls).toHaveLength(1);
    const payload = updateCalls[0].payload;
    expect(payload).toHaveProperty("category");
    expect(payload).toHaveProperty("icon");
    expect(payload).toHaveProperty("card");
    expect(payload).toHaveProperty("bank_account_id", null);
    // Estes NUNCA podem vazar na propagação cosmética:
    expect(payload).not.toHaveProperty("amount");
    expect(payload).not.toHaveProperty("date");
    expect(payload).not.toHaveProperty("installment_number");
    expect(payload).not.toHaveProperty("total_installments");
    expect(payload).not.toHaveProperty("name");
  });

  it("sem campos alterados: nenhum UPDATE é disparado", async () => {
    await propagateCosmeticFieldsToGroup(GROUP_ID, {});
    expect(updateCalls).toHaveLength(0);
  });
});

describe("Propagação de conta bancária (bank_account_id) em 12x", () => {
  it("alterar conta bancária propaga para todas as parcelas do grupo em único UPDATE", async () => {
    await propagateCosmeticFieldsToGroup(GROUP_ID, { bank_account_id: "acc-1" });

    expect(updateCalls).toHaveLength(1);
    const call = updateCalls[0];
    expect(call.table).toBe("transactions");
    expect(call.eqCol).toBe("installment_group_id");
    expect(call.eqVal).toBe(GROUP_ID);
    expect(call.payload).toEqual({ bank_account_id: "acc-1" });
  });

  it("permite limpar a conta bancária (null) propagando para todo o grupo", async () => {
    await propagateCosmeticFieldsToGroup(GROUP_ID, { bank_account_id: null });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toEqual({ bank_account_id: null });
    expect(updateCalls[0].eqVal).toBe(GROUP_ID);
  });

  it("propaga bank_account_id independentemente do modo do grupo (divide)", async () => {
    // O UPDATE não filtra por installment_mode — pega todas as 12 parcelas do
    // grupo, sejam elas em modo "divide" ou "fixed".
    await propagateCosmeticFieldsToGroup(GROUP_ID, { bank_account_id: "acc-divide" });

    expect(updateCalls).toHaveLength(1);
    const call = updateCalls[0];
    expect(call.eqCol).toBe("installment_group_id");
    expect(call.eqVal).toBe(GROUP_ID);
    // Nenhum filtro por modo — evita deixar parcelas fora quando o grupo é misto.
    expect(call.payload).not.toHaveProperty("installment_mode");
  });

  it("propaga bank_account_id independentemente do modo do grupo (fixed)", async () => {
    await propagateCosmeticFieldsToGroup(GROUP_ID, { bank_account_id: "acc-fixed" });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].eqCol).toBe("installment_group_id");
    expect(updateCalls[0].payload).toEqual({ bank_account_id: "acc-fixed" });
  });

  it("grupo em modos mistos (divide + fixed): mesmo UPDATE alcança todas as parcelas", async () => {
    // Simulamos dois grupos independentes para garantir que o filtro é
    // sempre por installment_group_id e nunca por modo.
    const GROUP_MIXED = "grp-mixed-12x";
    await propagateCosmeticFieldsToGroup(GROUP_MIXED, { bank_account_id: "acc-x" });

    expect(updateCalls).toHaveLength(1);
    const call = updateCalls[0];
    expect(call.eqCol).toBe("installment_group_id");
    expect(call.eqVal).toBe(GROUP_MIXED);
    expect(call.payload).toEqual({ bank_account_id: "acc-x" });
  });

  it("conta bancária + cartão juntos propagam para todo o grupo em um único UPDATE", async () => {
    await propagateCosmeticFieldsToGroup(GROUP_ID, {
      bank_account_id: "acc-1",
      card: "Nubank",
    });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toEqual({
      bank_account_id: "acc-1",
      card: "Nubank",
    });
    expect(updateCalls[0].eqVal).toBe(GROUP_ID);
  });
});

// -----------------------------------------------------------------------------
// Casos de borda: 1x, 2x e 12x
// -----------------------------------------------------------------------------
// Como propagateCosmeticFieldsToGroup filtra por installment_group_id, a
// quantidade de parcelas afetadas depende exclusivamente das linhas com o
// mesmo group_id no banco. Simulamos isso mockando a resposta do UPDATE
// com um "banco" em memória, garantindo que:
//   1) TODAS as parcelas do grupo recebem o novo valor cosmético.
//   2) Nenhum campo estrutural (amount, installment_number, date,
//      installment_source_amount) é tocado — invariante parcela × N do plano
//      permanece intacto.

type FakeRow = {
  id: string;
  installment_group_id: string;
  installment_number: number;
  total_installments: number;
  amount: number;
  installment_source_amount: number;
  installment_mode: "divide" | "fixed";
  date: string;
  category: string;
  icon: string;
  card: string | null;
  bank_account_id: string | null;
};

function buildGroup(groupId: string, n: number, sourceTotal: number): FakeRow[] {
  const per = Math.round((sourceTotal / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => ({
    id: `${groupId}-${i + 1}`,
    installment_group_id: groupId,
    installment_number: i + 1,
    total_installments: n,
    amount: per,
    installment_source_amount: sourceTotal,
    installment_mode: "divide",
    date: `10 ${["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][i % 12]}`,
    category: "Original",
    icon: "🛒",
    card: "Nubank",
    bank_account_id: null,
  }));
}

function applyLastUpdateTo(rows: FakeRow[]): FakeRow[] {
  const call = updateCalls[updateCalls.length - 1];
  if (!call || call.eqCol !== "installment_group_id") return rows;
  return rows.map((r) =>
    r.installment_group_id === call.eqVal ? { ...r, ...call.payload } : r,
  );
}

const STRUCTURAL_KEYS: (keyof FakeRow)[] = [
  "amount",
  "installment_number",
  "total_installments",
  "installment_source_amount",
  "date",
];

function assertNoStructuralDrift(before: FakeRow[], after: FakeRow[]) {
  expect(after).toHaveLength(before.length);
  for (let i = 0; i < before.length; i++) {
    for (const k of STRUCTURAL_KEYS) {
      expect(after[i][k]).toEqual(before[i][k]);
    }
  }
  // Soma das parcelas continua batendo com o source do plano.
  const sum = after.reduce((s, r) => s + r.amount, 0);
  const source = after[0].installment_source_amount;
  // Drift permitido para arredondamento de centavos (até N centavos).
  expect(Math.abs(sum - source)).toBeLessThanOrEqual(after.length * 0.01);
}

describe.each([
  { n: 1, source: 199.9, label: "1x (parcela única)" },
  { n: 2, source: 100, label: "2x (divisão exata)" },
  { n: 3, source: 500, label: "3x (arredondamento — R$ 166,67)" },
  { n: 12, source: 1000, label: "12x (arredondamento — R$ 83,33)" },
])("Propagação cosmética em $label", ({ n, source }) => {
  const groupId = `grp-${n}x`;

  it(`propaga categoria para todas as ${n} parcelas sem alterar cálculo`, async () => {
    const before = buildGroup(groupId, n, source);
    await propagateCosmeticFieldsToGroup(groupId, { category: "Mercado" });

    // Um único UPDATE alcança todas as parcelas do grupo, seja n=1, 2, 3 ou 12.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].eqCol).toBe("installment_group_id");
    expect(updateCalls[0].eqVal).toBe(groupId);

    const after = applyLastUpdateTo(before);
    expect(after.every((r) => r.category === "Mercado")).toBe(true);
    assertNoStructuralDrift(before, after);
  });

  it(`propaga ícone + cartão + conta em batch nas ${n} parcelas`, async () => {
    const before = buildGroup(groupId, n, source);
    await propagateCosmeticFieldsToGroup(groupId, {
      icon: "🍎",
      card: "XP",
      bank_account_id: "acc-1",
    });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toEqual({
      icon: "🍎",
      card: "XP",
      bank_account_id: "acc-1",
    });

    const after = applyLastUpdateTo(before);
    expect(after.every((r) => r.icon === "🍎" && r.card === "XP" && r.bank_account_id === "acc-1")).toBe(true);
    assertNoStructuralDrift(before, after);
  });

  it(`payload cosmético NUNCA carrega campos estruturais em ${n}x`, async () => {
    await propagateCosmeticFieldsToGroup(groupId, {
      category: "Mercado",
      icon: "🍎",
      card: "XP",
      bank_account_id: "acc-1",
    });
    const payload = updateCalls[0].payload;
    for (const forbidden of [
      "amount",
      "installment_number",
      "installment_source_amount",
      "installment_mode",
      "total_installments",
      "date",
      "name",
    ]) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });
});

describe("Propagação cosmética — chamada no-op não altera nada", () => {
  it("não emite UPDATE quando o payload está vazio (nenhum campo cosmético)", async () => {
    await propagateCosmeticFieldsToGroup("grp-any", {});
    expect(updateCalls).toHaveLength(0);
  });
});
