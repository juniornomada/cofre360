import { CardTransaction, groupByBillingCycle } from "@/lib/invoice-utils";
import { supabase } from "@/integrations/supabase/client";
import { useState, useCallback } from "react";

export function useCardInvoice(cardName: string | undefined) {
  const [transactions, setTransactions] = useState<CardTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTransactions = useCallback(async () => {
    if (!cardName) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, name, icon, category, date, amount, type, created_at, total_installments, installment_number, installment_group_id")
        .eq("card", cardName)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      setTransactions((data as CardTransaction[]) || []);
    } catch (error) {
      console.error("Error fetching card transactions:", error);
    } finally {
      setLoading(false);
    }
  }, [cardName]);

  return {
    transactions,
    loading,
    fetchTransactions,
    setTransactions
  };
}
