import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Landmark,
  LogOut,
  Plus,
} from "lucide-react";
import { SmartLink as Link } from "@/components/SmartLink";
import { BankLogo } from "@/components/BankLogo";
import { CardIcon } from "@/components/CardIcon";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { cn } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/categories";
import { addCurrencyCents, fetchAllCategoryLedgerTransactions, type CategoryLedgerTransaction } from "@/lib/category-spending-ledger";

type Account = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  balance: number;
  is_visible: boolean | null;
  parent_account_id: string | null;
};

type Card = {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  is_visible: boolean | null;
};

type Tx = {
  id: string;
  name: string;
  icon: string | null;
  category: string | null;
  date: string | null;
  amount: number;
  type: "income" | "expense";
  card: string | null;
  bank_account_id: string | null;
  is_visible: boolean | null;
  created_at: string | null;
};

type Reminder = {
  id: string;
  title: string | null;
  icon: string | null;
  due_date: string | null;
  amount: number | null;
  type: string | null;
};

function fmt(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtCompact(value: number) {
  const amount = Number(value || 0);
  if (Math.abs(amount) < 1000) return `R$ ${fmt(amount)}`;
  const compact = new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount).replace(/\s*mil/i, " mil");
  return `R$ ${compact}`;
}

function safeDate(value: string | null, refIso?: string | null) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  const refYear = refIso ? new Date(refIso).getFullYear() : new Date().getFullYear();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));

  const parts = trimmed.split(/\s+/);
  const months: Record<string, number> = {
    jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
    jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
  };
  if (parts.length >= 2 && months[parts[1]] !== undefined) {
    const year = parts[2] ? Number(parts[2]) : refYear;
    return new Date(year, months[parts[1]], Number(parts[0]));
  }
  return null;
}

function formatDisplayDate(value: string | null, refIso?: string | null) {
  const parsed = safeDate(value, refIso);
  if (!parsed) return value || "";
  const dd = String(parsed.getDate()).padStart(2, "0");
  const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  return `${dd} ${months[parsed.getMonth()]}`;
}

