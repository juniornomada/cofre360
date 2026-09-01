from pathlib import Path

HELPER = '''import { supabase } from "@/integrations/supabase/client";

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
'''

Path('src/lib/category-spending-ledger.ts').write_text(HELPER)

# Transactions
p = Path('src/routes/transactions.tsx')
s = p.read_text()

anchor = 'import { mainCategories, parseCategoryValue } from "@/lib/categories";\n'
replacement = anchor + 'import { addCurrencyCents, fetchAllCategoryLedgerTransactions, type CategoryLedgerTransaction } from "@/lib/category-spending-ledger";\n'
if replacement not in s:
    if anchor not in s:
        raise SystemExit('transactions import anchor not found')
    s = s.replace(anchor, replacement, 1)

anchor = '  const [transactions, setTransactions] = useState<Transaction[]>([]);\n'
replacement = anchor + '  const [categoryLedgerTransactions, setCategoryLedgerTransactions] = useState<CategoryLedgerTransaction[]>([]);\n'
if replacement not in s:
    if anchor not in s:
        raise SystemExit('transactions state anchor not found')
    s = s.replace(anchor, replacement, 1)

old = '''  const fetchTransactions = useCallback(() => fetchTransactionsPage(true), [fetchTransactionsPage]);

  useEffect(() => {
    fetchTransactions();
    fetchCards();
    fetchBankAccounts();
  }, [fetchTransactions, fetchCards, fetchBankAccounts]);'''
new = '''  const fetchCategoryLedger = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      setCategoryLedgerTransactions(await fetchAllCategoryLedgerTransactions(session.user.id));
    } catch (error: any) {
      console.error("Error fetching exact category ledger:", error);
      toast.error(mapServerError(error, "Erro ao calcular gastos por categoria"));
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    await Promise.all([fetchTransactionsPage(true), fetchCategoryLedger()]);
  }, [fetchTransactionsPage, fetchCategoryLedger]);

  useEffect(() => {
    void fetchTransactions();
    fetchCards();
    fetchBankAccounts();
  }, [fetchTransactions, fetchCards, fetchBankAccounts]);'''
if new not in s:
    if old not in s:
        raise SystemExit('transactions fetch anchor not found')
    s = s.replace(old, new, 1)

old = '''  const categorySpending = Object.entries(
    transactions.reduce<Record<string, number>>((totals, tx) => {
      if (tx.type !== "expense" || tx.is_visible === false) return totals;
      const d = parseTxDate(tx.date, tx.created_at);
      const timestamp = d?.getTime() ?? NaN;
      if (!Number.isFinite(timestamp) || timestamp < selectedMonthStartUtc || timestamp > selectedMonthEndUtc) return totals;
      const mainCategory = parseCategoryValue(tx.category).group || "Outros";
      totals[mainCategory] = (totals[mainCategory] || 0) + Number(tx.amount || 0);
      return totals;
    }, {}),
  )
    .map(([category, amount]) => ({ category, amount }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const categoryExpenseTotal = categorySpending.reduce((sum, item) => sum + item.amount, 0);

  const formatCompactCurrency = (value: number) => {
    if (Math.abs(value) < 1000) return `R$ ${formatCurrency(value)}`;
    const compact = new Intl.NumberFormat("pt-BR", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value).replace(/\\s*mil/i, " mil");
    return `R$ ${compact}`;
  };'''
new = '''  const categorySpending = Object.entries(
    categoryLedgerTransactions.reduce<Record<string, number>>((totalsInCents, tx) => {
      if (tx.type !== "expense" || tx.is_visible === false) return totalsInCents;
      const d = parseTxDate(tx.date || "", tx.created_at || undefined);
      const timestamp = d?.getTime() ?? NaN;
      if (!Number.isFinite(timestamp) || timestamp < selectedMonthStartUtc || timestamp > selectedMonthEndUtc) return totalsInCents;
      const mainCategory = parseCategoryValue(tx.category || "").group || "Outros";
      totalsInCents[mainCategory] = addCurrencyCents(totalsInCents[mainCategory] || 0, tx.amount);
      return totalsInCents;
    }, {}),
  )
    .map(([category, amountInCents]) => ({ category, amount: amountInCents / 100 }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const categoryExpenseTotal = categorySpending.reduce((sum, item) => sum + item.amount, 0);'''
if new not in s:
    if old not in s:
        raise SystemExit('transactions category block anchor not found')
    s = s.replace(old, new, 1)

s = s.replace(
    '{balanceVisible ? formatCompactCurrency(item.amount) : "R$ ••••"}',
    '{balanceVisible ? `R$ ${formatCurrency(item.amount)}` : "R$ ••••"}',
    1,
)
p.write_text(s)

