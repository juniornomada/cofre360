import { describe, expect, it } from "vitest";
import { getVisibleMonthlyCategoryRanking, type MonthlyCategoryRow } from "@/lib/transaction-category-navigation";

const row = (
  id: string,
  category: string,
  date: string,
  extra: Partial<MonthlyCategoryRow> = {},
): MonthlyCategoryRow => ({
  id,
  category,
  date,
  amount: 100,
  type: "expense",
  card: null,
  bank_account_id: "bank-1",
  is_visible: true,
  transaction_status: "posted",
  ...extra,
});

const october = {
  selectedMonthStartUtc: Date.UTC(2026, 9, 1),
  selectedMonthEndUtc: Date.UTC(2026, 10, 1) - 1,
  source: "all" as const,
  accountId: null,
  minAmount: null,
  maxAmount: null,
  filterType: "all" as const,
  parseDate: (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(date + "T00:00:00Z")
    : null,
};

describe("monthly transaction category shortcuts", () => {
  it("hides categories from previous months, hidden transactions, and unused categories", () => {
    const result = getVisibleMonthlyCategoryRanking({
      ...october,
      economicRows: [
        row("food-oct", "Alimentação > Mercado", "2026-10-12"),
        row("food-sep", "Alimentação > Restaurante", "2026-09-12"),
        row("health-sep", "Saúde > Farmácia", "2026-09-30"),
        row("leisure-hidden", "Lazer > Cinema", "2026-10-10", { is_visible: false }),
      ],
      rawRows: [],
    });
    expect(result).toEqual([{ category: "Alimentação", count: 1 }]);
  });

  it("only offers Conta/Cartão categories belonging to that source", () => {
    const economicRows = [
      row("food", "Alimentação > Mercado", "2026-10-08", { card: "Nubank", bank_account_id: null }),
      row("health", "Saúde > Farmácia", "2026-10-09"),
    ];
    expect(getVisibleMonthlyCategoryRanking({ ...october, economicRows, rawRows: [], source: "card" }))
      .toEqual([{ category: "Alimentação", count: 1 }]);
    expect(getVisibleMonthlyCategoryRanking({ ...october, economicRows, rawRows: [], source: "account" }))
      .toEqual([{ category: "Saúde", count: 1 }]);
  });

  it("keeps transfers and card payments only when browseable, without duplicate badges", () => {
    const transfer = row("transfer-1", "Transferências > PIX", "2026-10-10");
    const cardPayment = row("payment-1", "Pagamento de Cartão > Pagamento Total", "2026-10-11");
    const result = getVisibleMonthlyCategoryRanking({
      ...october,
      economicRows: [transfer, cardPayment],
      rawRows: [transfer, cardPayment],
    });
    expect(result).toEqual([
      { category: "Pagamento de Cartão", count: 1 },
      { category: "Transferências", count: 1 },
    ]);
    expect(getVisibleMonthlyCategoryRanking({
      ...october, economicRows: [transfer, cardPayment], rawRows: [], filterType: "expense",
    })).toEqual([]);
  });

  it("shows a pending category for the month even though it is absent from the posted ledger", () => {
    const result = getVisibleMonthlyCategoryRanking({
      ...october,
      economicRows: [],
      rawRows: [
        row("pending", "Saúde > Farmácia", "2026-10-18", { transaction_status: "pending" }),
        row("later", "Compras > Outros", "2026-11-18", { transaction_status: "pending" }),
      ],
    });
    expect(result).toEqual([{ category: "Saúde", count: 1 }]);
  });

  it("honors advanced filters without needing to deselect the current category", () => {
    const result = getVisibleMonthlyCategoryRanking({
      ...october,
      economicRows: [
        row("food", "Alimentação > Mercado", "2026-10-10", { amount: 20 }),
        row("health", "Saúde > Farmácia", "2026-10-15", { amount: 150 }),
      ],
      rawRows: [],
      minAmount: 100,
      startDateUtc: Date.UTC(2026, 9, 12),
    });
    expect(result).toEqual([{ category: "Saúde", count: 1 }]);
  });
});
