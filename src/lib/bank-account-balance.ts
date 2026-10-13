import { countsTowardCurrentBalance } from "@/lib/transaction-status";

/**
 * One banking-ledger rule for Contas, Home and the Pagar Fatura account picker.
 * Card purchases are commitments, not debits from a bank account: the bank
 * balance moves only when an actual bank/payment transaction is posted.
 */
export type BankBalanceMovement = {
  bank_account_id?: string | null;
  amount?: number | string | null;
  type?: string | null;
  is_visible?: boolean | null;
  card?: string | null;
  transaction_status?: string | null;
  posted_at?: string | null;
  transaction_date?: string | null;
  date?: string | null;
};

export function countsTowardBankAccountBalance(
  tx: BankBalanceMovement,
  cutoff: Date,
): boolean {
  if (!tx.bank_account_id || tx.is_visible === false) return false;
  if (tx.type === "expense" && tx.card) return false;
  return countsTowardCurrentBalance(tx, cutoff);
}

/** Reconstruct balances from the account opening balance and effective movements. */
export function calculateBankAccountBalances<T extends { id: string; balance: number | string | null }>(
  accounts: readonly T[],
  transactions: readonly BankBalanceMovement[],
  cutoff: Date,
): (Omit<T, "balance"> & { balance: number })[] {
  const netByAccount = new Map<string, number>();
  for (const tx of transactions) {
    if (!countsTowardBankAccountBalance(tx, cutoff)) continue;
    const amount = Number(tx.amount ?? 0);
    if (!Number.isFinite(amount)) continue;
    const id = tx.bank_account_id!;
    const delta = tx.type === "income" ? amount : -amount;
    netByAccount.set(id, (netByAccount.get(id) || 0) + delta);
  }
  return accounts.map(account => ({
    ...account,
    balance: Math.round((Number(account.balance || 0) + (netByAccount.get(account.id) || 0)) * 100) / 100,
  }));
}