function RecoveredHome() {
  const { balanceVisible, updateBalanceVisible } = useUserPreferences();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [categoryLedgerTransactions, setCategoryLedgerTransactions] = useState<CategoryLedgerTransaction[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;
        setUserEmail(session.user.email || null);

        const [accountsRes, cardsRes, txRes, remindersRes, exactCategoryLedger] = await Promise.all([
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
        ]);

        if (accountsRes.error) throw accountsRes.error;
        if (cardsRes.error) throw cardsRes.error;
        if (txRes.error) throw txRes.error;
        if (remindersRes.error) throw remindersRes.error;

        const rawAccounts = (accountsRes.data || []) as Account[];
        const rawTx = (txRes.data || []) as Tx[];

        if (!cancelled) {
          // Keep the opening balance untouched. Monthly balances are derived below
          // from the selected month so Home can navigate historically.
          setAccounts(rawAccounts);
          setCards((cardsRes.data || []) as Card[]);
          setTransactions(rawTx);
          setCategoryLedgerTransactions(exactCategoryLedger);
          setReminders((remindersRes.data || []) as Reminder[]);
        }
      } catch (error) {
        console.error("Erro ao carregar Home restaurada:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedMonthKey = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}`;
  const selectedMonthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(selectedMonth)
    .replace(/^./, (c) => c.toUpperCase());
  const now = new Date();
  const isCurrentSelectedMonth = now.getFullYear() === selectedMonth.getFullYear() && now.getMonth() === selectedMonth.getMonth();
  const isFutureSelectedMonth = selectedMonth.getFullYear() > now.getFullYear() ||
    (selectedMonth.getFullYear() === now.getFullYear() && selectedMonth.getMonth() > now.getMonth());
  const selectedCutoff = useMemo(() => {
    if (isCurrentSelectedMonth) {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return today;
    }
    return new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0, 23, 59, 59, 999);
  }, [selectedMonth, isCurrentSelectedMonth]);

  const shiftSelectedMonth = (delta: number) => {
    setSelectedMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const displayAccounts = useMemo(() => {
    const incomeByAccount: Record<string, number> = {};
    const expenseByAccount: Record<string, number> = {};

    for (const tx of transactions) {
      if (tx.is_visible === false || !tx.bank_account_id) continue;
      if (tx.type === "expense" && tx.card) continue;
      const transactionDate = safeDate(tx.date, tx.created_at);
      if (transactionDate && transactionDate > selectedCutoff) continue;
      const amount = Number(tx.amount || 0);
      if (tx.type === "income") incomeByAccount[tx.bank_account_id] = (incomeByAccount[tx.bank_account_id] || 0) + amount;
      else expenseByAccount[tx.bank_account_id] = (expenseByAccount[tx.bank_account_id] || 0) + amount;
    }

    return accounts.map((account) => ({
      ...account,
      balance: Math.round((Number(account.balance || 0) + (incomeByAccount[account.id] || 0) - (expenseByAccount[account.id] || 0)) * 100) / 100,
    }));
  }, [accounts, transactions, selectedCutoff]);

  const visibleAccounts = useMemo(
    () => displayAccounts.filter((account) => account.is_visible !== false),
    [displayAccounts],
  );

  const mainAccounts = useMemo(
    () => visibleAccounts.filter((account) => !account.parent_account_id),
    [visibleAccounts],
  );

  const orphanSubaccounts = useMemo(
    () => visibleAccounts.filter((account) => account.parent_account_id && !mainAccounts.some((parent) => parent.id === account.parent_account_id)),
    [visibleAccounts, mainAccounts],
  );

  const accountTotal = useMemo(
    () => mainAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0),
    [mainAccounts],
  );

  const selectedMonthTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (tx.is_visible === false) return false;
      const d = safeDate(tx.date, tx.created_at);
      if (!d) return false;
      return d.getFullYear() === selectedMonth.getFullYear() && d.getMonth() === selectedMonth.getMonth();
    });
  }, [transactions, selectedMonth]);

  const monthly = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of selectedMonthTransactions) {
      if (tx.type === "income") income += Number(tx.amount || 0);
      else expense += Number(tx.amount || 0);
    }
    return { income, expense };
  }, [selectedMonthTransactions]);

  const categorySpending = useMemo(() => {
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
  }, [categoryLedgerTransactions, selectedMonth]);

  const recent = useMemo(() => {
    return [...selectedMonthTransactions]
      .filter((tx) => {
        const d = safeDate(tx.date, tx.created_at);
        return !isCurrentSelectedMonth || !d || d <= selectedCutoff;
      })
      .sort((a, b) => {
        const da = safeDate(a.date, a.created_at)?.getTime() ?? 0;
        const db = safeDate(b.date, b.created_at)?.getTime() ?? 0;
        if (db !== da) return db - da;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      })
      .slice(0, 8);
  }, [selectedMonthTransactions, isCurrentSelectedMonth, selectedCutoff]);

  const cardTotals = useMemo(() => {
    const result: Record<string, number> = {};
    for (const card of cards) result[card.name] = 0;
    for (const tx of selectedMonthTransactions) {
      if (!tx.card) continue;
      const amount = Number(tx.amount || 0);
      result[tx.card] = (result[tx.card] || 0) + (tx.type === "income" ? -amount : amount);
    }
    return result;
  }, [cards, selectedMonthTransactions]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="animate-page-enter flex flex-col gap-4 px-3 pt-4 pb-20">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col items-center">
          <div
            className="flex flex-col leading-none select-none rounded-xl border px-3 py-1.5 mb-1"
            style={{
              borderColor: "hsl(142 95% 55%)",
              boxShadow: "0 0 10px hsl(142 95% 55% / 0.9), 0 0 20px hsl(142 95% 55% / 0.6), inset 0 0 6px hsl(142 95% 55% / 0.35)",
            }}
          >
            <span className="text-xl font-extrabold tracking-tight text-primary dark:text-[hsl(142_95%_62%)]">
              cofre <span className="text-primary/80 dark:text-[hsl(142_95%_70%)]">360</span>
            </span>
            <span className="mt-0.5 text-[9px] font-medium tracking-wide text-primary/70 whitespace-nowrap">
              Seu dinheiro. Seu controle.
            </span>
          </div>
          {userEmail && <span className="max-w-[150px] truncate text-center text-[10px] text-muted-foreground">{userEmail}</span>}
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={handleLogout} className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card" aria-label="Sair">
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </button>
          <Link to="/reminders" className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card">
            <Bell className="h-4 w-4 text-muted-foreground" />
            {reminders.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-3.5 min-w-3.5 rounded-full bg-destructive px-1 text-center text-[8px] font-bold text-destructive-foreground">{reminders.length}</span>}
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"><ThemeToggle /></div>
          <button onClick={() => updateBalanceVisible(!balanceVisible)} className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card" aria-label="Alternar saldos">
            {balanceVisible ? <Eye className="h-4 w-4 text-muted-foreground" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
          </button>
          <Link to="/transactions" search={{ action: "add" } as any} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label="Adicionar transação">
            <Plus className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <section className="sticky top-0 z-30 -mx-1 flex items-center justify-between rounded-2xl border border-border/50 bg-card/95 px-2 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <button
          type="button"
          onClick={() => shiftSelectedMonth(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent"
          aria-label="Mês anterior"
          title="Mês anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-base font-bold text-foreground">{selectedMonthLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => shiftSelectedMonth(1)}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent"
          aria-label="Próximo mês"
          title="Próximo mês"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </section>

      <section className="rounded-2xl border border-border/40 bg-gradient-to-br from-primary/15 via-card to-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase text-foreground"><Landmark className="h-4 w-4 text-primary" />CONTAS</h2>
          <span className="text-lg font-bold tabular-nums text-foreground">{balanceVisible ? `R$ ${fmt(accountTotal)}` : "R$ ••••"}</span>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          {mainAccounts.map((account) => {
            const subaccounts = visibleAccounts.filter((item) => item.parent_account_id === account.id);
            return (
              <div key={account.id} className="flex flex-col gap-1">
                <Link to="/transactions" search={{ accountId: account.id, month: selectedMonthKey } as any} className="flex items-center gap-2.5 rounded-xl bg-background/40 px-2.5 py-2">
                  <BankLogo icon={account.icon} color={account.color} name={account.name} size="sm" />
                  <span className="min-w-0 flex-1 text-xs font-medium text-foreground">{account.name}</span>
                  <span className={cn("text-xs font-bold tabular-nums", account.balance < 0 && "text-destructive")}>{balanceVisible ? `R$ ${fmt(account.balance)}` : "R$ ••••"}</span>
                </Link>
                {subaccounts.map((subaccount) => (
                  <Link
                    key={subaccount.id}
                    to="/transactions"
                    search={{ accountId: subaccount.id, month: selectedMonthKey } as any}
                    className="ml-5 flex items-center gap-2.5 rounded-xl border-l-2 border-primary/20 bg-primary/[0.025] px-2.5 py-2 sm:ml-8"
                  >
                    <BankLogo icon={subaccount.icon} color={subaccount.color} name={subaccount.name} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{subaccount.name}</span>
                    <span className={cn("text-xs font-bold tabular-nums", subaccount.balance < 0 && "text-destructive")}>{balanceVisible ? `R$ ${fmt(subaccount.balance)}` : "R$ ••••"}</span>
                  </Link>
                ))}
              </div>
            );
          })}
          {orphanSubaccounts.map((subaccount) => (
            <Link
              key={subaccount.id}
              to="/transactions"
              search={{ accountId: subaccount.id, month: selectedMonthKey } as any}
              className="ml-5 flex items-center gap-2.5 rounded-xl border-l-2 border-primary/20 bg-primary/[0.025] px-2.5 py-2 sm:ml-8"
            >
              <BankLogo icon={subaccount.icon} color={subaccount.color} name={subaccount.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{subaccount.name}</span>
              <span className={cn("text-xs font-bold tabular-nums", subaccount.balance < 0 && "text-destructive")}>{balanceVisible ? `R$ ${fmt(subaccount.balance)}` : "R$ ••••"}</span>
            </Link>
          ))}
          {!loading && visibleAccounts.length === 0 && <p className="py-5 text-center text-xs text-muted-foreground">Nenhuma conta visível.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-border/40 bg-gradient-to-br from-primary/15 via-card to-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase text-foreground"><CreditCard className="h-4 w-4 text-primary" />CARTÕES</h2>
          <Link to="/cards" className="text-[10px] font-semibold text-primary">Ver todos</Link>
        </div>
        <div className="flex flex-col gap-1">
          {cards.filter((card) => card.is_visible !== false).map((card) => (
            <Link key={card.id} to="/cards" className="flex items-center gap-2.5 rounded-xl bg-background/40 px-2.5 py-2">
              <CardIcon color={card.color || ""} name={card.name} size="sm" />
              <span className="min-w-0 flex-1 text-xs font-medium text-foreground">{card.name}</span>
              <span className="text-xs font-bold tabular-nums text-foreground">{balanceVisible ? `R$ ${fmt(cardTotals[card.name] || 0)}` : "R$ ••••"}</span>
            </Link>
          ))}
          {!loading && cards.length === 0 && <p className="py-5 text-center text-xs text-muted-foreground">Você ainda não tem cartões cadastrados.</p>}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border/30 bg-card p-3">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground"><ArrowUpRight className="h-3.5 w-3.5 text-primary" />Receitas</div>
          <p className="mt-1 text-base font-bold text-primary">{balanceVisible ? `R$ ${fmt(monthly.income)}` : "R$ ••••"}</p>
        </div>
        <div className="rounded-xl border border-border/30 bg-card p-3">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground"><ArrowDownRight className="h-3.5 w-3.5 text-destructive" />Despesas</div>
          <p className="mt-1 text-base font-bold text-destructive">{balanceVisible ? `R$ ${fmt(monthly.expense)}` : "R$ ••••"}</p>
        </div>
      </section>

      {categorySpending.length > 0 && (
        <section className="rounded-2xl border border-border/30 bg-card p-3">
          <div className="grid grid-cols-4 gap-2">
            {categorySpending.slice(0, 4).map((item) => (
              <Link
                key={item.category}
                to="/transactions"
                search={{ month: selectedMonthKey, category: item.category } as any}
                aria-label={`${item.category}: R$ ${fmt(item.amount)}`}
                className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition-colors hover:bg-accent/60"
              >
                <span className="text-2xl leading-none" aria-hidden="true">{getCategoryIcon(item.category)}</span>
                <span className="max-w-full truncate text-[11px] font-bold tabular-nums text-foreground">
                  {balanceVisible ? `R$ ${fmt(item.amount)}` : "R$ ••••"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><ArrowLeftRight className="h-4 w-4 text-primary" />Transações · {selectedMonthLabel.split(" ")[0]}</h2>
          <Link to="/transactions" search={{ month: selectedMonthKey } as any} className="text-[10px] font-semibold text-primary">Ver todas</Link>
        </div>
        <div className="flex flex-col gap-1.5">
          {recent.map((tx) => (
            <Link key={tx.id} to="/transactions" search={{ month: selectedMonthKey, editId: tx.id, from: "home" } as any} className="flex items-center gap-3 rounded-xl border border-border/20 bg-card px-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-base">{tx.icon || (tx.type === "income" ? "💰" : "💸")}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{tx.name || "Transação"}</p>
                <p className="truncate text-[10px] text-muted-foreground">{tx.category || "Sem categoria"} · {formatDisplayDate(tx.date, tx.created_at)}</p>
              </div>
              <span className={cn("text-sm font-semibold tabular-nums", tx.type === "income" ? "text-primary" : "text-destructive")}>{tx.type === "income" ? "+" : "-"} R$ {fmt(tx.amount)}</span>
            </Link>
          ))}
          {!loading && recent.length === 0 && <p className="rounded-xl border border-dashed border-border/40 py-6 text-center text-xs text-muted-foreground">Nenhuma transação recente.</p>}
        </div>
      </section>

      {reminders.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Bell className="h-4 w-4 text-primary" />Próximos lembretes</h2>
            <Link to="/reminders" className="text-[10px] font-semibold text-primary">Ver todos</Link>
          </div>
          <div className="flex flex-col gap-1.5">
            {reminders.map((reminder) => (
              <Link key={reminder.id} to="/reminders" className="flex items-center gap-3 rounded-xl border border-border/20 bg-card px-3 py-2.5">
                <span className="text-lg">{reminder.icon || "🔔"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{reminder.title || "Lembrete"}</p>
                  <p className="text-[10px] text-muted-foreground">{reminder.due_date || ""}</p>
                </div>
                {reminder.amount != null && <span className="text-sm font-semibold tabular-nums text-foreground">R$ {fmt(Number(reminder.amount))}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export const Route = createFileRoute("/home")({
  component: RecoveredHome,
});
