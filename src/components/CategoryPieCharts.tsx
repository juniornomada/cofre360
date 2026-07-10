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
  "hsl(217, 91%, 60%)",  // blue
  "hsl(280, 67%, 55%)",  // purple
  "hsl(47, 96%, 53%)",   // yellow
  "hsl(12, 76%, 61%)",   // coral/orange
  "hsl(340, 82%, 52%)",  // pink
  "hsl(186, 72%, 48%)",  // teal
  "hsl(24, 95%, 53%)",   // amber
  "hsl(250, 60%, 60%)",  // indigo
  "hsl(0, 72%, 51%)",    // red
  "hsl(198, 80%, 50%)",  // sky blue
];

function aggregateByCategory(txs: Transaction[]) {
  const map = new Map<string, number>();
  let total = 0;
  txs.forEach((tx) => {
    const val = Number(tx.amount);
    // Aggregate by group name for clearer high-level charts
    const { group } = parseCategoryValue(tx.category);
    map.set(group, (map.get(group) || 0) + val);
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
  const expenseData = useMemo(
    () => aggregateByCategory(transactions.filter((t) => t.type === "expense")),
    [transactions]
  );
  const incomeData = useMemo(
    () => aggregateByCategory(transactions.filter((t) => t.type === "income")),
    [transactions]
  );

  if (expenseData.length === 0 && incomeData.length === 0) return null;

  const handleSliceClick = (name: string) => {
    if (!onCategoryClick) return;
    // Toggle: se já filtrado por essa categoria, volta para "Todas".
    if (activeCategory === name) onCategoryClick("Todas");
    else onCategoryClick(name);
  };

  const renderChart = (
    data: ReturnType<typeof aggregateByCategory>,
    title: string,
  ) => (
    <div className="rounded-xl bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="40%"
              innerRadius={30}
              outerRadius={55}
              paddingAngle={3}
              dataKey="value"
              animationBegin={0}
              animationDuration={600}
              onClick={(payload: { name?: string } | undefined) => {
                if (payload?.name) handleSliceClick(payload.name);
              }}
            >
              {data.map((item, i) => {
                const isDimmed = activeCategory && activeCategory !== "Todas" && activeCategory !== item.name;
                return (
                  <Cell
                    key={i}
                    fill={COLORS[i % COLORS.length]}
                    className={`outline-none ${onCategoryClick ? "cursor-pointer" : ""}`}
                    fillOpacity={isDimmed ? 0.35 : 1}
                    stroke={activeCategory === item.name ? "hsl(var(--foreground))" : "none"}
                    strokeWidth={activeCategory === item.name ? 2 : 0}
                  />
                );
              })}
            </Pie>
            <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="-mt-12 flex flex-wrap justify-center gap-1.5">
        {data.map((item, i) => {
          const isActive = activeCategory === item.name;
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => handleSliceClick(item.name)}
              disabled={!onCategoryClick}
              aria-pressed={isActive}
              aria-label={`Filtrar por categoria ${item.name}`}
              className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border transition-colors ${
                isActive
                  ? "bg-primary/20 border-primary/40 text-foreground"
                  : "bg-accent/20 border-border/10"
              } ${onCategoryClick ? "cursor-pointer hover:bg-accent/40" : "cursor-default"}`}
            >
              <div className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-muted-foreground truncate max-w-[60px]">{item.name}</span>
              <span className="font-bold text-foreground shrink-0">{item.percentage.toFixed(0)}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {expenseData.length > 0 && renderChart(expenseData, "Despesas por categoria")}
      {incomeData.length > 0 && renderChart(incomeData, "Receitas por categoria")}
    </div>
  );
}
