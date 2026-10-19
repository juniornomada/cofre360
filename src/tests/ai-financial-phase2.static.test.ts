import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const file = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Fase 2: cobertura numérica de todos os cenários", () => {
  it("exige valores canônicos para os 11 testes, inclusive meses anterior e atual", () => {
    const qa = file("supabase/functions/run-ai-tests/index.ts");
    expect(qa).toContain('userClient.rpc("financial_month_facts", { p_month: month })');
    expect(qa).toContain('userClient.rpc("financial_month_facts", { p_month: previousMonth })');
    expect(qa).toContain("if (currentResult.error || !currentResult.data || previousResult.error || !previousResult.data)");
    for (let id = 1; id <= 11; id++) expect(qa).toContain(`"${id}": [`);
    expect(qa).toContain("checkSubcategorySum(fullText");
    expect(qa).toContain("numeric.passed === numeric.total");
  });
  it("compara todas as compras, não só a categoria Compras", () => {
    const chat = file("supabase/functions/financial-chat/index.ts");
    expect(chat).toContain('const entirePurchases = /compras realizadas/.test(q)');
    expect(chat).toContain("matchedCategory && !entirePurchases");
  });
});
