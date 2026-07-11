import { describe, it, expect } from "vitest";
import { formatSignedBRL } from "../format-brl";

describe("formatSignedBRL", () => {
  it("formata zero sem sinal", () => {
    expect(formatSignedBRL(0)).toBe("R$ 0,00");
    expect(formatSignedBRL(-0)).toBe("R$ 0,00");
    expect(formatSignedBRL(0.004)).toBe("R$ 0,00"); // arredonda
    expect(formatSignedBRL(-0.004)).toBe("R$ 0,00");
  });

  it("prefixa '+' em créditos", () => {
    expect(formatSignedBRL(1)).toBe("+R$ 1,00");
    expect(formatSignedBRL(1234.5)).toBe("+R$ 1.234,50");
    expect(formatSignedBRL(1_000_000)).toBe("+R$ 1.000.000,00");
  });

  it("prefixa '-' em débitos e usa o módulo (não 'R$ -x')", () => {
    expect(formatSignedBRL(-1)).toBe("-R$ 1,00");
    expect(formatSignedBRL(-1234.5)).toBe("-R$ 1.234,50");
    expect(formatSignedBRL(-1_000_000)).toBe("-R$ 1.000.000,00");
    // Regressão explícita: nunca aparece "R$ -" no meio.
    expect(formatSignedBRL(-99)).not.toMatch(/R\$ -/);
  });

  it("usa separadores pt-BR (milhar '.' e decimal ',')", () => {
    expect(formatSignedBRL(1234567.89)).toBe("+R$ 1.234.567,89");
    expect(formatSignedBRL(-1234567.89)).toBe("-R$ 1.234.567,89");
  });

  it("mantém sempre 2 casas decimais", () => {
    expect(formatSignedBRL(10)).toBe("+R$ 10,00");
    expect(formatSignedBRL(10.1)).toBe("+R$ 10,10");
    expect(formatSignedBRL(10.005)).toMatch(/^\+R\$ 10,0[01]$/); // depende de arred.
  });

  it("é resiliente a null/undefined/NaN/Infinity", () => {
    expect(formatSignedBRL(null)).toBe("R$ 0,00");
    expect(formatSignedBRL(undefined)).toBe("R$ 0,00");
    expect(formatSignedBRL(NaN)).toBe("R$ 0,00");
    expect(formatSignedBRL(Infinity)).toBe("R$ 0,00");
    expect(formatSignedBRL(-Infinity)).toBe("R$ 0,00");
  });
});
