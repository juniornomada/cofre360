import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase client — capture all update payloads for verification.
const updateCalls: Array<{ table: string; payload: any; eqCol?: string; eqVal?: any }> = [];
const insertCalls: Array<{ table: string; rows: any[] }> = [];
const selectResponders: Record<string, () => any> = {};

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    const chain: any = {
      update(payload: any) {
        const capture = { table, payload, eqCol: undefined as any, eqVal: undefined as any };
        updateCalls.push(capture);
        return {
          eq(col: string, val: any) {
            capture.eqCol = col;
            capture.eqVal = val;
            return Promise.resolve({ error: null });
          },
        };
      },
      insert(rows: any[]) {
        insertCalls.push({ table, rows });
        return Promise.resolve({ error: null });
      },
      select(_cols: string) {
        return {
          eq(_col: string, val: any) {
            const responder = selectResponders[`${table}:${val}`];
            const data = responder ? responder() : [];
            return Promise.resolve({ data, error: null });
          },
        };
      },
    };
    return chain;
  };
  return { supabase: { from: (t: string) => makeChain(t) } };
});

import { saveInstallmentPlan } from "../installment-edit";

beforeEach(() => {
  updateCalls.length = 0;
  insertCalls.length = 0;
  for (const k of Object.keys(selectResponders)) delete selectResponders[k];
});

describe("saveInstallmentPlan — propagação de ícone + categoria", () => {
  const baseInput = {
    id: "tx-3",
    name: "Compra (3/6)",
    icon: "🍔",
    category: "Alimentação",
    date: "10 dez",
    amount: 100,
    type: "expense",
    card: "Nubank",
    bank_account_id: null,
    installment_group_id: "grp-1",
    current: 3,
    total: 6,
    installmentAmount: 100,
    installmentMode: "divide",
    installmentSourceAmount: 600,
  };

  it("atualiza icon e category em TODAS as parcelas quando updateAllInGroup=true", async () => {
    selectResponders["transactions:grp-1"] = () => [
      { id: "tx-1", installment_number: 1 },
      { id: "tx-2", installment_number: 2 },
      { id: "tx-3", installment_number: 3 },
      { id: "tx-4", installment_number: 4 },
      { id: "tx-5", installment_number: 5 },
      { id: "tx-6", installment_number: 6 },
    ];

    await saveInstallmentPlan({ ...baseInput, updateAllInGroup: true });

    // Cada uma das 6 parcelas recebeu update com icon e category corretos
    const updatesForGroup = updateCalls.filter(u => u.table === "transactions");
    expect(updatesForGroup).toHaveLength(6);
    for (const call of updatesForGroup) {
      expect(call.payload.icon).toBe("🍔");
      expect(call.payload.category).toBe("Alimentação");
    }
    // installment_number de cada sibling é preservado
    const numbers = updatesForGroup.map(u => u.payload.installment_number).sort();
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
    // Nenhuma parcela futura precisa ser inserida (todas já existem)
    expect(insertCalls).toHaveLength(0);
  });

  it("atualiza APENAS a parcela atual quando updateAllInGroup=false", async () => {
    selectResponders["transactions:grp-1"] = () => [
      { installment_number: 1 },
      { installment_number: 2 },
      { installment_number: 3 },
      { installment_number: 4 },
      { installment_number: 5 },
      { installment_number: 6 },
    ];

    await saveInstallmentPlan({ ...baseInput, updateAllInGroup: false });

    const updatesForGroup = updateCalls.filter(u => u.table === "transactions");
    expect(updatesForGroup).toHaveLength(1);
    expect(updatesForGroup[0].eqVal).toBe("tx-3");
    expect(updatesForGroup[0].payload.icon).toBe("🍔");
    expect(updatesForGroup[0].payload.category).toBe("Alimentação");
  });

  it("propaga icon + category mesmo quando o usuário também alterou o valor", async () => {
    selectResponders["transactions:grp-1"] = () => [
      { id: "tx-1", installment_number: 1 },
      { id: "tx-2", installment_number: 2 },
      { id: "tx-3", installment_number: 3 },
    ];

    await saveInstallmentPlan({
      ...baseInput,
      total: 3,
      installmentAmount: 250, // novo valor
      icon: "🛒",
      category: "Mercado",
      updateAllInGroup: true,
    });

    const updatesForGroup = updateCalls.filter(u => u.table === "transactions");
    expect(updatesForGroup).toHaveLength(3);
    for (const call of updatesForGroup) {
      expect(call.payload.icon).toBe("🛒");
      expect(call.payload.category).toBe("Mercado");
      expect(call.payload.amount).toBe(250);
    }
  });

  it("parcelas futuras inseridas herdam o novo icon e a nova category", async () => {
    // Grupo tem apenas parcelas 1,2,3 no banco — 4,5,6 serão inseridas
    selectResponders["transactions:grp-1"] = () => [
      { id: "tx-1", installment_number: 1 },
      { id: "tx-2", installment_number: 2 },
      { id: "tx-3", installment_number: 3 },
    ];

    await saveInstallmentPlan({
      ...baseInput,
      icon: "🍔",
      category: "Alimentação",
      updateAllInGroup: false,
    });

    expect(insertCalls).toHaveLength(1);
    const inserted = insertCalls[0].rows;
    expect(inserted).toHaveLength(3); // 4, 5 e 6
    for (const row of inserted) {
      expect(row.icon).toBe("🍔");
      expect(row.category).toBe("Alimentação");
    }
    expect(inserted.map(r => r.installment_number).sort()).toEqual([4, 5, 6]);
  });

  it("syncDates=true reagenda todas as parcelas mantendo cadência mensal a partir da parcela atual", async () => {
    selectResponders["transactions:grp-1"] = () => [
      { id: "tx-1", installment_number: 1 },
      { id: "tx-2", installment_number: 2 },
      { id: "tx-3", installment_number: 3 },
      { id: "tx-4", installment_number: 4 },
      { id: "tx-5", installment_number: 5 },
      { id: "tx-6", installment_number: 6 },
    ];

    // Ancoramos a parcela atual (3) em "15 dez" — as demais devem ficar
    // 15/out, 15/nov, 15/dez, 15/jan, 15/fev, 15/mar (dois meses antes até três depois).
    await saveInstallmentPlan({
      ...baseInput,
      date: "15 dez",
      updateAllInGroup: true,
      syncDates: true,
    });

    const updatesForGroup = updateCalls.filter(u => u.table === "transactions");
    expect(updatesForGroup).toHaveLength(6);
    const byNumber: Record<number, string> = {};
    for (const c of updatesForGroup) byNumber[c.payload.installment_number] = c.payload.date;
    expect(byNumber[3]).toBe("15 dez");
    expect(byNumber[2]).toBe("15 nov");
    expect(byNumber[1]).toBe("15 out");
    expect(byNumber[4]).toBe("15 jan");
    expect(byNumber[5]).toBe("15 fev");
    expect(byNumber[6]).toBe("15 mar");
  });

  it("syncDates=false (default) NÃO altera a data das parcelas siblings", async () => {
    selectResponders["transactions:grp-1"] = () => [
      { id: "tx-1", installment_number: 1 },
      { id: "tx-2", installment_number: 2 },
      { id: "tx-3", installment_number: 3 },
    ];

    await saveInstallmentPlan({
      ...baseInput,
      total: 3,
      date: "15 dez",
      updateAllInGroup: true,
    });

    const updatesForGroup = updateCalls.filter(u => u.table === "transactions");
    for (const c of updatesForGroup) {
      // payload não deve incluir o campo `date`
      expect(c.payload.date).toBeUndefined();
    }
  });
});
