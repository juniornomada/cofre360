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

export function CategoryPieCharts({ transactions, formatCurrency }: CategoryPieChartsProps) {
  const expenseData = useMemo(
    () => aggregateByCategory(transactions.filter((t) => t.type === "expense")),
    [transactions]
  );
  const incomeData = useMemo(
    () => aggregateByCategory(transactions.filter((t) => t.type === "income")),
    [transactions]
  );

  if (expenseData.length === 0 && incomeData.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {expenseData.length > 0 && (
        <div className="rounded-xl bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Despesas por categoria</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expenseData}
                  cx="50%"
                  cy="50%"
                  innerRadius={30}
                  outerRadius={55}
                  paddingAngle={3}
                  dataKey="value"
                  animationBegin={0}
                  animationDuration={600}
                >
                  {expenseData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} className="outline-none" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {expenseData.map((item, i) => (
              <div key={item.name} className="flex items-center gap-1.5 text-[10px] bg-accent/30 px-2 py-0.5 rounded-full">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-muted-foreground truncate max-w-[80px]">{item.name}</span>
                <span className="font-bold text-foreground shrink-0">{item.percentage.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {incomeData.length > 0 && (
        <div className="rounded-xl bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Receitas por categoria</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={incomeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={30}
                  outerRadius={55}
                  paddingAngle={3}
                  dataKey="value"
                  animationBegin={0}
                  animationDuration={600}
                >
                  {incomeData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} className="outline-none" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {incomeData.map((item, i) => (
              <div key={item.name} className="flex items-center gap-1.5 text-[10px] bg-accent/30 px-2 py-0.5 rounded-full">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-muted-foreground truncate max-w-[80px]">{item.name}</span>
                <span className="font-bold text-foreground shrink-0">{item.percentage.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
