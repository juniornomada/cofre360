import { describe, expect, it } from "vitest";
import { includeMissingMonthlyCardPurchases } from "./transaction-month-default";

type Tx = { id: string; card: string | null; installment_group_id: string | null; name: string };
const tx = (id: string, card: string | null = null, group: string | null = null): Tx => ({
  id, card, installment_group_id: group, name: id,
});

describe("default monthly transactions: accounts and credit cards", () => {
  it("shows card purchases missing from the raw month's first page", () => {
    const account = tx("salary");
    const transfer = tx("transfer");
    const cardPurchase = tx("purchase-in-month", "Porto Bank", "installments-A");
    const rows = includeMissingMonthlyCardPurchases([account, transfer], [cardPurchase]);

    expect(rows.map((row) => row.id)).toEqual(["salary", "transfer", "purchase-in-month"]);
  });

  it("does not duplicate a card purchase already in the raw month list", () => {
    const purchase = tx("purchase-1", "Porto Bank", "group-1");
    const rows = includeMissingMonthlyCardPurchases([purchase], [purchase]);
    expect(rows).toEqual([purchase]);
  });

  it("does not duplicate later installments of a purchase already shown in the month", () => {
    const monthlyInstallment = tx("installment-2", "Porto Bank", "group-1");
    const firstInstallment = tx("installment-1", "Porto Bank", "group-1");
    expect(includeMissingMonthlyCardPurchases([monthlyInstallment], [firstInstallment]))
      .toEqual([monthlyInstallment]);
  });

  it("includes distinct card purchases and preserves pending, cash and card-payment rows", () => {
    const existing = [tx("pending-debit"), tx("card-payment"), tx("transfer"), tx("card-1", "Porto Bank", "group-a")];
    const purchases = [
      tx("card-1", "Porto Bank", "group-a"),
      tx("card-2", "Porto Bank", "group-b"),
      tx("card-3", "Mercado Pago", "group-c"),
      tx("card-3-other", "Mercado Pago", "group-c"),
      tx("bank-ledger-only"),
    ];
    expect(includeMissingMonthlyCardPurchases(existing, purchases).map((x) => x.id))
      .toEqual(["pending-debit", "card-payment", "transfer", "card-1", "card-2", "card-3"]);
    expect(existing).toHaveLength(4);
    expect(purchases).toHaveLength(5);
  });

  it("includes noninstallment card purchases once", () => {
    const rows = includeMissingMonthlyCardPurchases([], [
      tx("credit-purchase", "Porto Bank"),
      tx("credit-purchase", "Porto Bank"),
    ]);
    expect(rows).toHaveLength(1);
  });
});
