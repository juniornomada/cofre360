import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FinancialMonthFacts = {
  month: string;
  income: number;
  expense: number;
  result: number;
  cardExpenseComponent: number;
  expenseBreakdown: Array<{ category: string; amount: number }>;
  categories: Array<{ category: string; amount: number }>;
  cards: Array<{ card: string; amount: number }>;
  oldInstallments: { count: number; amount: number };
  oldInstallmentCategories: Array<{ category: string; amount: number }>;
};

const normalizeCategoryRows = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item: any) => ({
        category: String(item?.category || "Sem categoria"),
        amount: Number(item?.amount || 0),
      }))
    : [];

export async function fetchFinancialMonthFacts(monthKey: string): Promise<FinancialMonthFacts> {
  const pMonth = `${monthKey}-01`;
  const { data, error } = await (supabase as any).rpc("financial_month_facts", { p_month: pMonth });
  if (error) throw error;
  const raw = (data || {}) as Partial<FinancialMonthFacts>;
  return {
    month: raw.month || monthKey,
    income: Number(raw.income || 0),
    expense: Number(raw.expense || 0),
    result: Number(raw.result || 0),
    cardExpenseComponent: Number(raw.cardExpenseComponent || 0),
    expenseBreakdown: normalizeCategoryRows(raw.expenseBreakdown),
    categories: normalizeCategoryRows(raw.categories),
    cards: Array.isArray(raw.cards)
      ? raw.cards.map((item) => ({ card: String(item.card || "Cartão"), amount: Number(item.amount || 0) }))
      : [],
    oldInstallments: {
      count: Number(raw.oldInstallments?.count || 0),
      amount: Number(raw.oldInstallments?.amount || 0),
    },
    oldInstallmentCategories: normalizeCategoryRows(raw.oldInstallmentCategories),
  };
}

export function useFinancialMonthFacts(monthKey: string, enabled = true) {
  return useQuery({
    queryKey: ["financial-month-facts", monthKey],
    queryFn: () => fetchFinancialMonthFacts(monthKey),
    enabled: enabled && /^\d{4}-\d{2}$/.test(monthKey),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}
