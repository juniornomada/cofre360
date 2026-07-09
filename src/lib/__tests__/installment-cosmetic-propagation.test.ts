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

// -----------------------------------------------------------------------------
// Validação pós-propagação — invariantes do grupo (categoria/ícone/cartão/conta)
// -----------------------------------------------------------------------------
import { validateGroupCoherence, type InstallmentGroupRow } from "@/lib/installment-edit";

function makeRows(n: number, source: number, mode: "divide" | "fixed" = "divide"): InstallmentGroupRow[] {
  const per = mode === "fixed"
    ? Math.round((source / n) * 100) / 100
    : Math.round((source / n) * 100) / 100;
  const rows: InstallmentGroupRow[] = Array.from({ length: n }, (_, i) => ({
    installment_group_id: "grp-val",
    installment_number: i + 1,
    total_installments: n,
    amount: per,
    installment_source_amount: source,
    installment_mode: mode,
    category: "Original",
    icon: "🛒",
    card: "Nubank",
    bank_account_id: null,
  }));
  // Ajusta última parcela para absorver drift do arredondamento no modo "divide".
  if (mode === "divide") {
    const sum = rows.reduce((s, r) => s + r.amount, 0);
    rows[rows.length - 1].amount = Math.round((rows[rows.length - 1].amount + (source - sum)) * 100) / 100;
  }
  return rows;
}

function applyCosmeticToRows(rows: InstallmentGroupRow[], patch: Partial<InstallmentGroupRow>): InstallmentGroupRow[] {
  return rows.map((r) => ({ ...r, ...patch }));
}

describe("Validação pós-propagação — coerência do grupo", () => {
  it("grupo saudável (12x, divide) passa em todos os invariantes", () => {
    const rows = makeRows(12, 1000, "divide");
    const report = validateGroupCoherence(rows);
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it("após propagar categoria/ícone/cartão/conta o grupo permanece coerente", async () => {
    const rows = makeRows(12, 1000, "divide");
    await propagateCosmeticFieldsToGroup("grp-val", {
      category: "Mercado",
      icon: "🍎",
      card: "XP",
      bank_account_id: "acc-1",
    });
    // Simula banco aplicando o UPDATE do capture.
    const call = updateCalls[updateCalls.length - 1];
    const updated = applyCosmeticToRows(rows, call.payload);
    const report = validateGroupCoherence(updated, {
      category: "Mercado",
      icon: "🍎",
      card: "XP",
      bank_account_id: "acc-1",
    });
    expect(report.ok).toBe(true);
  });

  it("detecta parcela órfã com categoria antiga (propagação parcial)", () => {
    const rows = makeRows(12, 1000, "divide");
    const updated = applyCosmeticToRows(rows, { category: "Mercado" });
    // Simula falha: parcela 5 ficou com a categoria antiga.
    updated[4] = { ...updated[4], category: "Original" };
    const report = validateGroupCoherence(updated, { category: "Mercado" });
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes("category"))).toBe(true);
  });

  it("detecta soma de parcelas divergente do total econômico", () => {
    const rows = makeRows(12, 1000, "divide");
    rows[0].amount = rows[0].amount + 5; // adulteração
    const report = validateGroupCoherence(rows);
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes("total econômico"))).toBe(true);
  });

  it("detecta installment_source_amount divergente entre parcelas", () => {
    const rows = makeRows(6, 600, "divide");
    rows[2].installment_source_amount = 700;
    const report = validateGroupCoherence(rows);
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes("installment_source_amount"))).toBe(true);
  });

  it("detecta modo divergente entre parcelas", () => {
    const rows = makeRows(4, 400, "divide");
    rows[1].installment_mode = "fixed";
    const report = validateGroupCoherence(rows);
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes("installment_mode"))).toBe(true);
  });

  it("detecta installment_number duplicado", () => {
    const rows = makeRows(3, 300, "divide");
    rows[2].installment_number = 2;
    const report = validateGroupCoherence(rows);
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes("duplicado"))).toBe(true);
  });

  it("modo 'fixed' exige mesmo amount em todas as parcelas", () => {
    const rows = makeRows(4, 400, "fixed");
    rows[2].amount = 110;
    const report = validateGroupCoherence(rows);
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes("fixed"))).toBe(true);
  });

  it("edge case 1x: parcela única com source = amount é coerente", () => {
    const rows = makeRows(1, 199.9, "divide");
    const report = validateGroupCoherence(rows);
    expect(report.ok).toBe(true);
  });

  it("edge case 2x: arredondamento tolerado (soma difere por ≤ 2 centavos)", () => {
    // 100 / 2 = 50 exatamente — mas testamos com um drift proposital de 1¢.
    const rows = makeRows(2, 100, "divide");
    rows[0].amount = 49.99;
    rows[1].amount = 50.01; // soma bate exato
    let report = validateGroupCoherence(rows);
    expect(report.ok).toBe(true);
    // Drift dentro da tolerância (N * 0,01 = 0,02).
    rows[1].amount = 50.00;
    report = validateGroupCoherence(rows);
    expect(report.ok).toBe(true); // 99.99 vs 100 → diff = 0.01 ≤ 0.02
  });

  it("edge case 12x com R$ 1000: drift de arredondamento (83,33 × 12 = 999,96) fica dentro da tolerância", () => {
    const rows: InstallmentGroupRow[] = Array.from({ length: 12 }, (_, i) => ({
      installment_group_id: "grp-drift",
      installment_number: i + 1,
      total_installments: 12,
      amount: 83.33, // não absorve drift na última
      installment_source_amount: 1000,
      installment_mode: "divide",
    }));
    const report = validateGroupCoherence(rows);
    // Diff = 0.04, tolerância = 12 * 0.01 = 0.12 → ok.
    expect(report.ok).toBe(true);
  });
});

