import { supabase } from "@/integrations/supabase/client";
import { collapseCategorySpendingRows } from "@/lib/category-spending";

export type CategoryLedgerTransaction = {
  id: string;
  name: string;
  category: string | null;
  date: string | null;
  amount: number | string | null;
  type: string | null;
  card: string | null;
  bank_account_id: string | null;
  is_visible: boolean | null;
  created_at: string | null;
  installment_group_id: string | null;
  installment_number: number | null;
  total_installments: number | null;
  installment_mode: string | null;
  installment_source_amount: number | string | null;
};

const LEDGER_PAGE_SIZE = 1000;

export async function fetchAllCategoryLedgerTransactions(userId: string): Promise<CategoryLedgerTransaction[]> {
  const rows: CategoryLedgerTransaction[] = [];

  for (let from = 0; ; from += LEDGER_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id,name,category,date,amount,type,card,bank_account_id,is_visible,created_at,installment_group_id,installment_number,total_installments,installment_mode,installment_source_amount")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, from + LEDGER_PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data || []) as CategoryLedgerTransaction[];
    rows.push(...page);
    if (page.length < LEDGER_PAGE_SIZE) break;
  }

  return collapseCategorySpendingRows(rows);
}

export function addCurrencyCents(currentCents: number, amount: number | string | null | undefined) {
  return currentCents + Math.round(Number(amount || 0) * 100);
}
