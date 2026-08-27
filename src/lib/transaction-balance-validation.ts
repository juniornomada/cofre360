export interface TransactionBalanceValidationInput {
  originalAmount: number;
  newAmount: number;
  originalBankAccountId?: string | null;
  newBankAccountId?: string | null;
  originalType: "income" | "expense";
  newType: "income" | "expense";
  availableBalance: number;
}

/** Editing metadata such as date must not be treated as a new expense. */
export function validateEditedExpenseBalance({
  originalAmount,
  newAmount,
  originalBankAccountId,
  newBankAccountId,
  originalType,
  newType,
  availableBalance,
}: TransactionBalanceValidationInput): boolean {
  if (newType !== "expense") return true;

  const accountChanged = originalBankAccountId !== newBankAccountId;

  if (!accountChanged && originalType === "expense") {
    const additionalAmount = Math.max(0, Number(newAmount) - Number(originalAmount));
    return additionalAmount <= Number(availableBalance);
  }

  return Number(newAmount) <= Number(availableBalance);
}