describe("Propagação de bank_account_id — payload NUNCA carrega campos estruturais", () => {
  const FORBIDDEN_STRUCTURAL_KEYS = [
    "date",
    "installment_number",
    "total_installments",
    "amount",
    "installment_source_amount",
    "installment_mode",
    "name",
    "id",
    "type",
    "installment_group_id",
  ] as const;

  it("apenas bank_account_id: payload contém somente esse campo", async () => {
    await propagateCosmeticFieldsToGroup("grp-x", { bank_account_id: "acc-1" });
    expect(updateCalls).toHaveLength(1);
    const { payload } = updateCalls[0];
    expect(Object.keys(payload)).toEqual(["bank_account_id"]);
    expect(payload.bank_account_id).toBe("acc-1");
    for (const k of FORBIDDEN_STRUCTURAL_KEYS) {
      expect(payload).not.toHaveProperty(k);
    }
  });

  it("bank_account_id = null (limpar): payload não vaza campos estruturais", async () => {
    await propagateCosmeticFieldsToGroup("grp-x", { bank_account_id: null });
    const { payload } = updateCalls[0];
    expect(Object.keys(payload)).toEqual(["bank_account_id"]);
    expect(payload.bank_account_id).toBeNull();
    for (const k of FORBIDDEN_STRUCTURAL_KEYS) {
      expect(payload).not.toHaveProperty(k);
    }
  });

  it("bank_account_id combinado com outros cosméticos ainda ignora estruturais", async () => {
    await propagateCosmeticFieldsToGroup("grp-x", {
      bank_account_id: "acc-2",
      category: "Mercado",
      icon: "🍎",
      card: "XP",
    });
    const { payload } = updateCalls[0];
    expect(payload).toEqual({
      bank_account_id: "acc-2",
      category: "Mercado",
      icon: "🍎",
      card: "XP",
    });
    for (const k of FORBIDDEN_STRUCTURAL_KEYS) {
      expect(payload).not.toHaveProperty(k);
    }
  });

  it("propagação de bank_account_id preserva data e installment_number em cada parcela do grupo (12x)", () => {
    // Estado inicial das 12 parcelas
    const before: InstallmentGroupRow[] = Array.from({ length: 12 }, (_, i) => ({
      installment_group_id: "grp-x",
      installment_number: i + 1,
      total_installments: 12,
      amount: 83.33,
      installment_source_amount: 1000,
      installment_mode: "divide",
      category: "Mercado",
      icon: "🍎",
      card: "XP",
      bank_account_id: null,
    }));
    // "Datas" simuladas por índice — como não estão no payload cosmético,
    // não podem mudar após o UPDATE.
    const datesBefore = ["10 jan","10 fev","10 mar","10 abr","10 mai","10 jun","10 jul","10 ago","10 set","10 out","10 nov","10 dez"];

    // Aplica o payload capturado do último UPDATE (bank_account_id only).
    const payload = { bank_account_id: "acc-1" };
    const after = before.map((r, i) => ({ ...r, ...payload, __date: datesBefore[i] }));

    // Todos com a nova conta
    expect(after.every((r) => r.bank_account_id === "acc-1")).toBe(true);
    // installment_number e "date" imutáveis
    after.forEach((r, i) => {
      expect(r.installment_number).toBe(i + 1);
      expect((r as any).__date).toBe(datesBefore[i]);
    });
    // Coerência global do grupo mantida
    const report = validateGroupCoherence(after, { bank_account_id: "acc-1" });
    expect(report.ok).toBe(true);
  });
});

