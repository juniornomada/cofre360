import { supabase } from "@/integrations/supabase/client";
import { categorizeTransaction } from "@/lib/categorize-transaction";

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

    // Use batches to avoid performance issues
    const BATCH_SIZE = 50;
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE);
      const updates = batch.map(tx => {
        const { category, icon } = categorizeTransaction(tx.name);
        return supabase
          .from("transactions")
          .update({ category, icon })
          .eq("id", tx.id);
      });
      await Promise.all(updates);
    }
  } catch (error) {
    console.error("Error in recategorizeAllTransactions:", error);
    throw error;
  }
}
