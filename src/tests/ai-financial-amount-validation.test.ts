import { describe, expect, it } from "vitest";
import { checkFinancialAmounts, moneyBR } from "../../supabase/functions/run-ai-tests/accuracy";

describe("Avaliação objetiva de valores do consultor financeiro", () => {
  it("confere valores brasileiros positivos, negativos e zero com rótulos distintos", () => {
    const answer = "### Resumo\n- **Receitas: R$ 1.209,63**\n- **Despesas: R$ 809,40**\n- **Resultado: R$ 400,23**";
    const checks = checkFinancialAmounts(answer, [
      { label: "Receitas", amount: 1209.63 },
      { label: "Despesas", amount: 809.4 },
      { label: "Resultado", amount: 400.23 },
    ]);
    expect(checks).toMatchObject({ passed: 3, total: 3 });
    expect(moneyBR(-12.5)).toBe("-R$ 12,50");
    expect(moneyBR(0)).toBe("R$ 0,00");
  });

  it("não aceita valor correto associado ao conceito errado", () => {
    const answer = "**Receitas: R$ 90,00** **Despesas: R$ 10,00**";
    expect(checkFinancialAmounts(answer, [{ label: "Receitas", amount: 10 }]).passed).toBe(0);
  });

  it("não aprova números incorretos nem valores indisponíveis", () => {
    const answer = "**Total: R$ 100,01**";
    expect(checkFinancialAmounts(answer, [{ label: "Total", amount: 100 }]).passed).toBe(0);
    expect(checkFinancialAmounts(answer, [{ label: "Total", amount: NaN }]).passed).toBe(0);
  });

  it("compara números negativos com sinal e evita falso positivo de dígitos extras", () => {
    const answer = "**Resultado: -R$ 32,50**";
    expect(checkFinancialAmounts(answer, [{ label: "Resultado", amount: -32.5 }]).passed).toBe(1);
    expect(checkFinancialAmounts(answer, [{ label: "Resultado", amount: 32.5 }]).passed).toBe(0);
    expect(checkFinancialAmounts("**Total: R$ 100,001**", [{ label: "Total", amount: 100 }]).passed).toBe(0);
  });
});