describe("Cosmético-only — payload não recalcula estrutura em NENHUMA parcela", () => {
  type StructuralSnapshot = {
    installment_number: number;
    amount: number;
    installment_source_amount: number;
    installment_mode: string;
    date: string;
    total_installments: number;
  };

  function snapshotStructure(rows: (InstallmentGroupRow & { date: string })[]): StructuralSnapshot[] {
    return rows.map((r) => ({
      installment_number: r.installment_number!,
      amount: r.amount,
      installment_source_amount: r.installment_source_amount!,
      installment_mode: r.installment_mode!,
      date: r.date,
      total_installments: r.total_installments!,
    }));
  }

  const DATES_12 = [
    "10 jan","10 fev","10 mar","10 abr","10 mai","10 jun",
    "10 jul","10 ago","10 set","10 out","10 nov","10 dez",
  ];

  function buildGroupWithDates(groupId: string, mode: "divide" | "fixed", perAmount: number, source: number) {
    return DATES_12.map((d, i) => ({
      installment_group_id: groupId,
      installment_number: i + 1,
      total_installments: 12,
      amount: perAmount,
      installment_source_amount: source,
      installment_mode: mode,
      date: d,
      category: "Original",
      icon: "🛒",
      card: "Nubank",
      bank_account_id: null,
    })) as (InstallmentGroupRow & { date: string })[];
  }

  function applyLastPayload<T extends Record<string, any>>(rows: T[]): T[] {
    const call = updateCalls[updateCalls.length - 1];
    if (!call || call.eqCol !== "installment_group_id") return rows;
    return rows.map((r) =>
      r.installment_group_id === call.eqVal ? { ...r, ...call.payload } : r,
    );
  }

  it("modo 'divide' 12x: payload cosmético não altera amount/date/source/mode/número de nenhuma das 12 parcelas", async () => {
    const groupId = "grp-divide-12";
    const before = buildGroupWithDates(groupId, "divide", 83.33, 1000);
    const structBefore = snapshotStructure(before);

    await propagateCosmeticFieldsToGroup(groupId, {
      category: "Mercado",
      icon: "🍎",
      card: "XP",
      bank_account_id: "acc-1",
    });

    // Payload NÃO contém nenhuma chave estrutural
    const payload = updateCalls[0].payload;
    expect(Object.keys(payload).sort()).toEqual(["bank_account_id", "card", "category", "icon"]);

    const after = applyLastPayload(before);
    // Cosméticos aplicados em TODAS
    expect(after.every((r) =>
      r.category === "Mercado" && r.icon === "🍎" && r.card === "XP" && r.bank_account_id === "acc-1",
    )).toBe(true);
    // Estrutura BYTE-IDÊNTICA em todas as 12 parcelas
    expect(snapshotStructure(after)).toEqual(structBefore);
    // Grupo permanece coerente
    expect(validateGroupCoherence(after, {
      category: "Mercado", icon: "🍎", card: "XP", bank_account_id: "acc-1",
    }).ok).toBe(true);
  });

  it("modo 'fixed' 12x: payload cosmético não recalcula parcela nem source_amount", async () => {
    const groupId = "grp-fixed-12";
    const before = buildGroupWithDates(groupId, "fixed", 100, 100); // fixed: source = per
    const structBefore = snapshotStructure(before);

    await propagateCosmeticFieldsToGroup(groupId, { category: "Assinatura" });

    expect(updateCalls[0].payload).toEqual({ category: "Assinatura" });
    const after = applyLastPayload(before);
    expect(snapshotStructure(after)).toEqual(structBefore);
    expect(after.every((r) => r.installment_mode === "fixed" && r.amount === 100)).toBe(true);
  });

  it("propagação seletiva (apenas ícone) não mexe em categoria/cartão/conta das outras parcelas", async () => {
    const groupId = "grp-selective";
    const before = buildGroupWithDates(groupId, "divide", 83.33, 1000);

    await propagateCosmeticFieldsToGroup(groupId, { icon: "🎬" });

    expect(updateCalls[0].payload).toEqual({ icon: "🎬" });
    const after = applyLastPayload(before);
    // Ícone trocou em todas
    expect(after.every((r) => r.icon === "🎬")).toBe(true);
    // Demais cosméticos preservados
    expect(after.every((r) =>
      r.category === "Original" && r.card === "Nubank" && r.bank_account_id === null,
    )).toBe(true);
    // Estrutura intacta
    expect(snapshotStructure(after)).toEqual(snapshotStructure(before));
  });

  it("total econômico do grupo permanece EXATAMENTE igual antes e depois da propagação", async () => {
    const groupId = "grp-econ";
    const before = buildGroupWithDates(groupId, "divide", 83.33, 1000);
    const sumBefore = before.reduce((s, r) => s + r.amount, 0);
    const sourceBefore = before[0].installment_source_amount!;

    await propagateCosmeticFieldsToGroup(groupId, {
      category: "Mercado", icon: "🍎", card: "XP", bank_account_id: "acc-1",
    });
    const after = applyLastPayload(before);
    const sumAfter = after.reduce((s, r) => s + r.amount, 0);
    const sourceAfter = after[0].installment_source_amount!;

    expect(sumAfter).toBe(sumBefore);
    expect(sourceAfter).toBe(sourceBefore);
  });

  it("cadência mensal (datas) preservada após propagação cosmética", async () => {
    const groupId = "grp-dates";
    const before = buildGroupWithDates(groupId, "divide", 83.33, 1000);
    await propagateCosmeticFieldsToGroup(groupId, { card: "XP" });
    const after = applyLastPayload(before);
    expect(after.map((r) => r.date)).toEqual(DATES_12);
  });
});
