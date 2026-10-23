import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const code = readFileSync(resolve(process.cwd(), "src/routes/invest.tsx"), "utf8");

describe("Invest — destaque do patrimônio líquido no resumo", () => {
  it("destaca a soma dos valores líquidos, mantendo o bruto apenas secundário", () => {
    expect(code).toContain("Patrimônio líquido estimado");
    expect(code).toContain("fmtBRL(totalNet)");
    expect(code).toContain("Bruto: <strong");
    expect(code).toContain("fmtBRL(totalGross)");
    expect(code).not.toContain('<p className="text-sm text-muted-foreground">Patrimônio bruto</p>');
  });

  it("mostra a rentabilidade líquida e sinaliza quando não há dados de descontos", () => {
    expect(code).toContain("const totalNetPnL = totalNet - totalInvested");
    expect(code).toContain("Resultado líquido:");
    expect(code).toContain("netEstimateIncomplete &&");
    expect(code).toContain("Estimativa parcial:");
  });

  it("mantém o gráfico de alocação explicitamente bruto e detalha o IOF de renda fixa", () => {
    expect(code).toContain("value: (current?.value || 0) + val.grossValue");
    expect(code).toContain("Valor bruto");
    expect(code).toContain("v.estimatedIOF > 0");
    expect(code).toContain("IOF estimado");
  });
});
