import { describe, expect, it } from "vitest";
import { getTransactionListDisplayAmounts } from "@/lib/transaction-list-display";

describe("transaction list display amounts", () => {
  it("shows the paid installment while preserving the full economic purchase amount", () => {
    expect(getTransactionListDisplayAmounts({
      economicAmount: 712.60,
      originalAmount: 178.15,
      installmentNumber: 1,
      totalInstallments: 4,
    })).toEqual({
      displayAmount: 178.15,
      economicAmount: 712.60,
    });
  });

  it("keeps a normal purchase as a single displayed amount", () => {
    expect(getTransactionListDisplayAmounts({
      economicAmount: 124.41,
      originalAmount: 124.41,
      installmentNumber: null,
      totalInstallments: null,
    })).toEqual({
      displayAmount: 124.41,
      economicAmount: null,
    });
  });

  it("falls back to the economic amount when the installment source row is missing", () => {
    expect(getTransactionListDisplayAmounts({
      economicAmount: 300,
      originalAmount: null,
      installmentNumber: 1,
      totalInstallments: 3,
    })).toEqual({
      displayAmount: 300,
      economicAmount: null,
    });
  });
});
