import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractCategoryDrilldowns, type ChatLine } from "@/lib/insights-drilldowns";
import { explicitComparisonMonths, rankCategoryComparisons } from "../../supabase/functions/financial-chat/comparison";

const sample = `### 📊 Comparativo por categoria — Setembro/2026 × Outubro/2026

**Total de compras por data original:**
- Setembro/2026: **R$ 7.646,31**
- Outubro/2026: **R$ 9.668,40**

#### Categorias com maiores gastos em Outubro/2026
- 🚗 **Transporte** — Setembro/2026: R$ 1.557,96 → Outubro/2026: R$ 3.382,04 (**+R$ 1.824,08**)
- 🍴 **Alimentação** — Setembro/2026: R$ 2.273,60 → Outubro/2026: R$ 1.671,20 (**-R$ 602,40**)
- 🏠 **Moradia** — Setembro/2026: R$ 1.440,39 → Outubro/2026: R$ 1.587,60 (**+R$ 147,21**)
- 💊 **Saúde** — Setembro/2026: R$ 829,02 → Outubro/2026: R$ 1.353,72 (**+R$ 524,70**)
- 📦 **Outros** — Setembro/2026: R$ 265,00 → Outubro/2026: R$ 951,12 (**+R$ 686,12**)
- 🛍️ **Compras** — Setembro/2026: R$ 975,83 → Outubro/2026: R$ 172,27 (**-R$ 803,56**)`;

const assistant: ChatLine = { role: "assistant", content: sample };
const user = (content: string): ChatLine => ({ role: "user", content });

describe("Insights — botões de detalhamento contextuais", () => {
  it("cria perguntas específicas com os dois meses da própria resposta", () => {
    const selected = extractCategoryDrilldowns([assistant]);
    expect(selected).toMatchObject({ earlier: "Setembro/2026", later: "Outubro/2026" });
    expect(selected?.actions.map((item) => item.category))
      .toEqual(["Transporte", "Alimentação", "Moradia", "Saúde", "Outros", "Compras"]);
    const transport = selected!.actions[0].prompt;
    expect(transport).toContain("subcategorias de Transporte");
    expect(transport).toContain("Setembro/2026 e Outubro/2026");
    expect(explicitComparisonMonths(transport, 2026)).toEqual(["2026-09", "2026-10"]);
  });

  it("permite detalhar Transporte e depois Alimentação com um toque, preservando o par", () => {
    const choices = extractCategoryDrilldowns([assistant])!.actions;
    const afterTransport: ChatLine[] = [
      assistant, user(choices[0].prompt),
      { role: "assistant", content: "### 🚗 Transporte por subcategoria — Setembro/2026 × Outubro/2026" },
    ];
    expect(extractCategoryDrilldowns(afterTransport)?.actions.map((item) => item.category))
      .toContain("Alimentação");
    const afterFood = [
      ...afterTransport, user(choices[1].prompt),
      { role: "assistant" as const, content: "### 🍴 Alimentação por subcategoria — Setembro/2026 × Outubro/2026" },
    ];
    expect(extractCategoryDrilldowns(afterFood)?.actions).toHaveLength(6);
  });

  it("não oferece atalhos após assunto diferente nem para mensagens não comparativas", () => {
    expect(extractCategoryDrilldowns([assistant, user("Qual meu saldo no banco?")])).toBeNull();
    expect(extractCategoryDrilldowns([{ role: "assistant", content: "### Gastos por categoria — Outubro/2026" }])).toBeNull();
  });

  it("não inventa períodos nem cria ações para categorias não listadas", () => {
    const noPeriod = sample.replace("Setembro/2026 × Outubro/2026", "Mês atual");
    expect(extractCategoryDrilldowns([{ role: "assistant", content: noPeriod }])).toBeNull();
    const broken = sample.replace("- 🚗 **Transporte**", "- 🚗 **<script>**");
    expect(extractCategoryDrilldowns([{ role: "assistant", content: broken }])?.actions.some((x) => x.category === "<script>")).toBe(false);
  });

  it("formata diferenças monetárias de subcategoria com os dados corretos", () => {
    const a: [string, number][] = [["Manutenção", 100], ["Combustível", 40]];
    const b: [string, number][] = [["Combustível", 80], ["Pedágio", 15]];
    expect(rankCategoryComparisons(a, b)).toEqual([
      { category: "Combustível", before: 40, after: 80, difference: 40 },
      { category: "Pedágio", before: 0, after: 15, difference: 15 },
      { category: "Manutenção", before: 100, after: 0, difference: -100 },
    ]);
  });
});

describe("Insights — integração com o chat e o motor financeiro", () => {
  const front = readFileSync(resolve(process.cwd(), "src/components/FinancialChat.tsx"), "utf8");
  const back = readFileSync(resolve(process.cwd(), "supabase/functions/financial-chat/index.ts"), "utf8");
  it("usa botões acionáveis e não somente sugestões estáticas", () => {
    expect(front).toContain("extractCategoryDrilldowns(messages)");
    expect(front).toContain("categoryDrilldowns.actions.map");
    expect(front).toContain("onClick={() => void send(prompt)}");
    expect(front).toContain("disabled={isLoading}");
  });
  it("intercepta o detalhamento antes da comparação agregada", () => {
    const sub = back.indexOf("if (subcategoryComparisonMonths && matchedCategory && !detailOnly)");
    const aggregated = back.indexOf("if (asksPurchaseComparison && !detailOnly)");
    expect(sub).toBeGreaterThan(-1);
    expect(aggregated).toBeGreaterThan(sub);
    expect(back).toContain("rankCategoryComparisons(earlierSubcategories, laterSubcategories)");
    expect(back).toContain("subcategoryTotals(expenses, previousKey, matchedCategory)");
    expect(back).toContain("subcategoryTotals(expenses, key, matchedCategory)");
    expect(back).toContain("purchasesInMonth(previousKey, previousLabel)");
    expect(back).toContain("purchasesInMonth(key, label)");
    expect(back).not.toContain("localStorage.setItem(ASSET_ORDER_STORAGE_KEY");
  });
});
