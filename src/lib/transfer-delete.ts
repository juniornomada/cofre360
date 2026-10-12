import { supabase } from "@/integrations/supabase/client";

/**
 * A transfer is stored as two rows (expense + income). Deleting only one
 * silently changes account balances, so validate the pair before deleting.
 *
 * Legacy transfers without a shared group id are intentionally not matched by
 * amount/date alone: multiple equal transfers can be legitimate.
 */
export type TransferDeleteTarget = {
  id: string;
  installment_group_id?: string | null;
};

type TransferPairRow = {
  id: string;
  type: string;
  category: string | null;
};

const isTransferCategory = (category: string | null): boolean => {
  const value = (category || "").trim();
  return value === "Transferência" || value === "Transferências" || value.startsWith("Transferências >");
};

/**
 * Raised only after verifying that a transfer group contains exactly the
 * selected transfer leg. The caller must ask for separate confirmation
 * before attempting a single-sided deletion.
 */
export class OrphanedTransferError extends Error {
  constructor() {
    super("Esta transferência está sem a outra ponta. Confirme se deseja excluir apenas este lançamento; isso atualizará o saldo desta conta.");
    this.name = "OrphanedTransferError";
  }
}

export async function deleteTransferPair(
  target: TransferDeleteTarget,
  options: { allowOrphan?: boolean } = {},
): Promise<{ deletedCount: number }> {
  if (!target.installment_group_id) {
    throw new Error("Esta transferência antiga não possui um vínculo seguro entre as duas contas. Nenhum lançamento foi excluído.");
  }

  const { data, error } = await supabase
    .from("transactions")
    .select("id,type,category")
    .eq("installment_group_id", target.installment_group_id);

  if (error) throw error;
  const rows = (data || []) as TransferPairRow[];

  const validPair =
    rows.length === 2 &&
    rows.some((row) => row.id === target.id) &&
    rows.every((row) => isTransferCategory(row.category)) &&
    rows.filter((row) => row.type === "expense").length === 1 &&
    rows.filter((row) => row.type === "income").length === 1;

  // A group with exactly one genuine transfer row is an orphan. Never
  // silently delete it as an ordinary transfer: the user must explicitly
  // confirm that only the remaining leg will be removed.
  const orphan =
    rows.length === 1 &&
    rows[0].id === target.id &&
    isTransferCategory(rows[0].category) &&
    (rows[0].type === "expense" || rows[0].type === "income");

  if (orphan) {
    if (!options.allowOrphan) throw new OrphanedTransferError();

    // Restrict deletion to the verified ID AND the group, and return the
    // count from PostgREST rather than assuming that a delete succeeded.
    const { data: deleted, error: deleteError } = await supabase
      .from("transactions")
      .delete()
      .eq("id", target.id)
      .eq("installment_group_id", target.installment_group_id)
      .select("id");
    if (deleteError) throw deleteError;
    if (deleted?.length !== 1) {
      throw new Error("A exclusão da transferência sem par não foi confirmada. Atualize os saldos e verifique o lançamento.");
    }
    return { deletedCount: 1 };
  }

  if (!validPair) {
    throw new Error("Não foi possível confirmar as duas pontas desta transferência. Nenhum lançamento foi excluído.");
  }

  // Both legs are deleted in a single database statement, not two sequential
  // client requests. Restrict it to exactly the two validated row IDs.
  const ids = rows.map((row) => row.id);
  const { data: deleted, error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .in("id", ids)
    .eq("installment_group_id", target.installment_group_id)
    .select("id");

  if (deleteError) throw deleteError;
  if (deleted?.length !== 2) {
    throw new Error("A exclusão não confirmou as duas pontas da transferência. Atualize os saldos e verifique os lançamentos.");
  }
  return { deletedCount: 2 };
}
