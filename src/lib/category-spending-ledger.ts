import { supabase } from "@/integrations/supabase/client";

export type CategoryLedgerTransaction = {
  category: string | null;
  date: string | null;
  amount: number | string | null;
  type: string | null;
  is_visible: boolean | null;
  created_at: string | null;
};

const LEDGER_PAGE_SIZE = 1000;

export async function fetchAllCategoryLedgerTransactions(userId: string): Promise<CategoryLedgerTransaction[]> {
  const rows: CategoryLedgerTransaction[] = [];

  for (let from = 0; ; from += LEDGER_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("category,date,amount,type,is_visible,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, from + LEDGER_PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data || []) as CategoryLedgerTransaction[];
    rows.push(...page);
    if (page.length < LEDGER_PAGE_SIZE) break;
  }

  return rows;
}

export function addCurrencyCents(currentCents: number, amount: number | string | null | undefined) {
  return currentCents + Math.round(Number(amount || 0) * 100);
}
