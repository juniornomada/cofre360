import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "src/routes/cards.tsx"), "utf8");

describe("Cartões — antecipação dentro do editor da fatura", () => {
  it("tem opção visível no editor do cartão, inclusive em dispositivos móveis", () => {
    expect(route).toContain('data-testid="anticipate-installments-button"');
    expect(route).toContain("Antecipar parcelas futuras");
    expect(route).toContain('data-testid="anticipate-installments-dialog"');
    expect(route).toContain("Quantidade de parcelas para antecipar");
    expect(route).toContain("Fatura de destino");
    expect(route).toContain("Prévia da antecipação");
  });

  it("não cria transações extras nem altera o valor, a compra ou o número da parcela", () => {
    expect(route).toContain(".update({ date: plan.targetDate })");
    expect(route).toContain('.eq("installment_group_id", anticipationTx.installment_group_id!)');
    expect(route).toContain('.in("id", plan.moves.map((move) => move.id))');
    expect(route).toContain('if (!isSameAnticipationPlan(currentAnticipationPlan, plan))');
    expect(route).toContain('if (paidMonths.has(targetMonth))');
    expect(route).toContain('paidMonths.has(getBillingCycleMonthKey(');
  });

  it("distingue o controle financeiro interno da antecipação bancária", () => {
    expect(route).toContain("Não solicita antecipação ao Porto Bank nem paga a fatura.");
  });
});
