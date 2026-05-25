import { createFileRoute } from "@tanstack/react-router";
import { SmartLink as Link } from "@/components/SmartLink";
import { useState, useEffect, useCallback, useMemo } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, Lightbulb, ArrowRight, Sparkles, Loader2 } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { parseCategoryValue, categoryTree } from "@/lib/categories";
import { lazy, Suspense } from "react";

const FinancialChat = lazy(() => import("@/components/FinancialChat").then(m => ({ default: m.FinancialChat })));


interface Transaction {
  id: string;
  name: string;
  category: string;
  date: string;
  amount: number;
  type: string;
  icon: string;
}

const shortMonthMap: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};
const monthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const weekLabels = ["Sem 1", "Sem 2", "Sem 3", "Sem 4", "Sem 5"];

function parseTxDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return null;
  const day = parseInt(parts[0], 10);
  const monthIdx = shortMonthMap[parts[1]];
  if (isNaN(day) || monthIdx === undefined) return null;
  return new Date(new Date().getFullYear(), monthIdx, day);
}

const PIE_COLORS = [
  "hsl(142 70% 55%)",
  "hsl(220 80% 60%)",
  "hsl(45 90% 60%)",
  "hsl(280 70% 60%)",
  "hsl(0 80% 60%)",
  "hsl(30 85% 55%)",
  "hsl(190 70% 50%)",
  "hsl(340 75% 55%)",
];

type TabKey = "mensal" | "semanal" | "categorias";

