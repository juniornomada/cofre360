import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CardData, BankAccount } from "../types";
import { CardTransaction } from "@/lib/invoice-utils";
import { useAlert } from "@/routes/__root";

export function useCards() {
  const { showAlert } = useAlert();
  const [cards, setCards] = useState<CardData[]>([]);
  const [cardTotals, setCardTotals] = useState<Record<string, number>>({});
  const [cardPayments, setCardPayments] = useState<Record<string, number>>({});
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const [cardsRes, txRes, accountsRes, paymentsRes] = await Promise.all([
        supabase.from("cards").select("*").eq("user_id", session.user.id).order("sort_order", { ascending: true }),
        supabase.from("transactions").select("id, name, amount, date, created_at, card, icon, category, type, total_installments, installment_number, installment_group_id").eq("user_id", session.user.id).not("card", "is", null),
        supabase.from("bank_accounts").select("*").eq("user_id", session.user.id).order("created_at", { ascending: true }),
        supabase.from("card_payments").select("card_id, amount").eq("user_id", session.user.id),
      ]);

      if (cardsRes.error) throw cardsRes.error;
      if (accountsRes.error) throw accountsRes.error;
      if (txRes.error) throw txRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      setCards(cardsRes.data || []);
      setBankAccounts(accountsRes.data || []);
      
      if (txRes.data) {
        const totals: Record<string, number> = {};
        for (const tx of txRes.data) {
          if (tx.card) totals[tx.card] = (totals[tx.card] || 0) + Number(tx.amount);
        }
        setCardTotals(totals);
      }
      
      if (paymentsRes.data) {
        const paid: Record<string, number> = {};
        for (const p of paymentsRes.data) {
          paid[p.card_id] = (paid[p.card_id] || 0) + Number(p.amount);
        }
        setCardPayments(paid);
      }
    } catch (error: any) {
      console.error("Error fetching data:", error);
      showAlert("Erro ao carregar dados: " + (error.message || "Erro desconhecido"), "error");
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    cards,
    cardTotals,
    cardPayments,
    bankAccounts,
    loading,
    refresh: fetchAll
  };
}
