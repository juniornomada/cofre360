import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { parseCategoryValue } from "@/lib/categories";
import { categoryPurchaseAmount, isCategoryPurchaseRow } from "@/lib/category-spending";

interface Transaction {
  id: string;
  category: string;
  amount: number;
  type: "income" | "expense";
  installment_group_id?: string | null;
  installment_number?: number | null;
  total_installments?: number | null;
  installment_source_amount?: number | string | null;
}

interface CategoryPieChartsProps {
  transactions: Transaction[];
  formatCurrency: (value: number) => string;
  onCategoryClick?: (categoryGroup: string) => void;
  activeCategory?: string;
  amountVisible?: boolean;
}

const COLORS = [
  "hsl(210, 100%, 64%)",
  "hsl(275, 92%, 68%)",
  "hsl(48, 100%, 60%)",
  "hsl(16, 100%, 63%)",
  "hsl(337, 92%, 65%)",
  "hsl(174, 88%, 52%)",
  "hsl(31, 100%, 58%)",
  "hsl(248, 94%, 70%)",
  "hsl(0, 94%, 64%)",
  "hsl(191, 96%, 58%)",
];

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

function aggregateByLevel(txs: Transaction[], level: "group" | "sub") {
  const map = new Map<string, number>();

  txs.forEach((tx) => {
    if (!isCategoryPurchaseRow(tx)) return;
    const val = categoryPurchaseAmount(tx);
    if (!Number.isFinite(val)) return;
    const parsed = parseCategoryValue(tx.category);
    const name = level === "sub" ? (parsed.sub || "Outros") : parsed.group;
    map.set(name, (map.get(name) || 0) + val);
  });

  const positiveEntries = Array.from(map.entries()).filter(([, value]) => value > 0);
  const rawTotal = positiveEntries.reduce((sum, [, value]) => sum + value, 0);
  if (rawTotal <= 0) return [];

  const visibleEntries = positiveEntries.filter(([, value]) =>
    Math.round((value / rawTotal) * 100) > 0
  );
  const visibleTotal = visibleEntries.reduce((sum, [, value]) => sum + value, 0);

  return visibleEntries
    .map(([name, value]) => ({
      name,
      value,
      percentage: visibleTotal > 0 ? (value / visibleTotal) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

const CustomTooltip = ({ active, payload, formatCurrency }: any) => {
  if (!active || !payload?.length) return null;
  const { name, value, percentage } = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-foreground">{name}</p>
      <div className="mt-1 flex justify-between gap-4">
        <span className="text-muted-foreground">R$ {formatCurrency(value)}</span>
        <span className="font-bold text-primary">{percentage.toFixed(1)}%</span>
      </div>
    </div>
  );
};

export function CategoryPieCharts({ transactions, formatCurrency, onCategoryClick, activeCategory, amountVisible = false }: CategoryPieChartsProps) {
  const isDrilldown = !!activeCategory && activeCategory !== "Todas";
  const expenseLevel: "group" | "sub" = isDrilldown ? "sub" : "group";

  const expenseData = useMemo(
    () => aggregateByLevel(transactions.filter((t) => t.type === "expense"), expenseLevel),
    [transactions, expenseLevel],
  );

  // Receitas quase sempre compartilham o grupo-raiz "Receita". Exibir o grupo
  // produziria um donut enganoso de 100%; por isso a visão padrão já usa a
  // subcategoria (Salário, Juros, Vale alimentação etc.).
  const incomeData = useMemo(
    () => aggregateByLevel(
      transactions.filter((t) => t.type === "income" && !isRefundTransaction(t)),
      "sub",
    ),
    [transactions],
  );

  const refundData = useMemo(
    () => aggregateRefunds(transactions.filter(isRefundTransaction)),
    [transactions],
  );

  const hasUsefulExpenseBreakdown = expenseData.length > 0;
  const hasUsefulIncomeBreakdown = incomeData.length > 0;
  const hasUsefulRefundBreakdown = refundData.length > 0;
  if (!hasUsefulExpenseBreakdown && !hasUsefulIncomeBreakdown && !hasUsefulRefundBreakdown) return null;

  const handleSliceClick = (name: string) => {
    if (isDrilldown || !onCategoryClick) return;
    if (activeCategory === name) onCategoryClick("Todas");
    else onCategoryClick(name);
  };

  const renderBars = (data: ReturnType<typeof aggregateByLevel>) => {
    const max = Math.max(...data.map((item) => item.value), 1);
    const title = isDrilldown ? (activeCategory || "Despesas") : "Despesas por categoria";
    return (
      <div className="flex h-full min-h-[164px] min-w-0 flex-col rounded-xl border border-border/20 bg-card p-3">
        <h3 className="text-[12px] font-semibold text-foreground">{title}</h3>
        <div className="mt-2 flex flex-col gap-1.5">
          {data.map((item, i) => {
            const isActive = !isDrilldown && activeCategory === item.name;
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => handleSliceClick(item.name)}
                disabled={isDrilldown || !onCategoryClick}
                aria-pressed={isActive}
                className={`group rounded-lg px-1.5 py-1 text-left transition-colors ${isActive ? "bg-primary/10" : "hover:bg-accent/30"}`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate font-medium text-foreground">{item.name}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {amountVisible ? `R$ ${formatCurrency(item.value)} · ` : ""}{item.percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/70">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${Math.max(3, (item.value / max) * 100)}%`, backgroundColor: COLORS[i % COLORS.length] }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSingleCategoryCard = (
    item: ReturnType<typeof aggregateByLevel>[number],
    kind: "income" | "refund",
  ) => {
    const title = kind === "income" ? "Receitas por categoria" : "Reembolsos · abatimento de despesas";
    return (
      <div className="flex h-full min-h-[116px] min-w-0 flex-col justify-between rounded-xl border border-border/20 bg-card p-3">
        <h3 className="truncate text-[12px] font-semibold text-foreground" title={title}>{title}</h3>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-muted/25 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS[0] }} />
            <span className="truncate text-[11px] font-medium text-foreground">{item.name}</span>
          </div>
          <span className="shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground">
            {amountVisible ? `R$ ${formatCurrency(item.value)}` : "100%"}
          </span>
        </div>
      </div>
    );
  };

  const renderDonut = (
    data: ReturnType<typeof aggregateByLevel>,
    kind: "expense" | "income" | "refund",
  ) => {
    const kindLabel = kind === "expense" ? "Despesas" : kind === "income" ? "Receitas" : "Reembolsos";
    const title = kind === "refund"
      ? "Reembolsos · abatimento de despesas"
      : kind === "income"
        ? "Receitas por categoria"
        : isDrilldown ? (activeCategory || kindLabel) : `${kindLabel} por categoria`;
    const isInteractive = kind === "expense" && !isDrilldown && !!onCategoryClick;

    return (
      <div className="flex h-full min-h-[164px] min-w-0 flex-col rounded-xl border border-border/20 bg-card p-2.5 sm:min-h-[176px] sm:p-3">
        <div className="flex h-5 shrink-0 items-center justify-between gap-2">
          <h3 className="min-w-0 truncate whitespace-nowrap text-[12px] font-semibold leading-5 text-foreground" title={title}>{title}</h3>
          {kind === "expense" && isDrilldown && (
            <span className="shrink-0 rounded-full bg-accent/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {kindLabel}
            </span>
          )}
        </div>

        <div className="mt-1 grid min-w-0 flex-1 grid-cols-[minmax(70px,0.82fr)_minmax(96px,1.18fr)] items-center gap-1.5 sm:grid-cols-[minmax(90px,0.9fr)_minmax(118px,1.1fr)] sm:gap-2">
          <div className="flex min-w-0 items-center justify-center overflow-hidden">
            <div className="h-[92px] w-full sm:h-[104px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={20}
                    outerRadius={38}
                    paddingAngle={3}
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={600}
                    onClick={isInteractive ? ((payload: { name?: string } | undefined) => payload?.name && handleSliceClick(payload.name)) : undefined}
                  >
                    {data.map((item, i) => {
                      const isDimmed = kind === "expense" && !isDrilldown && !!activeCategory && activeCategory !== "Todas" && activeCategory !== item.name;
                      const isActive = kind === "expense" && !isDrilldown && activeCategory === item.name;
                      return (
                        <Cell
                          key={i}
                          fill={COLORS[i % COLORS.length]}
                          className={`outline-none ${isInteractive ? "cursor-pointer" : ""}`}
                          fillOpacity={isDimmed ? 0.35 : 1}
                          stroke={isActive ? "hsl(var(--foreground))" : "none"}
                          strokeWidth={isActive ? 2 : 0}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="min-w-0 py-1">
            <div className="flex flex-col gap-0.5">
              {data.map((item, i) => {
                const isActive = kind === "expense" && !isDrilldown && activeCategory === item.name;
                return (
                  <button
                    key={item.name}
                    type="button"
                    title={`${item.name}: ${item.percentage.toFixed(0)}%`}
                    onClick={isInteractive ? (() => handleSliceClick(item.name)) : undefined}
                    disabled={!isInteractive}
                    aria-pressed={isActive}
                    className={`flex w-full min-w-0 items-start gap-1 rounded-md px-1 py-0.5 text-[10px] transition-colors ${isActive ? "bg-primary/15 text-foreground" : "text-muted-foreground"}`}
                  >
                    <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="flex min-w-0 items-center gap-1 whitespace-nowrap">
                        <span className="min-w-0 truncate">{item.name}</span>
                        <span className="shrink-0 font-bold tabular-nums text-foreground">{item.percentage.toFixed(0)}%</span>
                      </span>
                      {amountVisible && (
                        <span className="block truncate text-[9px] tabular-nums text-muted-foreground">R$ {formatCurrency(item.value)}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const visibleChartCount = [hasUsefulExpenseBreakdown, hasUsefulIncomeBreakdown, hasUsefulRefundBreakdown].filter(Boolean).length;
  const singleChartClass = visibleChartCount === 1 ? "col-span-2 min-w-0" : "min-w-0";
  const refundChartClass = visibleChartCount === 1 || visibleChartCount === 3 ? "col-span-2 min-w-0" : "min-w-0";

  return (
    <>
      <style>{`
        div:has(> .category-summary-donuts) { margin-bottom: 0.5rem !important; }
        div:has(> .category-summary-donuts) + section { display: none !important; }
      `}</style>
      <div className="category-summary-donuts grid grid-cols-2 items-stretch gap-2 sm:gap-4">
        {hasUsefulExpenseBreakdown && (
          <div className={singleChartClass}>
            {expenseData.length >= 4 ? renderBars(expenseData) : renderDonut(expenseData, "expense")}
          </div>
        )}
        {hasUsefulIncomeBreakdown && (
          <div className={singleChartClass}>
            {incomeData.length === 1 ? renderSingleCategoryCard(incomeData[0], "income") : renderDonut(incomeData, "income")}
          </div>
        )}
        {hasUsefulRefundBreakdown && (
          <div className={refundChartClass}>
            {refundData.length === 1 ? renderSingleCategoryCard(refundData[0], "refund") : renderDonut(refundData, "refund")}
          </div>
        )}
      </div>
    </>
  );
}
