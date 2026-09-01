import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { parseCategoryValue } from "@/lib/categories";

interface Transaction {
  id: string;
  category: string;
  amount: number;
  type: "income" | "expense";
}

interface CategoryPieChartsProps {
  transactions: Transaction[];
  formatCurrency: (value: number) => string;
  onCategoryClick?: (categoryGroup: string) => void;
  activeCategory?: string;
}

const COLORS = [
  "hsl(210, 100%, 64%)", // vivid blue
  "hsl(275, 92%, 68%)",  // vivid purple
  "hsl(48, 100%, 60%)",  // vivid yellow
  "hsl(16, 100%, 63%)",  // vivid orange
  "hsl(337, 92%, 65%)",  // vivid pink
  "hsl(174, 88%, 52%)",  // vivid teal
  "hsl(31, 100%, 58%)",  // vivid amber
  "hsl(248, 94%, 70%)",  // vivid indigo
  "hsl(0, 94%, 64%)",    // vivid red
  "hsl(191, 96%, 58%)",  // vivid cyan
];

function aggregateByLevel(txs: Transaction[], level: "group" | "sub") {
  const map = new Map<string, number>();
  let total = 0;
  txs.forEach((tx) => {
    const val = Number(tx.amount);
    const parsed = parseCategoryValue(tx.category);
    const name = level === "sub" ? (parsed.sub || "Outros") : parsed.group;
    map.set(name, (map.get(name) || 0) + val);
    total += val;
  });
  return Array.from(map.entries())
    .map(([name, value]) => ({
      name,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0,
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

export function CategoryPieCharts({ transactions, formatCurrency, onCategoryClick, activeCategory }: CategoryPieChartsProps) {
  const isDrilldown = !!activeCategory && activeCategory !== "Todas";
  const level: "group" | "sub" = isDrilldown ? "sub" : "group";
  const expenseData = useMemo(
    () => aggregateByLevel(transactions.filter((t) => t.type === "expense"), level),
    [transactions, level],
  );
  const incomeData = useMemo(
    () => aggregateByLevel(transactions.filter((t) => t.type === "income"), level),
    [transactions, level],
  );

  const hasUsefulExpenseBreakdown = expenseData.length > 0;
  const hasUsefulIncomeBreakdown = incomeData.length > 0;
  if (!hasUsefulExpenseBreakdown && !hasUsefulIncomeBreakdown) return null;

  const handleSliceClick = (name: string) => {
    if (isDrilldown || !onCategoryClick) return;
    if (activeCategory === name) onCategoryClick("Todas");
    else onCategoryClick(name);
  };

  const renderChart = (
    data: ReturnType<typeof aggregateByLevel>,
    kind: "expense" | "income",
  ) => {
    const kindLabel = kind === "expense" ? "Despesas" : "Receitas";
    const title = isDrilldown ? (activeCategory || kindLabel) : `${kindLabel} por categoria`;
    const visibleLegendData = isDrilldown ? data : data.slice(0, 5);
    const hiddenCategoryCount = isDrilldown ? 0 : Math.max(0, data.length - visibleLegendData.length);

    return (
      <div className="flex h-[164px] min-w-0 flex-col rounded-xl border border-border/20 bg-card p-2.5 sm:h-[176px] sm:p-3">
        <div className="flex h-5 shrink-0 items-center justify-between gap-2">
          <h3
            className="min-w-0 truncate whitespace-nowrap text-[11px] font-semibold leading-5 text-foreground sm:text-xs"
            title={title}
          >
            {title}
          </h3>
          {isDrilldown && (
            <span className="shrink-0 rounded-full bg-accent/50 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">
              {kindLabel}
            </span>
          )}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(72px,0.85fr)_minmax(92px,1.15fr)] items-center gap-1.5 sm:grid-cols-[minmax(90px,0.9fr)_minmax(118px,1.1fr)] sm:gap-2">
          <div className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden">
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
                    onClick={(payload: { name?: string } | undefined) => {
                      if (payload?.name) handleSliceClick(payload.name);
                    }}
                  >
                    {data.map((item, i) => {
                      const isDimmed = !isDrilldown && !!activeCategory && activeCategory !== "Todas" && activeCategory !== item.name;
                      const isActive = !isDrilldown && activeCategory === item.name;
                      return (
                        <Cell
                          key={i}
                          fill={COLORS[i % COLORS.length]}
                          className={`outline-none ${!isDrilldown && onCategoryClick ? "cursor-pointer" : ""}`}
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

          <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex flex-col gap-0.5 py-1">
              {visibleLegendData.map((item, i) => {
                const isActive = !isDrilldown && activeCategory === item.name;
                return (
                  <button
                    key={item.name}
                    type="button"
                    title={`${item.name}: ${item.percentage.toFixed(0)}%`}
                    onClick={() => handleSliceClick(item.name)}
                    disabled={isDrilldown || !onCategoryClick}
                    aria-pressed={isActive}
                    aria-label={isDrilldown ? `${item.name}: ${item.percentage.toFixed(0)}%` : `Filtrar por categoria ${item.name}`}
                    className={`flex w-full min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-[8px] transition-colors sm:text-[9px] ${
                      isActive
                        ? "bg-primary/15 text-foreground"
                        : "text-muted-foreground"
                    } ${!isDrilldown && onCategoryClick ? "cursor-pointer hover:bg-accent/40" : "cursor-default"}`}
                  >
                    <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="min-w-0 flex-1 truncate text-left">{item.name}</span>
                    <span className="shrink-0 font-bold tabular-nums text-foreground">{item.percentage.toFixed(0)}%</span>
                  </button>
                );
              })}
              {hiddenCategoryCount > 0 && (
                <div className="mt-0.5 flex items-center justify-end px-1 text-[8px] font-medium text-muted-foreground sm:text-[9px]">
                  +{hiddenCategoryCount} {hiddenCategoryCount === 1 ? "categoria" : "categorias"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const onlyExpense = hasUsefulExpenseBreakdown && !hasUsefulIncomeBreakdown;
  const onlyIncome = hasUsefulIncomeBreakdown && !hasUsefulExpenseBreakdown;

  return (
    <div className="grid grid-cols-2 items-stretch gap-2 sm:gap-4">
      {hasUsefulExpenseBreakdown && (
        <div className={onlyExpense ? "col-span-2 min-w-0" : "min-w-0"}>
          {renderChart(expenseData, "expense")}
        </div>
      )}
      {hasUsefulIncomeBreakdown && (
        <div className={onlyIncome ? "col-span-2 min-w-0" : "min-w-0"}>
          {renderChart(incomeData, "income")}
        </div>
      )}
    </div>
  );
}
