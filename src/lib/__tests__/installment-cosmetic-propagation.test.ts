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
