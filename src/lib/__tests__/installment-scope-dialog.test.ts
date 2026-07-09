import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectInstallmentChanges, type InstallmentEditSnapshot } from "@/lib/installment-edit";

// -- Mock supabase for saveInstallmentPlan --
const updateCalls: Array<{ table: string; payload: any; eqCol?: string; eqVal?: any }> = [];
const selectResponders: Record<string, () => any> = {};

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => ({
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
    insert(_rows: any[]) {
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
  });
  return { supabase: { from: (t: string) => makeChain(t) } };
});

import { saveInstallmentPlan } from "@/lib/installment-edit";

const base: InstallmentEditSnapshot = {
  name: "Netflix (3/12)",
  amount: 50,
  total_installments: 12,
  category: "Assinaturas",
  icon: "📺",
  date: "10 jan",
};

describe("Diálogo de escopo — abertura ao editar categoria/ícone", () => {
  it("dispara o diálogo quando a categoria é alterada", () => {
    const changes = detectInstallmentChanges(base, { ...base, category: "Lazer" }, base.amount);
    expect(changes).toEqual(["Categoria"]);
    expect(changes.length).toBeGreaterThan(0); // gate do diálogo aberto
  });

  it("dispara o diálogo quando o ícone é alterado", () => {
    const changes = detectInstallmentChanges(base, { ...base, icon: "🎬" }, base.amount);
    expect(changes).toEqual(["Ícone"]);
  });

  it("dispara o diálogo para categoria + ícone simultâneos", () => {
    const changes = detectInstallmentChanges(
      base,
      { ...base, category: "Lazer", icon: "🎬" },
      base.amount,
    );
    expect(changes).toEqual(["Categoria", "Ícone"]);
  });

  it("NÃO dispara o diálogo quando nada relevante mudou (apenas sufixo de parcela)", () => {
    const changes = detectInstallmentChanges(
      base,
      { ...base, name: "Netflix (4/12)" }, // só o sufixo (n/total)
      base.amount,
    );
    expect(changes).toEqual([]);
  });
});

describe("Escopo aplicado — atualiza apenas as parcelas selecionadas", () => {
  const groupId = "grp-1";
  const currentId = "tx-3";
  const siblings = [
    { id: "tx-1", installment_number: 1, date: "10 jan" },
    { id: "tx-2", installment_number: 2, date: "10 fev" },
    { id: "tx-3", installment_number: 3, date: "10 mar" },
    { id: "tx-4", installment_number: 4, date: "10 abr" },
  ];

  beforeEach(() => {
    updateCalls.length = 0;
    selectResponders[`transactions:${groupId}`] = () => siblings;
  });

  it("escopo 'apenas esta parcela': aplica categoria/ícone somente na atual", async () => {
    await saveInstallmentPlan({
      id: currentId,
      name: "Netflix (3/12)",
      icon: "🎬",
      category: "Lazer",
      date: "10 mar",
      amount: 50,
      type: "expense",
      total: 12,
      current: 3,
      installment_group_id: groupId,
      installmentSourceAmount: 600,
      bank_account_id: null,
      card: "cc-1",
      updateAllInGroup: false,
    });


    // Apenas 1 update, no id atual, com a nova categoria/ícone
    const touchedIds = updateCalls
      .filter((u) => u.table === "transactions" && u.eqCol === "id")
      .map((u) => u.eqVal);
    expect(touchedIds).toEqual([currentId]);
    const payload = updateCalls.find((u) => u.eqVal === currentId)!.payload;
    expect(payload.category).toBe("Lazer");
    expect(payload.icon).toBe("🎬");
  });

  it("escopo 'todas as parcelas do grupo': propaga categoria/ícone para todos os irmãos", async () => {
    await saveInstallmentPlan({
      id: currentId,
      name: "Netflix (3/12)",
      icon: "🎬",
      category: "Lazer",
      date: "10 mar",
      amount: 50,
      type: "expense",
      total: 12,
      current: 3,
      installment_group_id: groupId,
      installmentSourceAmount: 600,
      bank_account_id: null,
      card: "cc-1",
      updateAllInGroup: true,
    });


    const touchedIds = updateCalls
      .filter((u) => u.table === "transactions" && u.eqCol === "id" && u.payload.category === "Lazer")
      .map((u) => u.eqVal)
      .sort();
    expect(touchedIds).toEqual(siblings.map((s) => s.id).sort());
    for (const u of updateCalls) {
      if (u.table === "transactions" && u.eqCol === "id") {
        expect(u.payload.category).toBe("Lazer");
        expect(u.payload.icon).toBe("🎬");
      }
    }
  });
});