# Home
p = Path('src/routes/home.tsx')
s = p.read_text()

anchor = 'import { getCategoryIcon } from "@/lib/categories";\n'
replacement = anchor + 'import { addCurrencyCents, fetchAllCategoryLedgerTransactions, type CategoryLedgerTransaction } from "@/lib/category-spending-ledger";\n'
if replacement not in s:
    if anchor not in s:
        raise SystemExit('home import anchor not found')
    s = s.replace(anchor, replacement, 1)

anchor = '  const [transactions, setTransactions] = useState<Tx[]>([]);\n'
replacement = anchor + '  const [categoryLedgerTransactions, setCategoryLedgerTransactions] = useState<CategoryLedgerTransaction[]>([]);\n'
if replacement not in s:
    if anchor not in s:
        raise SystemExit('home state anchor not found')
    s = s.replace(anchor, replacement, 1)

old = '''        const [accountsRes, cardsRes, txRes, remindersRes] = await Promise.all([
          supabase
            .from("bank_accounts")
            .select("id,name,icon,color,balance,is_visible,parent_account_id")
            .eq("user_id", session.user.id),
          supabase
            .from("cards")
            .select("id,name,emoji,color,is_visible")
            .eq("user_id", session.user.id),
          supabase
            .from("transactions")
            .select("id,name,icon,category,date,amount,type,card,bank_account_id,is_visible,created_at")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("reminders")
            .select("id,title,icon,due_date,amount,type")
            .eq("user_id", session.user.id)
            .eq("is_completed", false)
            .order("due_date", { ascending: true })
            .limit(3),
        ]);'''
new = '''        const [accountsRes, cardsRes, txRes, remindersRes, exactCategoryLedger] = await Promise.all([
          supabase
            .from("bank_accounts")
            .select("id,name,icon,color,balance,is_visible,parent_account_id")
            .eq("user_id", session.user.id),
          supabase
            .from("cards")
            .select("id,name,emoji,color,is_visible")
            .eq("user_id", session.user.id),
          supabase
            .from("transactions")
            .select("id,name,icon,category,date,amount,type,card,bank_account_id,is_visible,created_at")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("reminders")
            .select("id,title,icon,due_date,amount,type")
            .eq("user_id", session.user.id)
            .eq("is_completed", false)
            .order("due_date", { ascending: true })
            .limit(3),
          fetchAllCategoryLedgerTransactions(session.user.id),
        ]);'''
if new not in s:
    if old not in s:
        raise SystemExit('home promise anchor not found')
    s = s.replace(old, new, 1)

old = '          setTransactions(rawTx);\n          setReminders((remindersRes.data || []) as Reminder[]);\n'
new = '          setTransactions(rawTx);\n          setCategoryLedgerTransactions(exactCategoryLedger);\n          setReminders((remindersRes.data || []) as Reminder[]);\n'
if new not in s:
    if old not in s:
        raise SystemExit('home set state anchor not found')
    s = s.replace(old, new, 1)

old = '''  const categorySpending = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const tx of selectedMonthTransactions) {
      if (tx.type !== "expense") continue;
      const rawCategory = (tx.category || "Sem categoria").trim();
      const mainCategory = rawCategory.split(" > ")[0]?.trim() || "Sem categoria";
      totals[mainCategory] = (totals[mainCategory] || 0) + Number(tx.amount || 0);
    }
    return Object.entries(totals)
      .map(([category, amount]) => ({ category, amount }))
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [selectedMonthTransactions]);'''
new = '''  const categorySpending = useMemo(() => {
    const totalsInCents: Record<string, number> = {};
    for (const tx of categoryLedgerTransactions) {
      if (tx.type !== "expense" || tx.is_visible === false) continue;
      const d = safeDate(tx.date, tx.created_at);
      if (!d || d.getFullYear() !== selectedMonth.getFullYear() || d.getMonth() !== selectedMonth.getMonth()) continue;
      const rawCategory = (tx.category || "Sem categoria").trim();
      const mainCategory = rawCategory.split(" > ")[0]?.trim() || "Sem categoria";
      totalsInCents[mainCategory] = addCurrencyCents(totalsInCents[mainCategory] || 0, tx.amount);
    }
    return Object.entries(totalsInCents)
      .map(([category, amountInCents]) => ({ category, amount: amountInCents / 100 }))
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [categoryLedgerTransactions, selectedMonth]);'''
if new not in s:
    if old not in s:
        raise SystemExit('home category block anchor not found')
    s = s.replace(old, new, 1)

s = s.replace(
    '{balanceVisible ? fmtCompact(item.amount) : "R$ ••••"}',
    '{balanceVisible ? `R$ ${fmt(item.amount)}` : "R$ ••••"}',
    1,
)
p.write_text(s)
