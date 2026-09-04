import { describe, expect, it } from "vitest";
import { groupByBillingCycle, type CardTransaction } from "@/lib/invoice-utils";

describe("groupByBillingCycle closing-day boundary", () => {
  it("keeps the latest transaction when it lands exactly on a future closing day", () => {
    const tx: CardTransaction = {
      id: "spoiler-6-6",
      name: "Spoiler dianteiro Creta 2018",
      icon: "🛒",
      category: "Compras > Outros",
      card: "Porto Bank",
      date: "03-02-2027",
      amount: 130.5,
      type: "expense",
      created_at: "2026-09-03T18:21:45.713Z",
      installment_number: 6,
      total_installments: 6,
      installment_group_id: "spoiler-group",
    };

    const periods = groupByBillingCycle(
      [tx],
      3,
      10,
      new Date(2026, 8, 3),
    );

    const period = periods.find((item) => item.transactions.some((row) => row.id === tx.id));

    expect(period).toBeDefined();
    expect(period?.endDate.getFullYear()).toBe(2027);
    expect(period?.endDate.getMonth()).toBe(2);
    expect(period?.endDate.getDate()).toBe(3);
    expect(period?.total).toBe(130.5);
  });
});
