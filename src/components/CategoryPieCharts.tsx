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
      percentage: total > 0 ? (value / total) * 100 : 0
    }))
    .sort((a, b) => b.value - a.value);
}

const CustomTooltip = ({ active, payload, formatCurrency }: any) => {
  if (!active || !payload?.length) return null;
  const { name, value, percentage } = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-foreground">{name}</p>
      <div className="flex justify-between gap-4 mt-1">
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
    [transactions, level]
  );
  const incomeData = useMemo(
    () => aggregateByLevel(transactions.filter((t) => t.type === "income"), level),
    [transactions, level]
  );

  const hasUsefulExpenseBreakdown = expenseData.length > (isDrilldown ? 1 : 0);
  const hasUsefulIncomeBreakdown = incomeData.length > (isDrilldown ? 1 : 0);
  if (!hasUsefulExpenseBreakdown && !hasUsefulIncomeBreakdown) return null;

  const handleSliceClick = (name: string) => {
    if (isDrilldown || !onCategoryClick) return;
    if (activeCategory === name) onCategoryClick("Todas");
    else onCategoryClick(name);
  };

  const renderChart = (
    data: ReturnType<typeof aggregateByLevel>,
    title: string,
  ) => (
    <div className="min-w-0 rounded-xl bg-card p-2.5 sm:p-3">
      <h3 className="mb-1 truncate whitespace-nowrap text-[10px] font-semibold text-foreground sm:text-sm">{title}</h3>
      <div className="h-36 w-full sm:h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={26}
              outerRadius={50}
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
      <div className="mt-1 flex flex-wrap justify-center gap-1">
        {data.map((item, i) => {
          const isActive = !isDrilldown && activeCategory === item.name;
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => handleSliceClick(item.name)}
              disabled={isDrilldown || !onCategoryClick}
              aria-pressed={isActive}
              aria-label={isDrilldown ? `${item.name}: ${item.percentage.toFixed(0)}%` : `Filtrar por categoria ${item.name}`}
              className={`flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] transition-colors sm:text-[9px] ${
                isActive
                  ? "bg-primary/20 border-primary/40 text-foreground"
                  : "bg-accent/20 border-border/10"
              } ${!isDrilldown && onCategoryClick ? "cursor-pointer hover:bg-accent/40" : "cursor-default"}`}
            >
              <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="max-w-[64px] truncate text-muted-foreground sm:max-w-[88px]">{item.name}</span>
              <span className="shrink-0 font-bold tabular-nums text-foreground">{item.percentage.toFixed(0)}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const expenseTitle = isDrilldown ? "Despesas por subcategoria" : "Despesas por categoria";
  const incomeTitle = isDrilldown ? "Receitas por subcategoria" : "Receitas por categoria";

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-4">
      {hasUsefulExpenseBreakdown && renderChart(expenseData, expenseTitle)}
      {hasUsefulIncomeBreakdown && renderChart(incomeData, incomeTitle)}
    </div>
  );
}