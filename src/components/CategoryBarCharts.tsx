import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { parseCategoryValue } from "@/lib/categories";

interface Transaction {
  id: string;
  category: string;
  amount: number;
  type: "income" | "expense";
}

interface CategoryBarChartsProps {
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

export function CategoryBarCharts({ transactions, formatCurrency }: CategoryBarChartsProps) {
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
          <h3 className="mb-4 text-sm font-semibold text-foreground">Despesas por categoria</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={expenseData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--muted-foreground))" opacity={0.1} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={80} 
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} 
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} cursor={{ fill: 'hsl(var(--accent))', opacity: 0.1 }} />
                <Bar 
                  dataKey="value" 
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                >
                  {expenseData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {incomeData.length > 0 && (
        <div className="rounded-xl bg-card p-4">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Receitas por categoria</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={incomeData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--muted-foreground))" opacity={0.1} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={80} 
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} 
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} cursor={{ fill: 'hsl(var(--accent))', opacity: 0.1 }} />
                <Bar 
                  dataKey="value" 
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                >
                  {incomeData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
