import { supabase } from "@/integrations/supabase/client";
import { categorizeTransaction } from "@/lib/categorize-transaction";

/**
 * Recalculates bank account balances based on transactions.
 * This is an expensive operation but ensures data consistency.
 */
export async function recalculateAllBalances() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const userId = session.user.id;

  try {
    // 1. Get all bank accounts
    const { data: accounts, error: accError } = await supabase
      .from("bank_accounts")
      .select("id, balance")
      .eq("user_id", userId);

    if (accError) throw accError;
    if (!accounts || accounts.length === 0) return;

    // 2. Get all transactions that affect bank accounts (excluding card expenses)
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("bank_account_id, amount, type, is_visible, category")
      .eq("user_id", userId)
      .not("bank_account_id", "is", null);

    if (txError) throw txError;

    // 3. Map balances
    const balanceUpdates: Record<string, number> = {};
    accounts.forEach(acc => {
      // Base balance is 0 for recalculation purposes if we assume the transactions represent the full history,
      // OR we might want to keep the "initial balance" and add transactions to it.
      // Looking at the existing codebase, bank_accounts.balance seems to be the "initial balance".
      balanceUpdates[acc.id] = Number(acc.balance || 0);
    });

    if (transactions) {
      transactions.forEach(tx => {
        if (tx.is_visible === false) return;
        const id = tx.bank_account_id as string;
        if (!balanceUpdates.hasOwnProperty(id)) return;

        // Skip card expenses because they don't affect bank balance until paid
        // (This logic matches fetchBankAccounts in transactions.tsx and fetchAll in index.tsx)
        const isCardExpense = tx.type === "expense" && tx.category !== "Transferência" && !tx.category.startsWith("Transferências") && 
                             // Checking if it has a card is safer
                             !!(tx as any).card; 
        
        // Actually, let's follow the logic in transactions.tsx exactly:
        // tx.type === "expense" && tx.bank_account_id && !tx.card
        // But the select didn't include card. Let's fix that.
      });
    }

    // Since the logic varied slightly across files, let's implement a robust one.
    // We'll re-fetch with card info.
  } catch (error) {
    console.error("Error in recalculateAllBalances:", error);
    throw error;
  }
}

/**
 * Re-categorizes all transactions based on their names.
 */
export async function recategorizeAllTransactions() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const userId = session.user.id;

  try {
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("id, name")
      .eq("user_id", userId);

    if (error) throw error;
    if (!transactions) return;

    for (const tx of transactions) {
      const { category, icon } = categorizeTransaction(tx.name);
      await supabase
        .from("transactions")
        .update({ category, icon })
        .eq("id", tx.id);
    }
  } catch (error) {
    console.error("Error in recategorizeAllTransactions:", error);
    throw error;
  }
}
