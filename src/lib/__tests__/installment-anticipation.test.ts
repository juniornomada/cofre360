import { describe, expect, it } from "vitest";
import { buildAnticipationPlan, isSameAnticipationPlan, validateAnticipationGroup } from "@/lib/installment-anticipation";
import { groupByBillingCycle, type CardTransaction } from "@/lib/invoice-utils";

const transactions: CardTransaction[] = Array.from({ length: 10 }, (_, i) => ({
  id: `installment-${i + 1}`,
  name: "Coxins Motor e Câmbio Creta",
  icon: "🔧",
  category: "Transporte > Manutenção",
  card: "Porto Bank",
  created_at: "2026-10-08T14:00:00Z",
  date: `${2026 + Math.floor((9 + i) / 12)}-${String((9 + i) % 12 + 1).padStart(2, "0")}-08`,
  purchase_date: "2026-10-08",
  amount: 215.12,
  type: "expense",
  installment_number: i + 1,
  total_installments: 10,
  installment_group_id: "group-coxins",
}));

const periods = groupByBillingCycle(transactions, 3, 10, new Date(2026, 10, 15));
const nov = periods.find((p) => p.dueDate.getFullYear() === 2026 && p.dueDate.getMonth() === 10)!;
const dec = periods.find((p) => p.dueDate.getFullYear() === 2026 && p.dueDate.getMonth() === 11)!;

describe("Antecipação de parcelas na fatura", () => {
  it("antecipar 3 parcelas de 2/10 para a fatura de novembro preserva valores e identificadores", () => {
    const plan = buildAnticipationPlan(
      transactions, transactions[1], "Porto Bank", nov, 3, new Date(2026, 9, 28),
    );
    expect(plan.moves.map((p) => p.number)).toEqual([2, 3, 4]);
    expect(plan.moves.map((p) => p.id)).toEqual(["installment-2", "installment-3", "installment-4"]);
    expect(plan.targetDate).toBe("2026-10-28");
    expect(plan.totalAmount).toBe(645.36);
    expect(plan.available).toBe(9);
    expect(transactions[1].date).toBe("2026-11-08"); // No source mutation
    expect(transactions[1].purchase_date).toBe("2026-10-08");
  });

  it("antecipar 2 parcelas para dezembro começa pela primeira parcela após a fatura de dezembro", () => {
    const plan = buildAnticipationPlan(
      transactions, transactions[1], "Porto Bank", dec, 2, new Date(2026, 9, 28),
    );
    expect(plan.moves.map((p) => p.number)).toEqual([3, 4]);
    expect(plan.targetDate).toBe("2026-11-04"); // Lies inside December billing period
  });

  it("recusa fatura fechada, parcelas além do disponível e compra de outro cartão", () => {
    expect(() => buildAnticipationPlan(
      transactions, transactions[1], "Porto Bank", nov, 1, new Date(2026, 10, 4),
    )).toThrow(/já fechou/);
    expect(() => buildAnticipationPlan(
      transactions, transactions[1], "Porto Bank", nov, 10, new Date(2026, 9, 28),
    )).toThrow(/excede/);
    expect(validateAnticipationGroup(transactions, transactions[1], "Nubank")).toMatch(/consistentes/);
  });

  it("bloqueia parcelamento incompleto, repetido ou com valores inválidos", () => {
    expect(validateAnticipationGroup(transactions.slice(0, 9), transactions[1], "Porto Bank")).toMatch(/incompleto/);
    const duplicate = transactions.map(x => ({ ...x }));
    duplicate[2].installment_number = 2;
    expect(validateAnticipationGroup(duplicate, transactions[1], "Porto Bank")).toMatch(/consistentes/);
    const invalidAmount = transactions.map(x => ({ ...x }));
    invalidAmount[3].amount = -5;
    expect(validateAnticipationGroup(invalidAmount, transactions[1], "Porto Bank")).toMatch(/consistentes/);
  });

  it("detecta mudança remota de valor ou data antes de reatribuir a fatura", () => {
    const plan = buildAnticipationPlan(
      transactions, transactions[1], "Porto Bank", nov, 2, new Date(2026, 9, 28),
    );
    const changed = transactions.map(x => ({ ...x }));
    changed[2].amount += 1;
    const stale = buildAnticipationPlan(
      changed, changed[1], "Porto Bank", nov, 2, new Date(2026, 9, 28),
    );
    expect(isSameAnticipationPlan(plan, stale)).toBe(false);
    expect(isSameAnticipationPlan(plan, plan)).toBe(true);
  });

  it("não duplica a compra nem muda o total econômico ao reagrupar as datas no cálculo das faturas", () => {
    const plan = buildAnticipationPlan(
      transactions, transactions[1], "Porto Bank", nov, 3, new Date(2026, 9, 28),
    );
    const originalTotal = transactions.reduce((s, row) => s + row.amount, 0);
    const moved = transactions.map(row =>
      plan.moves.some(m => m.id === row.id) ? { ...row, date: plan.targetDate } : row,
    );
    const newTotal = moved.reduce((s, row) => s + row.amount, 0);
    expect(newTotal).toBeCloseTo(originalTotal);
    expect(new Set(moved.map(row => row.id)).size).toBe(10);

    const before = groupByBillingCycle(transactions, 3, 10, new Date(2026, 10, 15));
    const after = groupByBillingCycle(moved, 3, 10, new Date(2026, 10, 15));
    const targetBefore = before.find(p => p.dueDate.getMonth() === 10 && p.dueDate.getFullYear() === 2026)!;
    const targetAfter = after.find(p => p.dueDate.getMonth() === 10 && p.dueDate.getFullYear() === 2026)!;
    expect(targetAfter.total - targetBefore.total).toBeCloseTo(645.36);
  });
});
