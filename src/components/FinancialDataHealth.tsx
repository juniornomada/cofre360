import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, ShieldCheck, ChevronRight } from "lucide-react";
import { SmartLink as Link } from "@/components/SmartLink";
import { supabase } from "@/integrations/supabase/client";
import { useFinancialMonthFacts } from "@/hooks/use-financial-month-facts";
import { cn } from "@/lib/utils";

export function FinancialDataHealth({ monthKey }: { monthKey: string }) {
  const [openDivergences, setOpenDivergences] = useState<number | null>(null);
  const { data: facts, isError } = useFinancialMonthFacts(monthKey);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count, error } = await (supabase as any)
        .from("reconciliation_divergences")
        .select("id", { count: "exact", head: true })
        .neq("status", "resolved");
      if (!cancelled) setOpenDivergences(error ? null : Number(count || 0));
    })();
    return () => { cancelled = true; };
  }, []);

  const cardCheck = useMemo(() => {
    if (!facts) return null;
    const cardsTotal = facts.cards.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const delta = Math.round((cardsTotal - Number(facts.cardExpenseComponent || 0)) * 100) / 100;
    return { cardsTotal, delta, ok: Math.abs(delta) < 0.01 };
  }, [facts]);

  const hasProblem = (openDivergences ?? 0) > 0 || isError || cardCheck?.ok === false;

  return (
    <Link
      to="/reconciliation"
      search={{ tab: "dashboard" } as any}
      className={cn(
        "interactive-card flex items-center gap-3 rounded-2xl border px-3 py-2.5",
        hasProblem
          ? "border-warning/40 bg-warning/10"
          : "border-primary/20 bg-primary/[0.06]",
      )}
      aria-label="Abrir saúde dos dados e reconciliação"
    >
      <div className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
        hasProblem ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary",
      )}>
        {hasProblem ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-foreground">Saúde dos dados</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {hasProblem
            ? `${openDivergences ?? 0} divergência(s) em aberto${cardCheck?.ok === false ? " · cartões não fecham" : ""}`
            : "Contas, cartões e totais mensais consistentes"}
        </p>
      </div>
      {cardCheck?.ok && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
