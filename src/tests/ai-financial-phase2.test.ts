import { describe, expect, it } from "vitest";
import { checkFinancialAmounts, checkSubcategorySum } from "../../supabase/functions/run-ai-tests/accuracy";

describe("Fase 2: precisão financeira verificável", () => {
  it("confere o total econômico e cada categoria identificada por travessão", () => {
    const answer = "### Gastos por categoria\n\n**Compras realizadas no período: R$ 850,50**\n\n- 🚗 **Transporte — R$ 700,50**\n- 🍴 **Alimentação — R$ 150,00**";
    const checks = checkFinancialAmounts(answer, [
      { label: "Compras realizadas no período", amount: 850.50 },
      { label: "Transporte", amount: 700.50, separator: "dash" },
      { label: "Alimentação", amount: 150, separator: "dash" },
    ]);
    expect(checks).toMatchObject({ passed: 3, total: 3 });
    expect(checkFinancialAmounts(answer, [{ label: "Transporte", amount: 700.49, separator: "dash" }]).passed).toBe(0);
    expect(checkFinancialAmounts(answer, [{ label: "Compras", amount: 850.5 }]).passed).toBe(0);
  });

  it("confere mês atual, mês anterior, diferença negativa ou positiva", () => {
    const answer = "- **Outubro/2026: R$ 850,50**\n- **Setembro/2026: R$ 1.000,50**\n- Diferença: **-R$ 150,00**";
    expect(checkFinancialAmounts(answer, [
      { label: "Outubro/2026", amount: 850.5 },
      { label: "Setembro/2026", amount: 1000.5 },
      { label: "Diferença", amount: -150, allowPositivePlus: true },
    ]).passed).toBe(3);
    expect(checkFinancialAmounts("- Diferença: **+R$ 12,34**", [
      { label: "Diferença", amount: 12.34, allowPositivePlus: true },
    ]).passed).toBe(1);
    expect(checkFinancialAmounts(answer, [{ label: "Diferença", amount: 150, allowPositivePlus: true }]).passed).toBe(0);
    expect(checkFinancialAmounts(answer, [{ label: "Setembro/2026", amount: 850.5 }]).passed).toBe(0);
  });

  it("verifica que as subcategorias apresentadas somam o total canônico", () => {
    const answer = "### Alimentação por subcategoria\n\n**Total: R$ 350,35**\n\n- **Supermercado — R$ 300,30**\n- **Restaurante — R$ 50,05**";
    expect(checkSubcategorySum(answer, 350.35)).toMatchObject({ passed: 1, total: 1 });
    expect(checkSubcategorySum(answer, 350.34).passed).toBe(0);
    expect(checkSubcategorySum("**Total: R$ 350,35**", 350.35).passed).toBe(0);
    expect(checkSubcategorySum("(sem compras no período)", 0).passed).toBe(1);
    expect(checkSubcategorySum("**Total: R$ 350,35**", Number.NaN).passed).toBe(0);
  });

  it("não aceita rótulos financeiros parecidos ou percentuais no lugar de moeda", () => {
    const answer = "**Compras realizadas no mês: R$ 120,00**\n#### Parcelas de compras antigas identificadas no mês — R$ 90,05";
    expect(checkFinancialAmounts(answer, [
      { label: "Compras realizadas no mês", amount: 120 },
      { label: "Parcelas de compras antigas identificadas no mês", amount: 90.05, separator: "dash" },
    ]).passed).toBe(2);
    expect(checkFinancialAmounts(answer, [{ label: "Compras realizadas no mês", amount: 90.05 }]).passed).toBe(0);
    expect(checkFinancialAmounts(answer, [{ label: "Parcelas de compras antigas identificadas no mês", amount: 90.04, separator: "dash" }]).passed).toBe(0);
  });
});
