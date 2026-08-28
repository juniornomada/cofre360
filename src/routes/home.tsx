import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeftRight, CreditCard, Landmark, Sparkles, TrendingUp } from "lucide-react";
import { SmartLink as Link } from "@/components/SmartLink";
import { supabase } from "@/integrations/supabase/client";

function SafeHome() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;

        const [{ data: accounts, error: accountsError }, { data: txs, error: txError }] = await Promise.all([
          supabase
            .from("bank_accounts")
            .select("id,balance,is_visible,parent_account_id")
            .eq("user_id", session.user.id),
          supabase
            .from("transactions")
            .select("bank_account_id,amount,type,card,is_visible")
            .eq("user_id", session.user.id),
        ]);

        if (accountsError) throw accountsError;
        if (txError) throw txError;

        const visibleAccounts = (accounts || []).filter((account: any) => account.is_visible !== false);
        const balances: Record<string, number> = {};

        for (const account of visibleAccounts as any[]) {
          balances[account.id] = Number(account.balance || 0);
        }

        for (const tx of (txs || []) as any[]) {
          if (tx.is_visible === false || !tx.bank_account_id || !(tx.bank_account_id in balances)) continue;
          if (tx.type === "expense" && tx.card) continue;

          const amount = Number(tx.amount || 0);
          balances[tx.bank_account_id] += tx.type === "income" ? amount : -amount;
        }

        if (!cancelled) {
          setBalance(Object.values(balances).reduce((sum, value) => sum + value, 0));
        }
      } catch (error) {
        console.error("Erro ao carregar Home segura:", error);
        if (!cancelled) setBalance(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const shortcuts = [
    { to: "/transactions" as const, label: "Transações", icon: ArrowLeftRight },
    { to: "/accounts" as const, label: "Contas", icon: Landmark },
    { to: "/cards" as const, label: "Cartões", icon: CreditCard },
    { to: "/invest" as const, label: "Invest", icon: TrendingUp },
    { to: "/insights" as const, label: "Insights IA", icon: Sparkles },
  ];

  return (
    <main className="flex flex-col gap-5 px-4 pt-6 pb-24">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saldo total</p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
          {loading
            ? "Carregando..."
            : balance === null
              ? "R$ —"
              : `R$ ${balance.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </p>
      </section>

      <section>
        <h1 className="mb-3 text-sm font-semibold text-foreground">Acesso rápido</h1>
        <div className="grid grid-cols-2 gap-3">
          {shortcuts.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              <Icon className="h-5 w-5 text-primary" />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

export const Route = createFileRoute("/home")({
  component: SafeHome,
});
