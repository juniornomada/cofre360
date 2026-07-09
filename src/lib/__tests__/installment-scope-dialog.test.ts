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

import { splitInstallmentChanges } from "@/lib/installment-edit";

describe("Gate do diálogo — estrutural abre, cosmético não abre", () => {
  const shouldOpenDialog = (orig: InstallmentEditSnapshot, edit: InstallmentEditSnapshot, effAmt = edit.amount) => {
    const changes = detectInstallmentChanges(orig, edit, effAmt);
    const { structural } = splitInstallmentChanges(changes);
    return structural.length > 0;
  };

  it("NÃO abre quando apenas Categoria muda", () => {
    expect(shouldOpenDialog(base, { ...base, category: "Lazer" })).toBe(false);
  });

  it("NÃO abre quando apenas Ícone muda", () => {
    expect(shouldOpenDialog(base, { ...base, icon: "🎬" })).toBe(false);
  });

  it("NÃO abre quando apenas Cartão muda", () => {
    expect(shouldOpenDialog(base, { ...base, card: "Nubank" })).toBe(false);
  });

  it("NÃO abre quando apenas Conta bancária muda", () => {
    expect(shouldOpenDialog(base, { ...base, bank_account_id: "acc-1" })).toBe(false);
  });

  it("NÃO abre quando várias mudanças cosméticas ocorrem simultaneamente", () => {
    expect(
      shouldOpenDialog(base, {
        ...base,
        category: "Lazer",
        icon: "🎬",
        card: "Nubank",
        bank_account_id: "acc-1",
      }),
    ).toBe(false);
  });

  it("ABRE quando o Nome muda (estrutural)", () => {
    expect(shouldOpenDialog(base, { ...base, name: "Spotify (3/12)" })).toBe(true);
  });

  it("ABRE quando o Valor muda (estrutural)", () => {
    expect(shouldOpenDialog(base, { ...base, amount: 75 }, 75)).toBe(true);
  });

  it("ABRE quando o Nº de parcelas muda (estrutural)", () => {
    expect(shouldOpenDialog(base, { ...base, total_installments: 6 })).toBe(true);
  });

  it("ABRE quando a Data muda (estrutural)", () => {
    expect(shouldOpenDialog(base, { ...base, date: "15 jan" })).toBe(true);
  });

  it("ABRE quando estrutural + cosmético mudam juntos (mesmo com cosmético presente)", () => {
    expect(
      shouldOpenDialog(base, { ...base, amount: 75, category: "Lazer" }, 75),
    ).toBe(true);
  });

  it("NÃO abre quando nada muda (apenas o sufixo n/N do nome)", () => {
    expect(shouldOpenDialog(base, { ...base, name: "Netflix (4/12)" })).toBe(false);
  });
});

describe("Boundary — valores vazios/inválidos em campos estruturais", () => {
  const shouldOpen = (orig: InstallmentEditSnapshot, edit: InstallmentEditSnapshot, effAmt = edit.amount) => {
    const changes = detectInstallmentChanges(orig, edit, effAmt);
    const { structural } = splitInstallmentChanges(changes);
    return structural.length > 0;
  };

  // -- Nome --
  it("Nome: string vazia diferente do original ABRE o diálogo", () => {
    expect(shouldOpen(base, { ...base, name: "" })).toBe(true);
  });

  it("Nome: apenas espaços vs nome original ABRE (não são iguais após strip)", () => {
    expect(shouldOpen(base, { ...base, name: "   " })).toBe(true);
  });

  it("Nome: somente sufixo (n/N) diferente NÃO abre (sufixo é ignorado)", () => {
    expect(shouldOpen(base, { ...base, name: "Netflix (12/12)" })).toBe(false);
  });

  it("Nome: mesmo texto com sufixo distinto e espaços extras NÃO abre", () => {
    expect(shouldOpen(base, { ...base, name: "Netflix ( 7 / 12 )" })).toBe(false);
  });

  // -- Valor --
  it("Valor: zero (limpo pelo usuário) ABRE quando difere do original", () => {
    expect(shouldOpen(base, { ...base, amount: 0 }, 0)).toBe(true);
  });

  it("Valor: NaN é tratado como mudança (≠ original) e ABRE", () => {
    expect(shouldOpen(base, { ...base, amount: NaN }, NaN)).toBe(true);
  });

  it("Valor: mesmo número com precisão flutuante idêntica NÃO abre", () => {
    expect(shouldOpen(base, { ...base, amount: 50 }, 50)).toBe(false);
  });

  it("Valor: negativo diferente do original ABRE", () => {
    expect(shouldOpen(base, { ...base, amount: -50 }, -50)).toBe(true);
  });

  // -- Data --
  it("Data: string vazia ABRE quando original tinha data", () => {
    expect(shouldOpen(base, { ...base, date: "" })).toBe(true);
  });

  it("Data: null vs original com data ABRE", () => {
    expect(shouldOpen(base, { ...base, date: null as any })).toBe(true);
  });

  it("Data: mesma string exata NÃO abre", () => {
    expect(shouldOpen(base, { ...base, date: base.date })).toBe(false);
  });

  it("Data: diferença de formato ('10 jan' vs '2025-01-10') ABRE (comparação textual)", () => {
    expect(shouldOpen(base, { ...base, date: "2025-01-10" })).toBe(true);
  });

  // -- Nº de parcelas --
  it("Nº parcelas: null vs 12 ABRE", () => {
    expect(shouldOpen(base, { ...base, total_installments: null })).toBe(true);
  });

  it("Nº parcelas: undefined vs 12 ABRE", () => {
    expect(shouldOpen(base, { ...base, total_installments: undefined })).toBe(true);
  });

  it("Nº parcelas: 0 diferente de 12 ABRE", () => {
    expect(shouldOpen(base, { ...base, total_installments: 0 })).toBe(true);
  });

  it("Nº parcelas: mesmo valor (12) NÃO abre", () => {
    expect(shouldOpen(base, { ...base, total_installments: 12 })).toBe(false);
  });

  it("Nº parcelas: null↔undefined tratados como iguais (nullish coalescing) NÃO abrem", () => {
    const noParcels: InstallmentEditSnapshot = { ...base, total_installments: null };
    expect(shouldOpen(noParcels, { ...noParcels, total_installments: undefined })).toBe(false);
  });

  // -- Combinações estrutural + cosmético em cenários de borda --
  it("Nome vazio + Categoria trocada: ABRE (estrutural presente)", () => {
    expect(shouldOpen(base, { ...base, name: "", category: "Lazer" })).toBe(true);
  });

  it("Somente cosméticos com valores vazios NÃO abre (cosmético não conta como estrutural)", () => {
    expect(
      shouldOpen(base, { ...base, category: "", icon: "", card: "", bank_account_id: "" }),
    ).toBe(false);
  });
});
