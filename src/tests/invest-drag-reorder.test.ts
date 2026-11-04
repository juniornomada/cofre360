import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ASSET_ORDER_STORAGE_KEY,
  moveInvestmentOrder,
  parseStoredInvestmentOrder,
  sortInvestmentValuations,
} from "@/lib/investment-order";

const samples = [
  { inv: { id: "a", name: "Ativo A" }, val: { grossValue: 100, grossPnL: 3 } },
  { inv: { id: "b", name: "Ativo B" }, val: { grossValue: 200, grossPnL: 4 } },
  { inv: { id: "c", name: "Ativo C" }, val: { grossValue: 300, grossPnL: 5 } },
];
const ids = (items: typeof samples) => items.map(({ inv }) => inv.id);

describe("Ordenação dos investimentos", () => {
  it("arrasta o título verticalmente e preserva os dados financeiros e a lista original", () => {
    const moved = moveInvestmentOrder(ids(samples), "a", "c");
    expect(moved).toEqual(["b", "c", "a"]);
    expect(ids(samples)).toEqual(["a", "b", "c"]);
    const sorted = sortInvestmentValuations(samples, moved!);
    expect(ids(sorted)).toEqual(["b", "c", "a"]);
    expect(sorted[2]).toBe(samples[0]);
    expect(sorted.map(({ val }) => val.grossValue)).toEqual([200, 300, 100]);
    expect(samples.map(({ val }) => val.grossValue)).toEqual([100, 200, 300]);
  });

  it("restaura a ordem após navegar e recarregar no mesmo navegador", () => {
    const moved = moveInvestmentOrder(ids(samples), "c", "a");
    const storage = new Map([[ASSET_ORDER_STORAGE_KEY, JSON.stringify(moved)]]);
    const restored = parseStoredInvestmentOrder(storage.get(ASSET_ORDER_STORAGE_KEY) ?? null);
    expect(ids(sortInvestmentValuations(samples, restored))).toEqual(["c", "a", "b"]);
  });

  it("mantém ativos novos no fim e ignora ativos removidos", () => {
    const ordered = sortInvestmentValuations(samples, ["deleted", "b", "a"]);
    expect(ids(ordered)).toEqual(["b", "a", "c"]);
  });

  it("não altera a ordem quando a soltura não tem destino válido", () => {
    expect(moveInvestmentOrder(["a", "b", "c"], "b", "b")).toBeNull();
    expect(moveInvestmentOrder(["a", "b", "c"], "a", "missing")).toBeNull();
    expect(moveInvestmentOrder(["a", "b", "c"], "missing", "b")).toBeNull();
  });

  it("ignora armazenamento ausente, inválido ou com identificadores incorretos", () => {
    expect(parseStoredInvestmentOrder(null)).toEqual([]);
    expect(parseStoredInvestmentOrder("{invalid")).toEqual([]);
    expect(parseStoredInvestmentOrder('["a",1]')).toEqual([]);
    expect(parseStoredInvestmentOrder('{"a":1}')).toEqual([]);
  });
});

describe("Contrato visual e de interação dos cartões de investimento", () => {
  const source = readFileSync(resolve(process.cwd(), "src/routes/invest.tsx"), "utf8");

  it("mantém arraste Android pelo título sem alça visual", () => {
    expect(source).toContain("TouchSensor,");
    expect(source).toContain("MouseSensor,");
    expect(source).toContain("KeyboardSensor,");
    expect(source).toContain("delay: 160, tolerance: 12");
    const headerStart = source.indexOf('      <div\n        ref={setActivatorNodeRef}', source.indexOf('orderedValuations.map('));
    const iconStart = source.indexOf('        <div className="flex h-9 w-9', headerStart);
    expect(headerStart).toBeGreaterThan(-1);
    expect(iconStart).toBeGreaterThan(headerStart);
    const header = source.slice(headerStart, iconStart);
    expect(header).toContain("{...attributes}");
    expect(header).toContain("{...listeners}");
    expect(header).toContain('aria-label={`Arrastar ${inv.name} para reordenar`}');
    expect(header).toContain('title="Segure o título e arraste para reordenar"');
    expect(header).not.toContain("<button");
    expect(source).not.toContain('<Menu className="h-4 w-4" />');
  });

  it("mantém o toque no cartão para editar, sem botão adicional de arraste", () => {
    const cardStart = source.indexOf('      onClick={() => openEdit(inv)}', source.indexOf('orderedValuations.map('));
    const headerStart = source.indexOf('      <div\n        ref={setActivatorNodeRef}', cardStart);
    expect(cardStart).toBeGreaterThan(-1);
    expect(headerStart).toBeGreaterThan(cardStart);
    const header = source.slice(headerStart, source.indexOf('<InvestmentIcon assetClass=', headerStart));
    expect(header).not.toContain("stopPropagation()");
    expect(header).not.toContain("<button");
  });

  it("salva a ordenação localmente, sem atualizar a tabela de investimentos", () => {
    const handler = source.split("const handleAssetDragEnd = useCallback")[1]?.split("const totalInvested =")[0] ?? "";
    expect(handler).toContain("moveInvestmentOrder");
    expect(handler).toContain("setAssetOrder(next)");
    expect(handler).toContain("localStorage.setItem(ASSET_ORDER_STORAGE_KEY, JSON.stringify(next))");
    expect(handler).not.toContain(".from(");
    expect(handler).not.toContain(".update(");
  });
});
