import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  CreditCard,
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

function safeDate(value: string | null) {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const parts = value.trim().toLowerCase().split(/\s+/);
  const months: Record<string, number> = {
    jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
    jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
  };
  if (parts.length >= 2 && months[parts[1]] !== undefined) {
    return new Date(new Date().getFullYear(), months[parts[1]], Number(parts[0]));
  }
  return null;
}

function RecoveredHome() {
  const { balanceVisible, updateBalanceVisible } = useUserPreferences();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;
        setUserEmail(session.user.email || null);

        const [accountsRes, cardsRes, txRes, remindersRes] = await Promise.all([
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
        ]);

        if (accountsRes.error) throw accountsRes.error;
        if (cardsRes.error) throw cardsRes.error;
        if (txRes.error) throw txRes.error;
        if (remindersRes.error) throw remindersRes.error;

        const rawAccounts = (accountsRes.data || []) as Account[];
        const rawTx = (txRes.data || []) as Tx[];
        const incomeByAccount: Record<string, number> = {};
        const expenseByAccount: Record<string, number> = {};

        for (const tx of rawTx) {
          if (tx.is_visible === false || !tx.bank_account_id) continue;
          if (tx.type === "expense" && tx.card) continue;
          const amount = Number(tx.amount || 0);
          if (tx.type === "income") incomeByAccount[tx.bank_account_id] = (incomeByAccount[tx.bank_account_id] || 0) + amount;
          else expenseByAccount[tx.bank_account_id] = (expenseByAccount[tx.bank_account_id] || 0) + amount;
        }

        const calculated = rawAccounts.map((account) => ({
          ...account,
          balance: Math.round((Number(account.balance || 0) + (incomeByAccount[account.id] || 0) - (expenseByAccount[account.id] || 0)) * 100) / 100,
        }));

        if (!cancelled) {
          setAccounts(calculated);
          setCards((cardsRes.data || []) as Card[]);
          setTransactions(rawTx);
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

  const visibleAccounts = useMemo(
    () => accounts.filter((account) => account.is_visible !== false),
    [accounts],
  );

  const mainAccounts = useMemo(
    () => visibleAccounts.filter((account) => !account.parent_account_id),
    [visibleAccounts],
  );

  const accountTotal = useMemo(
    () => mainAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0),
    [mainAccounts],
  );

  const monthly = useMemo(() => {
    const now = new Date();
    let income = 0;
    let expense = 0;
    for (const tx of transactions) {
      if (tx.is_visible === false) continue;
      const d = safeDate(tx.date);
      if (!d || d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
      if (tx.type === "income") income += Number(tx.amount || 0);
      else expense += Number(tx.amount || 0);
    }
    return { income, expense };
  }, [transactions]);

  const recent = useMemo(
    () => transactions.filter((tx) => tx.is_visible !== false).slice(0, 8),
    [transactions],
  );

  const cardTotals = useMemo(() => {
    const result: Record<string, number> = {};
    for (const card of cards) result[card.name] = 0;
    for (const tx of transactions) {
      if (tx.is_visible === false || !tx.card) continue;
      const amount = Number(tx.amount || 0);
      result[tx.card] = (result[tx.card] || 0) + (tx.type === "income" ? -amount : amount);
    }
    return result;
  }, [cards, transactions]);

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

      <section className="rounded-2xl border border-border/40 bg-gradient-to-br from-primary/15 via-card to-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase text-foreground"><Landmark className="h-4 w-4 text-primary" />CONTAS</h2>
          <span className="text-lg font-bold tabular-nums text-foreground">{balanceVisible ? `R$ ${fmt(accountTotal)}` : "R$ ••••"}</span>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          {visibleAccounts.map((account) => (
            <Link key={account.id} to="/transactions" search={{ accountId: account.id } as any} className="flex items-center gap-2.5 rounded-xl bg-background/40 px-2.5 py-2">
              <BankLogo icon={account.icon} color={account.color} name={account.name} size="sm" />
              <span className="min-w-0 flex-1 text-xs font-medium text-foreground">{account.name}</span>
              <span className={cn("text-xs font-bold tabular-nums", account.balance < 0 && "text-destructive")}>{balanceVisible ? `R$ ${fmt(account.balance)}` : "R$ ••••"}</span>
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
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground"><ArrowUpRight className="h-3.5 w-3.5 text-primary" />Receitas do mês</div>
          <p className="mt-1 text-base font-bold text-primary">{balanceVisible ? `R$ ${fmt(monthly.income)}` : "R$ ••••"}</p>
        </div>
        <div className="rounded-xl border border-border/30 bg-card p-3">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground"><ArrowDownRight className="h-3.5 w-3.5 text-destructive" />Despesas do mês</div>
          <p className="mt-1 text-base font-bold text-destructive">{balanceVisible ? `R$ ${fmt(monthly.expense)}` : "R$ ••••"}</p>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><ArrowLeftRight className="h-4 w-4 text-primary" />Transações recentes</h2>
          <Link to="/transactions" className="text-[10px] font-semibold text-primary">Ver todas</Link>
        </div>
        <div className="flex flex-col gap-1.5">
          {recent.map((tx) => (
            <Link key={tx.id} to="/transactions" className="flex items-center gap-3 rounded-xl border border-border/20 bg-card px-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-base">{tx.icon || (tx.type === "income" ? "💰" : "💸")}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{tx.name || "Transação"}</p>
                <p className="truncate text-[10px] text-muted-foreground">{tx.category || "Sem categoria"} · {tx.date || ""}</p>
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
