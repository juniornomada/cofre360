from pathlib import Path


def must_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing marker: {label}")
    return text.replace(old, new, 1)


# Charts: a confirmed refund is an expense abatement, never economic income.
path = Path("src/components/CategoryPieCharts.tsx")
text = path.read_text()
text = must_replace(
    text,
    "];\n\nfunction aggregateByLevel",
    '''];

const isRefundTransaction = (tx: Transaction) =>
  (tx.category || "").trim() === "Receita > Reembolso";

function aggregateRefunds(txs: Transaction[]) {
  const total = txs.reduce((sum, tx) => {
    const value = Number(tx.amount);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);
  if (total <= 0) return [];
  return [{ name: "Reembolso", value: total, percentage: 100 }];
}

function aggregateByLevel''',
    "refund helpers",
)
text = must_replace(
    text,
    '() => aggregateByLevel(transactions.filter((t) => t.type === "income"), level),',
    '() => aggregateByLevel(transactions.filter((t) => t.type === "income" && !isRefundTransaction(t)), level),',
    "exclude refunds from income chart",
)
text = must_replace(
    text,
    '''  const hasUsefulExpenseBreakdown = expenseData.length > 0;
  const hasUsefulIncomeBreakdown = incomeData.length > 0;
  if (!hasUsefulExpenseBreakdown && !hasUsefulIncomeBreakdown) return null;''',
    '''  const refundData = useMemo(
    () => aggregateRefunds(transactions.filter(isRefundTransaction)),
    [transactions],
  );

  const hasUsefulExpenseBreakdown = expenseData.length > 0;
  const hasUsefulIncomeBreakdown = incomeData.length > 0;
  const hasUsefulRefundBreakdown = refundData.length > 0;
  if (!hasUsefulExpenseBreakdown && !hasUsefulIncomeBreakdown && !hasUsefulRefundBreakdown) return null;''',
    "refund chart data",
)
text = must_replace(
    text,
    'kind: "expense" | "income",',
    'kind: "expense" | "income" | "refund",',
    "chart kind union",
)
text = must_replace(
    text,
    '''    const kindLabel = kind === "expense" ? "Despesas" : "Receitas";
    const title = isDrilldown ? (activeCategory || kindLabel) : `${kindLabel} por categoria`;''',
    '''    const kindLabel = kind === "expense" ? "Despesas" : kind === "income" ? "Receitas" : "Reembolsos";
    const title = kind === "refund"
      ? "Reembolsos · abatimento de despesas"
      : isDrilldown ? (activeCategory || kindLabel) : `${kindLabel} por categoria`;''',
    "refund chart title",
)
text = must_replace(
    text,
    '''  const onlyExpense = hasUsefulExpenseBreakdown && !hasUsefulIncomeBreakdown;
  const onlyIncome = hasUsefulIncomeBreakdown && !hasUsefulExpenseBreakdown;''',
    '''  const visibleChartCount = [hasUsefulExpenseBreakdown, hasUsefulIncomeBreakdown, hasUsefulRefundBreakdown].filter(Boolean).length;
  const singleChartClass = visibleChartCount === 1 ? "col-span-2 min-w-0" : "min-w-0";
  const refundChartClass = visibleChartCount === 1 || visibleChartCount === 3 ? "col-span-2 min-w-0" : "min-w-0";''',
    "chart layout vars",
)
text = must_replace(
    text,
    'className={onlyExpense ? "col-span-2 min-w-0" : "min-w-0"}',
    'className={singleChartClass}',
    "expense layout class",
)
text = must_replace(
    text,
    'className={onlyIncome ? "col-span-2 min-w-0" : "min-w-0"}',
    'className={singleChartClass}',
    "income layout class",
)
text = must_replace(
    text,
    '''        {hasUsefulIncomeBreakdown && (
          <div className={singleChartClass}>
            {renderChart(incomeData, "income")}
          </div>
        )}
      </div>''',
    '''        {hasUsefulIncomeBreakdown && (
          <div className={singleChartClass}>
            {renderChart(incomeData, "income")}
          </div>
        )}
        {hasUsefulRefundBreakdown && (
          <div className={refundChartClass}>
            {renderChart(refundData, "refund")}
          </div>
        )}
      </div>''',
    "render refund chart",
)
path.write_text(text)


# Transactions: when refunds exceed expenses, show a positive refund balance.
path = Path("src/routes/transactions.tsx")
text = path.read_text()
text = must_replace(
    text,
    '''          <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
            <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
            {isYieldView ? "Taxas" : "Despesas"}
          </div>
          <p className="mt-1 text-base font-bold text-destructive">
            {balanceVisible ? `R$ ${formatCurrency(totalExpense)}` : "R$ ••••"}
          </p>''',
    '''          <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
            <ArrowDownRight className={`h-3.5 w-3.5 ${!isYieldView && totalExpense < 0 ? "text-primary" : "text-destructive"}`} />
            {isYieldView ? "Taxas" : totalExpense < 0 ? "Saldo reembolsos" : "Despesas"}
          </div>
          <p className={`mt-1 text-base font-bold ${!isYieldView && totalExpense < 0 ? "text-primary" : "text-destructive"}`}>
            {balanceVisible
              ? (!isYieldView && totalExpense < 0
                  ? `+ R$ ${formatCurrency(Math.abs(totalExpense))}`
                  : `R$ ${formatCurrency(totalExpense)}`)
              : "R$ ••••"}
          </p>''',
    "transactions negative expense display",
)
path.write_text(text)


# Home uses the same semantic display.
path = Path("src/routes/home.tsx")
text = path.read_text()
text = must_replace(
    text,
    '''        <div className="rounded-xl border border-border/30 bg-card p-3">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground"><ArrowDownRight className="h-3.5 w-3.5 text-destructive" />Despesas</div>
          <p className="mt-1 text-base font-bold text-destructive">{balanceVisible ? `R$ ${fmt(monthly.expense)}` : "R$ ••••"}</p>
        </div>''',
    '''        <div className="rounded-xl border border-border/30 bg-card p-3">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
            <ArrowDownRight className={`h-3.5 w-3.5 ${monthly.expense < 0 ? "text-primary" : "text-destructive"}`} />
            {monthly.expense < 0 ? "Saldo reembolsos" : "Despesas"}
          </div>
          <p className={`mt-1 text-base font-bold ${monthly.expense < 0 ? "text-primary" : "text-destructive"}`}>
            {balanceVisible
              ? (monthly.expense < 0 ? `+ R$ ${fmt(Math.abs(monthly.expense))}` : `R$ ${fmt(monthly.expense)}`)
              : "R$ ••••"}
          </p>
        </div>''',
    "home negative expense display",
)
path.write_text(text)
