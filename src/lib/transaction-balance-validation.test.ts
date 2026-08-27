import { describe, expect, it } from "vitest";
import { validateEditedExpenseBalance } from "./transaction-balance-validation";

describe("validateEditedExpenseBalance", () => {
  it("allows changing only the date of an existing debit expense", () => {
    expect(validateEditedExpenseBalance({
      originalAmount: 2000,
      newAmount: 2000,
      originalBankAccountId: "mp",
      newBankAccountId: "mp",
      originalType: "expense",
      newType: "expense",
      availableBalance: 1670.04,
    })).toBe(true);
  });

  it("requires balance only for an increase in an existing expense", () => {
    expect(validateEditedExpenseBalance({
      originalAmount: 2000,
      newAmount: 2100,
      originalBankAccountId: "mp",
      newBankAccountId: "mp",
      originalType: "expense",
      newType: "expense",
      availableBalance: 50,
    })).toBe(false);
  });
});