function InsightsPage() {
  const { ask } = Route.useSearch();
  const [activeTab, setActiveTab] = useState<TabKey>("mensal");
  const [activePieIndex, setActivePieIndex] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    const { data } = await supabase.from("transactions").select("*").neq("is_visible", false);
    if (data) setTransactions(data as Transaction[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Monthly data: last 6 months
  const monthlyData = useMemo(() => {
    const result: { month: string; receitas: number; despesas: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = (currentMonth - i + 12) % 12;
      result.push({ month: monthLabels[m], receitas: 0, despesas: 0 });
    }
    for (const tx of transactions) {
      const d = parseTxDate(tx.date);
      if (!d) continue;
      const txMonth = d.getMonth();
      const idx = result.findIndex(r => r.month === monthLabels[txMonth]);
      if (idx === -1) continue;
      if (tx.type === "income") result[idx].receitas += Number(tx.amount);
      else result[idx].despesas += Number(tx.amount);
    }
    return result;
  }, [transactions, currentMonth]);

  // Current month transactions
  const currentMonthTxs = useMemo(() => {
    return transactions.filter(tx => {
      const d = parseTxDate(tx.date);
      return d && d.getMonth() === currentMonth;
    });
  }, [transactions, currentMonth]);

  const prevMonthTxs = useMemo(() => {
    const prev = (currentMonth - 1 + 12) % 12;
    return transactions.filter(tx => {
      const d = parseTxDate(tx.date);
      return d && d.getMonth() === prev;
    });
  }, [transactions, currentMonth]);

  const currentIncome = currentMonthTxs.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const currentExpense = currentMonthTxs.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const prevIncome = prevMonthTxs.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const prevExpense = prevMonthTxs.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

  const incomeChange = prevIncome > 0 ? ((currentIncome - prevIncome) / prevIncome * 100) : 0;
  const expenseChange = prevExpense > 0 ? ((currentExpense - prevExpense) / prevExpense * 100) : 0;

  // Weekly data for current month
  const weeklyData = useMemo(() => {
    const groups = categoryTree.slice(0, 5).map(g => g.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, ""));
    const result = weekLabels.map(w => {
      const obj: Record<string, any> = { week: w };
      groups.forEach(g => obj[g] = 0);
      obj["outros"] = 0;
      return obj;
    });
    for (const tx of currentMonthTxs) {
      if (tx.type === "income") continue;
      const d = parseTxDate(tx.date);
      if (!d) continue;
      const weekIdx = Math.min(Math.floor((d.getDate() - 1) / 7), 4);
      const { group } = parseCategoryValue(tx.category);
      const key = group.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
      if (groups.includes(key)) {
        result[weekIdx][key] += Number(tx.amount);
      } else {
        result[weekIdx]["outros"] += Number(tx.amount);
      }
    }
    return result;
  }, [currentMonthTxs]);

  // Spending by category for current month
  const spendingByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of currentMonthTxs) {
      if (tx.type === "income") continue;
      const { group } = parseCategoryValue(tx.category);
      map[group] = (map[group] || 0) + Number(tx.amount);
    }
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return sorted.map(([category, amount], i) => ({
      category,
      amount,
      percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
      fill: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [currentMonthTxs]);

  // Dynamic insights based on real data
  const insights = useMemo(() => {
    type Insight = { icon: typeof AlertTriangle; gradient: string; iconColor: string; borderColor: string; title: string; description: string; category?: string };
    const result: Insight[] = [];
    const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const STYLES = {
      success: { gradient: "from-emerald-500/20 to-green-500/20", iconColor: "text-emerald-400", borderColor: "border-emerald-500/20", icon: TrendingUp },
      warning: { gradient: "from-amber-500/20 to-orange-500/20", iconColor: "text-amber-400", borderColor: "border-amber-500/20", icon: AlertTriangle },
      danger: { gradient: "from-red-500/20 to-orange-500/20", iconColor: "text-red-400", borderColor: "border-red-500/20", icon: AlertTriangle },
      info: { gradient: "from-violet-500/20 to-purple-500/20", iconColor: "text-violet-400", borderColor: "border-violet-500/20", icon: Lightbulb },
      tip: { gradient: "from-blue-500/20 to-cyan-500/20", iconColor: "text-blue-400", borderColor: "border-blue-500/20", icon: Lightbulb },
    };

    // Build category maps
    const prevCatMap: Record<string, number> = {};
    for (const tx of prevMonthTxs) {
      if (tx.type === "income") continue;
      const { group } = parseCategoryValue(tx.category);
      prevCatMap[group] = (prevCatMap[group] || 0) + Number(tx.amount);
    }
    const curCatMap: Record<string, number> = {};
    for (const tx of currentMonthTxs) {
      if (tx.type === "income") continue;
      const { group } = parseCategoryValue(tx.category);
      curCatMap[group] = (curCatMap[group] || 0) + Number(tx.amount);
    }

    const totalExpense = currentExpense;
    const balance = currentIncome - currentExpense;

    // 1. Overall financial health (saldo / equilíbrio)
    if (currentIncome > 0 && totalExpense > 0) {
      const ratio = (currentExpense / currentIncome) * 100;
      if (ratio < 50) {
        result.push({
          ...STYLES.success,
          title: "Suas contas estão equilibradas 🎉",
          description: `Você gastou apenas ${Math.round(ratio)}% da sua receita. Sobrou R$ ${fmt(balance)} para investir ou poupar.`,
        });
      } else if (ratio <= 80) {
        result.push({
          ...STYLES.info,
          title: "Orçamento saudável, mas com atenção",
          description: `Suas despesas são ${Math.round(ratio)}% da receita. Tente manter abaixo de 70% para criar reserva.`,
        });
      } else if (ratio <= 100) {
        result.push({
          ...STYLES.warning,
          title: `Atenção: você está gastando ${Math.round(ratio)}% da receita`,
          description: `Restam apenas R$ ${fmt(balance)} de sobra. Revise gastos não essenciais para evitar dívidas.`,
        });
      } else {
        result.push({
          ...STYLES.danger,
          title: `Alerta: gastos superam a receita em ${Math.round(ratio - 100)}%`,
          description: `Você está R$ ${fmt(Math.abs(balance))} no negativo este mês. Corte despesas urgentemente.`,
        });
      }
    } else if (currentIncome === 0 && totalExpense > 0) {
      result.push({
        ...STYLES.warning,
        title: "Nenhuma receita registrada este mês",
        description: `Você teve R$ ${fmt(totalExpense)} em despesas. Cadastre suas receitas para ter uma visão completa.`,
      });
    }

    // 2. Compare categories with previous month
    const allCats = new Set([...Object.keys(curCatMap), ...Object.keys(prevCatMap)]);
    const changes: { cat: string; diff: number; pct: number; cur: number }[] = [];
    for (const cat of allCats) {
      const cur = curCatMap[cat] || 0;
      const prev = prevCatMap[cat] || 0;
      if (prev > 0 && cur > 0) {
        const diff = cur - prev;
        const pct = (diff / prev) * 100;
        changes.push({ cat, diff, pct, cur });
      }
    }

    // Best decrease (parabéns por reduzir)
    const decreases = changes.filter(c => c.pct <= -10).sort((a, b) => a.pct - b.pct);
    if (decreases.length > 0) {
      const best = decreases[0];
      result.push({
        ...STYLES.success,
        title: `Parabéns! Você reduziu ${Math.abs(Math.round(best.pct))}% o gasto com ${best.cat} 🎯`,
        description: `Economia de R$ ${fmt(Math.abs(best.diff))} comparado ao mês anterior. Continue assim!`,
        category: best.cat,
      });
    }

    // Worst increase (alerta por aumentar)
    const increases = changes.filter(c => c.pct >= 20).sort((a, b) => b.pct - a.pct);
    if (increases.length > 0) {
      const worst = increases[0];
      result.push({
        ...STYLES.warning,
        title: `Gastos com ${worst.cat} aumentaram ${Math.round(worst.pct)}% este mês`,
        description: `Você gastou R$ ${fmt(worst.diff)} a mais que no mês passado. Vale revisar essas despesas.`,
        category: worst.cat,
      });
    }

    // 3. Categoria que pesa muito no orçamento (>= 30% das despesas)
    if (spendingByCategory.length > 0 && totalExpense > 0) {
      const top = spendingByCategory[0];
      if (top.percentage >= 50) {
        result.push({
          ...STYLES.danger,
          title: `Seus gastos com ${top.category} equivalem a ${top.percentage}% do orçamento`,
          description: `R$ ${fmt(top.amount)} concentrados em uma única categoria. Diversificar pode trazer mais equilíbrio.`,
          category: top.category,
        });
      } else if (top.percentage >= 30) {
        result.push({
          ...STYLES.info,
          title: `${top.category} é sua maior despesa: ${top.percentage}% do total`,
          description: `R$ ${fmt(top.amount)} gastos. Avalie se há oportunidades de redução nessa categoria.`,
          category: top.category,
        });
      }
    }

    // 4. Exagero em categorias "supérfluas" (Lazer, Compras, Assinaturas, Outros)
    const superCats = ["Lazer", "Compras", "Assinaturas", "Outros"];
    for (const cat of superCats) {
      const amt = curCatMap[cat] || 0;
      if (amt > 0 && currentIncome > 0) {
        const pctIncome = (amt / currentIncome) * 100;
        if (pctIncome >= 15) {
          result.push({
            ...STYLES.warning,
            title: `Esse mês você exagerou em ${cat.toLowerCase()}`,
            description: `Gastos totalizando R$ ${fmt(amt)} (${Math.round(pctIncome)}% da sua receita). Considere reduzir no próximo mês.`,
            category: cat,
          });
          break;
        }
      }
    }

    // 5. Dica de poupança (quando há sobra significativa)
    if (balance > 0 && currentIncome > 0) {
      const savingsRatio = (balance / currentIncome) * 100;
      if (savingsRatio >= 20) {
        result.push({
          ...STYLES.tip,
          title: `Você tem R$ ${fmt(balance)} de sobra este mês 💰`,
          description: `Considere investir em renda fixa, fundos ou criar uma reserva de emergência (recomendado: 6x as despesas).`,
        });
      } else if (savingsRatio >= 10 && savingsRatio < 20) {
        result.push({
          ...STYLES.tip,
          title: `Boa! Você poupou ${Math.round(savingsRatio)}% da sua receita`,
          description: `R$ ${fmt(balance)} disponíveis. Tente aumentar para 20% e acelere seus objetivos financeiros.`,
        });
      }
    }

    // 6. Total de despesas + comparação geral com mês anterior
    if (totalExpense > 0 && prevMonthTxs.length > 0) {
      const prevTotal = prevMonthTxs.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
      if (prevTotal > 0) {
        const diff = totalExpense - prevTotal;
        const pct = (diff / prevTotal) * 100;
        if (Math.abs(pct) >= 10) {
          if (diff > 0) {
            result.push({
              ...STYLES.warning,
              title: `Despesas totais ${Math.round(pct)}% maiores que o mês passado`,
              description: `Você gastou R$ ${fmt(diff)} a mais. Revise as categorias com maior crescimento.`,
            });
          } else {
            result.push({
              ...STYLES.success,
              title: `Você reduziu suas despesas em ${Math.abs(Math.round(pct))}% 📉`,
              description: `Economia geral de R$ ${fmt(Math.abs(diff))} comparado ao mês anterior. Excelente controle!`,
            });
          }
        }
      }
    }

    // Empty state
    if (result.length === 0) {
      result.push({
        ...STYLES.info,
        title: "Adicione transações para ver insights personalizados",
        description: "Quanto mais dados, melhores serão as análises e dicas inteligentes para suas finanças.",
      });
    }

    return result;
  }, [currentMonthTxs, prevMonthTxs, currentIncome, currentExpense, spendingByCategory]);

  // Chart configs
  const areaChartConfig = {
    receitas: { label: "Receitas", color: "hsl(142 70% 55%)" },
    despesas: { label: "Despesas", color: "hsl(0 80% 60%)" },
  } satisfies ChartConfig;

  const topGroups = categoryTree.slice(0, 5).map(g => ({
    key: g.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, ""),
    label: g.label,
  }));

  const barChartConfig = Object.fromEntries([
    ...topGroups.map((g, i) => [g.key, { label: g.label, color: PIE_COLORS[i] }]),
    ["outros", { label: "Outros", color: PIE_COLORS[5] }],
  ]) satisfies ChartConfig;

  const pieChartConfig = Object.fromEntries(
    spendingByCategory.map((c, i) => [
      c.category.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, ""),
      { label: c.category, color: PIE_COLORS[i % PIE_COLORS.length] },
    ])
  ) satisfies ChartConfig;

  const currentMonthLabel = monthLabels[currentMonth];
  const prevMonthLabel = monthLabels[(currentMonth - 1 + 12) % 12];

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="animate-page-enter flex flex-col gap-6 px-4 pt-6 pb-24">
      <div className="animate-stagger-in flex items-center gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            Insights
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
          </h1>
          <p className="text-sm text-muted-foreground">Análise inteligente das suas finanças</p>
        </div>
      </div>

      {/* Monthly overview */}
      <div className="rounded-2xl bg-card p-4 animate-stagger-in border border-border/50 overflow-hidden relative" style={{ animationDelay: "60ms" }}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-destructive/5 pointer-events-none" />
        <div className="relative">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{currentMonthLabel} {currentYear}</h2>
            <span className="text-xs text-muted-foreground rounded-full bg-accent px-2 py-0.5">vs {prevMonthLabel}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-emerald-500/10 p-3 border border-emerald-500/20">
              <p className="text-[10px] text-muted-foreground">Receitas</p>
              <p className="text-lg font-bold text-emerald-400 tabular-nums">
                R$ {currentIncome.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
              {prevIncome > 0 && (
                <div className="mt-1 flex items-center gap-1">
                  {incomeChange >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-400" />
                  )}
                  <span className={`text-[10px] font-medium ${incomeChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {incomeChange >= 0 ? "+" : ""}{incomeChange.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
            <div className="rounded-xl bg-red-500/10 p-3 border border-red-500/20">
              <p className="text-[10px] text-muted-foreground">Despesas</p>
              <p className="text-lg font-bold text-red-400 tabular-nums">
                R$ {currentExpense.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
              {prevExpense > 0 && (
                <div className="mt-1 flex items-center gap-1">
                  {expenseChange <= 0 ? (
                    <TrendingDown className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <TrendingUp className="h-3 w-3 text-red-400" />
                  )}
                  <span className={`text-[10px] font-medium ${expenseChange <= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {expenseChange >= 0 ? "+" : ""}{expenseChange.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chart tabs */}
      <div className="rounded-2xl bg-card p-4 animate-stagger-in border border-border/50" style={{ animationDelay: "120ms" }}>
        <div className="mb-4 flex gap-2">
          {([
            { key: "mensal" as TabKey, label: "Mensal" },
            { key: "semanal" as TabKey, label: "Semanal" },
            { key: "categorias" as TabKey, label: "Categorias" },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`interactive-button rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-300 ${
                activeTab === tab.key
                  ? "bg-gradient-to-r from-primary to-emerald-400 text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-accent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="animate-fade-in" key={activeTab}>
          {activeTab === "mensal" && (
            <div>
              <h2 className="mb-1 text-sm font-semibold text-foreground">Receitas vs Despesas</h2>
              <p className="mb-3 text-[10px] text-muted-foreground">Evolução nos últimos 6 meses</p>
              <ChartContainer config={areaChartConfig} className="aspect-[16/9] w-full">
                <AreaChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillReceitas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(142 70% 55%)" stopOpacity={0.4} />
                      <stop offset="50%" stopColor="hsl(142 70% 55%)" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="hsl(142 70% 55%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillDespesas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(0 80% 60%)" stopOpacity={0.4} />
                      <stop offset="50%" stopColor="hsl(0 80% 60%)" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="hsl(0 80% 60%)" stopOpacity={0} />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 100% / 0.05)" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={10} tick={{ fill: 'hsl(0 0% 60%)' }} />
                  <YAxis tickLine={false} axisLine={false} fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} tick={{ fill: 'hsl(0 0% 60%)' }} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => `R$ ${Number(value).toLocaleString("pt-BR")}`} />} />
                  <Area type="monotone" dataKey="receitas" stroke="hsl(142 70% 55%)" fill="url(#fillReceitas)" strokeWidth={2.5} dot={{ r: 3, fill: 'hsl(142 70% 55%)', strokeWidth: 0 }} activeDot={{ r: 5, fill: 'hsl(142 70% 55%)', stroke: 'hsl(142 70% 75%)', strokeWidth: 2 }} filter="url(#glow)" />
                  <Area type="monotone" dataKey="despesas" stroke="hsl(0 80% 60%)" fill="url(#fillDespesas)" strokeWidth={2.5} dot={{ r: 3, fill: 'hsl(0 80% 60%)', strokeWidth: 0 }} activeDot={{ r: 5, fill: 'hsl(0 80% 60%)', stroke: 'hsl(0 80% 75%)', strokeWidth: 2 }} />
                </AreaChart>
              </ChartContainer>
            </div>
          )}

          {activeTab === "semanal" && (
            <div>
              <h2 className="mb-1 text-sm font-semibold text-foreground">Gastos semanais</h2>
              <p className="mb-3 text-[10px] text-muted-foreground">Distribuição por categoria em {currentMonthLabel}</p>
              <ChartContainer config={barChartConfig} className="aspect-[16/9] w-full">
                <BarChart data={weeklyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    {topGroups.map((g, i) => (
                      <linearGradient key={g.key} id={`bar${g.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={PIE_COLORS[i]} stopOpacity={1} />
                        <stop offset="100%" stopColor={PIE_COLORS[i]} stopOpacity={0.7} />
                      </linearGradient>
                    ))}
                    <linearGradient id="baroutros" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PIE_COLORS[5]} stopOpacity={1} />
                      <stop offset="100%" stopColor={PIE_COLORS[5]} stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 100% / 0.05)" />
                  <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={10} tick={{ fill: 'hsl(0 0% 60%)' }} />
                  <YAxis tickLine={false} axisLine={false} fontSize={10} tick={{ fill: 'hsl(0 0% 60%)' }} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => `R$ ${Number(value).toLocaleString("pt-BR")}`} />} />
                  {topGroups.map((g, i) => (
                    <Bar key={g.key} dataKey={g.key} stackId="a" fill={`url(#bar${g.key})`} radius={i === 0 ? [0, 0, 0, 0] : undefined} />
                  ))}
                  <Bar dataKey="outros" stackId="a" fill="url(#baroutros)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          )}

          {activeTab === "categorias" && (
            <div>
              <h2 className="mb-1 text-sm font-semibold text-foreground">Gastos por categoria</h2>
              <p className="mb-3 text-[10px] text-muted-foreground">Distribuição percentual em {currentMonthLabel}</p>
              {spendingByCategory.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">Nenhuma despesa neste mês</p>
              ) : (
                <>
                  <ChartContainer config={pieChartConfig} className="aspect-square w-full max-h-[220px]">
                    <PieChart>
                      <defs>
                        {spendingByCategory.map((_, i) => (
                          <linearGradient key={i} id={`pieGrad${i}`} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={PIE_COLORS[i % PIE_COLORS.length]} stopOpacity={1} />
                            <stop offset="100%" stopColor={PIE_COLORS[i % PIE_COLORS.length]} stopOpacity={0.7} />
                          </linearGradient>
                        ))}
                        <filter id="pieShadow">
                          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
                        </filter>
                      </defs>
                      <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${value}%`} />} />
                      <Pie
                        data={spendingByCategory}
                        dataKey="percentage"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={80}
                        strokeWidth={2}
                        stroke="hsl(0 0% 0% / 0.3)"
                        paddingAngle={2}
                        onMouseEnter={(_, index) => setActivePieIndex(index)}
                        onMouseLeave={() => setActivePieIndex(null)}
                        animationBegin={0}
                        animationDuration={800}
                        animationEasing="ease-out"
                      >
                        {spendingByCategory.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={`url(#pieGrad${index})`}
                            style={{
                              transform: activePieIndex === index ? 'scale(1.05)' : 'scale(1)',
                              transformOrigin: 'center',
                              transition: 'transform 0.2s ease',
                              filter: activePieIndex === index ? 'url(#pieShadow)' : 'none',
                            }}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="mt-3 flex flex-col gap-2">
                    {spendingByCategory.map((cat, i) => (
                      <div
                        key={cat.category}
                        className="flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors duration-200 hover:bg-accent/50 animate-stagger-in"
                        style={{ animationDelay: `${i * 50}ms` }}
                        onMouseEnter={() => setActivePieIndex(i)}
                        onMouseLeave={() => setActivePieIndex(null)}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full shadow-sm"
                            style={{
                              background: `linear-gradient(135deg, ${PIE_COLORS[i % PIE_COLORS.length]}, ${PIE_COLORS[i % PIE_COLORS.length]}cc)`,
                              boxShadow: `0 0 6px ${PIE_COLORS[i % PIE_COLORS.length]}50`,
                            }}
                          />
                          <span className="text-xs text-muted-foreground">{cat.category}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-foreground tabular-nums">
                            R$ {cat.amount.toFixed(2).replace(".", ",")}
                          </span>
                          <span className="text-[10px] text-muted-foreground rounded-full bg-accent px-1.5 py-0.5">{cat.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* AI Insights */}
      <div className="animate-stagger-in" style={{ animationDelay: "180ms" }}>
        <h2 className="mb-3 text-sm font-semibold text-foreground flex items-center gap-2">
          Insights da IA
          <span className="text-[10px] font-normal text-muted-foreground bg-accent rounded-full px-2 py-0.5">{insights.length} {insights.length === 1 ? "novo" : "novos"}</span>
        </h2>
        <div className="flex flex-col gap-3">
          {insights.map((insight, i) => {
            const cardContent = (
              <>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card/50 backdrop-blur-sm transition-transform duration-200">
                  <insight.icon className={`h-4 w-4 ${insight.iconColor}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{insight.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{insight.description}</p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
              </>
            );
            const className = `interactive-card flex gap-3 rounded-2xl bg-gradient-to-r ${insight.gradient} p-4 cursor-pointer animate-stagger-in border ${insight.borderColor} backdrop-blur-sm`;
            const style = { animationDelay: `${220 + i * 60}ms` };

            if (insight.category) {
              return (
                <Link
                  key={i}
                  to="/transactions"
                  search={{ category: insight.category } as any}
                  className={className}
                  style={style}
                >
                  {cardContent}
                </Link>
              );
            }
            return (
              <div key={i} className={className} style={style}>
                {cardContent}
              </div>
            );
          })}
        </div>
      </div>

      {/* Conversational AI Assistant */}
      <div className="animate-stagger-in" id="ia-chat" style={{ animationDelay: "260ms" }}>
        <h2 className="mb-3 text-sm font-semibold text-foreground flex items-center gap-2">
          Converse com a IA
          <span className="text-[10px] font-normal text-muted-foreground bg-accent rounded-full px-2 py-0.5">Personalizado</span>
        </h2>
        <Suspense fallback={<div className="h-40 flex items-center justify-center bg-card rounded-2xl border border-border/50"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
          <FinancialChat initialPrompt={ask} />
        </Suspense>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/insights")({
  validateSearch: (search: Record<string, unknown>) => ({
    ask: typeof search.ask === "string" ? search.ask : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Insights — Cofre 360" },
      { name: "description", content: "Insights financeiros inteligentes" },
    ],
  }),
  component: InsightsPage,
});
