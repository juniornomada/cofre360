import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  explicitComparisonMonths,
  rankCategoryComparisons,
  resolveComparisonSelection,
} from "../../supabase/functions/financial-chat/comparison";

const firstQuestion = "Compra os gastos das categorias entre setembro e outubro, dos maiores gastos";
const aboutCar = "Comprei o kit 3 coxins para o carro da minha mãe e recebi um reembolso";
const contextual = "Agora compare novamente as categorias nos mesmos meses";
const corrective = "Mas categorias com mais gastos";

describe("Insights — comparações financeiras com continuidade da conversa", () => {
  it("reconhece dois meses por extenso, em vez de assumir o mês corrente", () => {
    expect(explicitComparisonMonths("Compare os gastos das categorias entre setembro e outubro", 2026))
      .toEqual(["2026-09", "2026-10"]);
    expect(explicitComparisonMonths("Compare outubro e setembro", 2026))
      .toEqual(["2026-09", "2026-10"]);
    expect(explicitComparisonMonths("Compare agosto/2025 e setembro/2025", 2026))
      .toEqual(["2025-08", "2025-09"]);
  });

  it("reconhece os meses numéricos 09 e 10 em uma comparação", () => {
    expect(explicitComparisonMonths("Compare os meses 09 e 10 nas categorias com mais gastos", 2026))
      .toEqual(["2026-09", "2026-10"]);
    expect(explicitComparisonMonths("Compare 09/2026 e 10/2026", 2026))
      .toEqual(["2026-09", "2026-10"]);
  });

  it("mantém setembro e outubro após uma pergunta intermediária sobre reembolso", () => {
    expect(resolveComparisonSelection([firstQuestion, aboutCar, contextual], 2026)).toEqual({
      isComparison: true,
      byCategory: true,
      earlierKey: "2026-09",
      laterKey: "2026-10",
    });
  });

  it("interpreta 'Mas categorias com mais gastos' como correção da comparação anterior", () => {
    expect(resolveComparisonSelection([firstQuestion, aboutCar, contextual, corrective], 2026)).toEqual({
      isComparison: true,
      byCategory: true,
      earlierKey: "2026-09",
      laterKey: "2026-10",
    });
  });

  it("não substitui os meses explícitos pelos meses atuais", () => {
    const question = "Compare os gastos das categorias entre setembro e outubro, dos maiores gastos";
    expect(resolveComparisonSelection([question], 2026)).toMatchObject({
      byCategory: true,
      earlierKey: "2026-09",
      laterKey: "2026-10",
    });
  });

  it("mantém comparações gerais sem categorias e não converte perguntas isoladas em comparações", () => {
    expect(resolveComparisonSelection(["Compare as compras realizadas neste mês com o mês passado"], 2026))
      .toEqual({ isComparison: true, byCategory: false, earlierKey: null, laterKey: null });
    expect(resolveComparisonSelection(["Quais categorias tiveram mais gastos neste mês?"], 2026)).toBeNull();
    expect(explicitComparisonMonths("Em setembro houve gastos?", 2026)).toBeNull();
  });

  it("usa todas as categorias, inclusive as que aparecem em apenas um mês, e ordena por gasto recente", () => {
    const before: [string, number][] = [["Transporte", 200], ["Alimentação", 500], ["Saúde", 120]];
    const after: [string, number][] = [["Transporte", 1000], ["Alimentação", 400], ["Outros", 300]];
    const result = rankCategoryComparisons(before, after);
    expect(result.map((row) => row.category)).toEqual(["Transporte", "Alimentação", "Outros", "Saúde"]);
    expect(result[0]).toMatchObject({ before: 200, after: 1000, difference: 800 });
    expect(result[1]).toMatchObject({ before: 500, after: 400, difference: -100 });
    expect(result[2]).toMatchObject({ before: 0, after: 300, difference: 300 });
    expect(result[3]).toMatchObject({ before: 120, after: 0, difference: -120 });
    expect(result.reduce((sum, row) => sum + row.before, 0)).toBe(820);
    expect(result.reduce((sum, row) => sum + row.after, 0)).toBe(1700);
  });
});

describe("Insights — contrato de cálculo no backend", () => {
  const backend = readFileSync(resolve(process.cwd(), "supabase/functions/financial-chat/index.ts"), "utf8");

  it("usa as informações mensais canônicas de ambos os meses pedidos", () => {
    expect(backend).toContain("resolveComparisonSelection(userMessages.map(");
    expect(backend).toContain("comparison?.laterKey || requested?.key");
    expect(backend).toContain("comparison?.earlierKey || monthKey(previousDate)");
    expect(backend).toContain("loadCanonicalMonthFacts(supabase, key)");
    expect(backend).toContain("loadCanonicalMonthFacts(supabase, previousKey)");
  });

  it("compara os gastos por categoria antes do fallback de total agregado", () => {
    const start = backend.indexOf("if (asksPurchaseComparison && !detailOnly) {");
    const end = backend.indexOf("if (asksExpenseComposition && !detailOnly)", start);
    const block = backend.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("rankCategoryComparisons(previousCategories, categories)");
    expect(block).toContain("Comparativo por categoria");
    expect(block).toContain("previousCategoryTotal");
    expect(block).toContain("categoryTotal");
    expect(block.indexOf("rankCategoryComparisons")).toBeLessThan(block.indexOf("let currentValue = categoryTotal"));
    expect(block).not.toContain(".update(");
    expect(block).not.toContain(".insert(");
  });
});
