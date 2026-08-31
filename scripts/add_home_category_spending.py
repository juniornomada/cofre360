from pathlib import Path

p = Path("src/routes/home.tsx")
s = p.read_text()

old_fmt = '''function fmt(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
'''
new_fmt = '''function fmt(value: number) {
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
  }).format(amount).replace(/\\s*mil/i, " mil");
  return `R$ ${compact}`;
}
'''
if old_fmt not in s:
    raise SystemExit("fmt anchor not found")
s = s.replace(old_fmt, new_fmt, 1)

old_monthly = '''  const monthly = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of selectedMonthTransactions) {
      if (tx.type === "income") income += Number(tx.amount || 0);
      else expense += Number(tx.amount || 0);
    }
    return { income, expense };
  }, [selectedMonthTransactions]);
'''
new_monthly = '''  const monthly = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of selectedMonthTransactions) {
      if (tx.type === "income") income += Number(tx.amount || 0);
      else expense += Number(tx.amount || 0);
    }
    return { income, expense };
  }, [selectedMonthTransactions]);

  const categorySpending = useMemo(() => {
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
  }, [selectedMonthTransactions]);
'''
if old_monthly not in s:
    raise SystemExit("monthly anchor not found")
s = s.replace(old_monthly, new_monthly, 1)

anchor = '''      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><ArrowLeftRight className="h-4 w-4 text-primary" />Transações · {selectedMonthLabel.split(" ")[0]}</h2>
'''
insert = '''      <section className="rounded-2xl border border-border/30 bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase text-muted-foreground">Gastos por categoria · {selectedMonthLabel.split(" ")[0]}</h2>
          <span className="text-[10px] text-muted-foreground">{categorySpending.length} categorias</span>
        </div>
        {categorySpending.length > 0 ? (
          <div className="flex flex-col divide-y divide-border/20">
            {categorySpending.map((item) => {
              const share = monthly.expense > 0 ? Math.min(100, (item.amount / monthly.expense) * 100) : 0;
              return (
                <Link
                  key={item.category}
                  to="/transactions"
                  search={{ month: selectedMonthKey, category: item.category } as any}
                  className="flex items-center gap-3 py-2.5 first:pt-1 last:pb-1"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-xs font-medium text-foreground">{item.category}</span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">
                        {balanceVisible ? fmtCompact(item.amount) : "R$ ••••"}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-accent">
                      <div className="h-full rounded-full bg-destructive/70" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="py-3 text-center text-xs text-muted-foreground">Nenhuma despesa neste mês.</p>
        )}
      </section>

'''
if anchor not in s:
    raise SystemExit("transactions section anchor not found")
s = s.replace(anchor, insert + anchor, 1)

p.write_text(s)
