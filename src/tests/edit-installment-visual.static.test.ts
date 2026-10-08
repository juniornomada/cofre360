import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/routes/transactions.tsx"), "utf8");
const start = source.indexOf("{/* Parcelamento — apenas para despesas no cartão de crédito */}");
const end = source.indexOf('Modo de cálculo</label>', start);
const editInstallmentUI = source.slice(start, end);

describe("edição de parcelamento — destaque e controles", () => {
  it("diferencia visualmente a parcela atual do total e apresenta nessa ordem", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const blue = editInstallmentUI.indexOf("border-blue-500/70");
    const purple = editInstallmentUI.indexOf("border-violet-500/70");
    expect(blue).toBeGreaterThanOrEqual(0);
    expect(purple).toBeGreaterThan(blue);
    expect(editInstallmentUI).toContain("bg-blue-700");
    expect(editInstallmentUI).toContain("Em qual parcela começar?");
    expect(editInstallmentUI).toContain("bg-violet-700");
    expect(editInstallmentUI).toContain("Total de parcelas");
    expect(editInstallmentUI).toContain("Quantidade de parcelas");
  });

  it("mantém rótulo acessível e limites da parcela atual", () => {
    expect(editInstallmentUI).toContain('htmlFor="edit-installment-current"');
    expect(editInstallmentUI).toContain('id="edit-installment-current"');
    expect(editInstallmentUI).toContain('aria-label="Parcela atual"');
    expect(editInstallmentUI).toContain("max={Number(editTx.total_installments) || 1}");
    expect(editInstallmentUI).toContain('aria-label="Aumentar parcela atual"');
    expect(editInstallmentUI).toContain('aria-label="Diminuir parcela atual"');
  });

  it("preserva a regra financeira ao mudar a quantidade de parcelas", () => {
    expect(editInstallmentUI).toContain('aria-label="Aumentar quantidade de parcelas"');
    expect(editInstallmentUI).toContain('aria-label="Diminuir quantidade de parcelas"');
    expect(editInstallmentUI.match(/changeInstallmentCount\(\{/g)).toHaveLength(2);
    expect(editInstallmentUI).toContain("currentCount === 2 ? 1 : currentCount - 1");
    expect(editInstallmentUI).toContain("total_installments: newCount > 1 ? newCount : null");
  });
});
