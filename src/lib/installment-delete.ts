// Shared helpers for deleting an installment plan or its future occurrences.
// Used by the delete dialogs in both /transactions and / (home).
import { supabase } from "@/integrations/supabase/client";

export type DeleteTarget = {
  id: string;
  name?: string;
  installment_group_id?: string | null;
  installment_number?: number | null;
  total_installments?: number | null;
};

export type DeleteScope = "single" | "future" | "all";

export function isInstallmentTx(tx: DeleteTarget | null | undefined): boolean {
  if (!tx) return false;
  return !!tx.installment_group_id && (tx.total_installments ?? 1) > 1;
}

/**
 * Delete a transaction according to the chosen scope.
 *  - "single": only this row
 *  - "future": this row + all siblings in the group with installment_number >= current
 *  - "all":    every sibling in the group (entire installment plan)
 */
export async function deleteTransactionScope(
  tx: DeleteTarget,
  scope: DeleteScope
): Promise<{ deletedCount: number }> {
  const groupId = tx.installment_group_id;
  if (!groupId || scope === "single") {
    const { error } = await supabase.from("transactions").delete().eq("id", tx.id);
    if (error) throw error;
    return { deletedCount: 1 };
  }

  if (scope === "all") {
    const { data, error } = await supabase
      .from("transactions")
      .delete()
      .eq("installment_group_id", groupId)
      .select("id");
    if (error) throw error;
    return { deletedCount: data?.length ?? 0 };
  }

  // scope === "future"
  const fromNumber = tx.installment_number ?? 1;
  const { data, error } = await supabase
    .from("transactions")
    .delete()
    .eq("installment_group_id", groupId)
    .gte("installment_number", fromNumber)
    .select("id");
  if (error) throw error;
  return { deletedCount: data?.length ?? 0 };
}
