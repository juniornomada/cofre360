import { createFileRoute } from "@tanstack/react-router";
import { SmartLink as Link } from "@/components/SmartLink";
import { ArrowLeft, Plus, TrendingDown, Loader2, Pencil, Trash2, Target } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { parseCategoryValue } from "@/lib/categories";
import { toast } from "sonner";
import { CalculatorAmountInput } from "@/components/CalculatorAmountInput";


interface BudgetItem {
  id: string;
  category: string;
  icon: string | null;
  spent: number | null;
  budget_limit: number | null;
  color: string | null;
}

interface TxRow {
  amount: number;
  category: string | null;
  type: string;
  date: string;
}

interface Goal {
  id: string;
  name: string | null;
  icon: string | null;
  current_amount: number | null;
  target_amount: number | null;
  deadline: string | null;
}

const budgetIconOptions = ["🍔", "🏠", "🚗", "🎬", "💊", "🎮", "📚", "👕", "✈️", "🐾", "💡", "📱"];
const goalIconOptions = ["🛡️", "✈️", "🚗", "📚", "🏠", "💻", "🎓", "💍", "🏖️", "🎯", "💰", "🏥"];

const PT_MONTH_ABBR: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

function parseTxDate(s: string): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const ptShort = trimmed.toLowerCase().match(/^(\d{1,2})\s+([a-zç]{3,})\.?(?:\s+(\d{4}))?$/);
  if (ptShort) {
    const day = Number(ptShort[1]);
    const monthAbbr = ptShort[2].slice(0, 3);
    const month = PT_MONTH_ABBR[monthAbbr];
    if (month !== undefined) {
      const year = ptShort[3] ? Number(ptShort[3]) : new Date().getFullYear();
      return new Date(year, month, day);
    }
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function OrcaMetasPage() {
  // Budget state
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [loadingBudget, setLoadingBudget] = useState(true);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [showEditBudget, setShowEditBudget] = useState(false);
  const [showDeleteBudget, setShowDeleteBudget] = useState(false);
  const [editItem, setEditItem] = useState<BudgetItem | null>(null);
  const [deleteBudgetId, setDeleteBudgetId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ category: "", icon: "🍔", budget_limit: 0, color: "bg-chart-1" });

  // Goals state
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(true);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [showEditGoal, setShowEditGoal] = useState(false);
  const [showDeleteGoal, setShowDeleteGoal] = useState(false);
  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ name: "", icon: "🎯", current_amount: 0, target_amount: 0, deadline: "" });

  const fetchBudget = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {

      const [budgets, txs] = await Promise.all([
        supabase.from("budget_categories").select("*").order("created_at", { ascending: true }),
        supabase.from("transactions").select("amount, category, type, date").eq("type", "expense").neq("is_visible", false),
      ]);
      if (budgets.error) throw budgets.error;
      if (txs.error) throw txs.error;

      if (budgets.data) setItems(budgets.data as any);
      if (txs.data) setTransactions(txs.data as any);
    } catch (error: any) {
      console.error("Error fetching budget data:", error);
      toast.error("Erro ao carregar dados do orçamento");
    } finally {
      setLoadingBudget(false);
    }
  }, []);

  const fetchGoals = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {

      const { data, error } = await supabase.from("goals").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      if (data) setGoals(data as any);
    } catch (error: any) {
      console.error("Error fetching goals:", error);
      toast.error("Erro ao carregar metas");
    } finally {
      setLoadingGoals(false);
    }
  }, []);

  useEffect(() => { fetchBudget(); fetchGoals(); }, [fetchBudget, fetchGoals]);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthLabel = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

  const { spentByFull, spentByGroup, spentBySub } = useMemo(() => {
    const fullMap: Record<string, number> = {};
    const groupMap: Record<string, number> = {};
    const subMap: Record<string, number> = {};
    for (const tx of transactions) {
      const d = parseTxDate(tx.date);
      if (!d) continue;
      if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) continue;
      const raw = (tx.category || "").trim();
      if (!raw) continue;
      const amount = Number(tx.amount || 0);
      
      const { group, sub } = parseCategoryValue(raw);
      
      // 1. Full Category string (e.g. "Transporte > Uber/99")
      const fullKey = raw.toLowerCase();
      fullMap[fullKey] = (fullMap[fullKey] || 0) + amount;
      
      // 2. Group only (e.g. "Transporte")
      const groupKey = group.trim().toLowerCase();
      if (groupKey) groupMap[groupKey] = (groupMap[groupKey] || 0) + amount;
      
      // 3. Subcategory only (e.g. "Uber/99")
      const subKey = (sub || "").trim().toLowerCase();
      if (subKey) subMap[subKey] = (subMap[subKey] || 0) + amount;
      
    }
    return { spentByFull: fullMap, spentByGroup: groupMap, spentBySub: subMap };
  }, [transactions, currentMonth, currentYear]);

  const computedItems = useMemo(
    () => items.map(it => {
      const cat = it.category.trim();
      const key = cat.toLowerCase();
      // Sum up values from full category, group, and subcategory if they match
      const spent = (spentByFull[key] || 0) + 
                   (spentByGroup[key] || 0) + 
                   (spentBySub[key] || 0);
      return { ...it, spent };
    }),
    [items, spentByFull, spentByGroup, spentBySub]
  );

  // Budget handlers
  const handleAddBudget = async () => {
    try {
      const { error } = await supabase.from("budget_categories").insert({
        category: newItem.category, icon: newItem.icon,
        spent: 0, budget_limit: newItem.budget_limit, color: newItem.color,
      });
      if (error) throw error;
      setShowAddBudget(false);
      setNewItem({ category: "", icon: "🍔", budget_limit: 0, color: "bg-chart-1" });
      fetchBudget();
      toast.success("Orçamento adicionado");
    } catch (error: any) {
      console.error("Error adding budget:", error);
      toast.error("Erro ao adicionar orçamento");
    }
  };

  const handleSaveBudget = async () => {
    try {
      if (!editItem) return;
      const { error } = await supabase.from("budget_categories").update({
        category: editItem.category, icon: editItem.icon,
        budget_limit: editItem.budget_limit, color: editItem.color,
      }).eq("id", editItem.id);
      if (error) throw error;
      setShowEditBudget(false);
      setEditItem(null);
      fetchBudget();
      toast.success("Orçamento atualizado");
    } catch (error: any) {
      console.error("Error saving budget:", error);
      toast.error("Erro ao salvar orçamento");
    }
  };

  const handleDeleteBudget = async () => {
    try {
      if (!deleteBudgetId) return;
      const { error } = await supabase.from("budget_categories").delete().eq("id", deleteBudgetId);
      if (error) throw error;
      setShowDeleteBudget(false);
      setDeleteBudgetId(null);
      fetchBudget();
      toast.success("Orçamento excluído");
    } catch (error: any) {
      console.error("Error deleting budget:", error);
      toast.error("Erro ao excluir orçamento");
    }
  };

  // Goals handlers
  const handleSaveGoal = async () => {
    try {
      if (!editGoal) return;
      const { error } = await supabase.from("goals").update({
        name: editGoal.name, icon: editGoal.icon,
        current_amount: editGoal.current_amount, target_amount: editGoal.target_amount,
        deadline: editGoal.deadline,
      }).eq("id", editGoal.id);
      if (error) throw error;
      setShowEditGoal(false);
      setEditGoal(null);
      fetchGoals();
      toast.success("Meta atualizada");
    } catch (error: any) {
      console.error("Error saving goal:", error);
      toast.error("Erro ao salvar meta");
    }
  };

  const handleDeleteGoal = async () => {
    try {
      if (!deleteGoalId) return;
      const { error } = await supabase.from("goals").delete().eq("id", deleteGoalId);
      if (error) throw error;
      setShowDeleteGoal(false);
      setDeleteGoalId(null);
      fetchGoals();
      toast.success("Meta excluída");
    } catch (error: any) {
      console.error("Error deleting goal:", error);
      toast.error("Erro ao excluir meta");
    }
  };

  const handleAddGoal = async () => {
    try {
      const { error } = await supabase.from("goals").insert({
        name: newGoal.name, icon: newGoal.icon,
        current_amount: newGoal.current_amount, target_amount: newGoal.target_amount,
        deadline: newGoal.deadline,
      });
      if (error) throw error;
      setShowAddGoal(false);
      setNewGoal({ name: "", icon: "🎯", current_amount: 0, target_amount: 0, deadline: "" });
      fetchGoals();
      toast.success("Meta adicionada");
    } catch (error: any) {
      console.error("Error adding goal:", error);
      toast.error("Erro ao adicionar meta");
    }
  };

  const totalSpent = computedItems.reduce((s, b) => s + b.spent, 0);
  const totalLimit = computedItems.reduce((s, b) => s + b.budget_limit, 0);
  const percentage = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0;

   if (loadingBudget || loadingGoals) {
     return (
       <div className="flex items-center justify-center py-20">
         <Loader2 className="h-6 w-6 animate-spin text-primary" />
       </div>
     );
   }

  return (
    <div className="animate-page-enter flex flex-col gap-6 px-4 pt-6 pb-24">
      <div className="flex items-center gap-3">
        <Link to="/" className="interactive-button flex h-9 w-9 items-center justify-center rounded-xl bg-card">
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">OrçaMetas</h1>
          <p className="text-sm text-muted-foreground">Orçamento e metas em um só lugar</p>
        </div>
      </div>

      <Tabs defaultValue="budget" className="flex flex-col gap-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="budget">Orçamento</TabsTrigger>
          <TabsTrigger value="goals">Metas</TabsTrigger>
        </TabsList>

        {/* ============== BUDGET TAB ============== */}
        <TabsContent value="budget" className="flex flex-col gap-4 mt-0">
          <div className="interactive-card rounded-2xl bg-gradient-to-br from-primary/20 to-card p-5 animate-stagger-in">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Gasto total · {monthLabel}</p>
              <span className="text-xs text-muted-foreground">{percentage}%</span>
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              R$ {totalSpent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              de R$ {totalLimit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
            <div className="mt-3 h-2.5 rounded-full bg-accent overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.min(percentage, 100)}%` }} />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {computedItems.map((item, i) => {
              const pct = item.budget_limit > 0 ? Math.round((item.spent / item.budget_limit) * 100) : 0;
              const isOver = pct >= 100;
              return (
                <div key={item.id} className="group interactive-card rounded-2xl bg-card p-4 animate-stagger-in relative" style={{ animationDelay: `${60 + i * 40}ms` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{item.icon || "🍔"}</span>
                      <span className="text-sm font-medium text-foreground">{item.category}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isOver && <TrendingDown className="h-3 w-3 text-destructive" />}
                      <span className={`text-xs font-semibold tabular-nums ${isOver ? "text-destructive" : "text-foreground"}`}>{pct}%</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditItem({ ...item }); setShowEditBudget(true); }} className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button onClick={() => { setDeleteBudgetId(item.id); setShowDeleteBudget(true); }} className="flex h-6 w-6 items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-accent overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${isOver ? "bg-destructive" : item.color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-muted-foreground tabular-nums">R$ {item.spent?.toFixed(2) || "0.00"}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">R$ {item.budget_limit?.toFixed(2) || "0.00"}</span>
                  </div>
                </div>
              );
            })}
            {computedItems.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma categoria cadastrada</p>}
          </div>

          <button onClick={() => setShowAddBudget(true)} className="interactive-button flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-medium text-primary-foreground">
            <Plus className="h-4 w-4" />
            Adicionar categoria
          </button>
        </TabsContent>

        {/* ============== GOALS TAB ============== */}
        <TabsContent value="goals" className="flex flex-col gap-4 mt-0">
          <div className="interactive-card rounded-2xl bg-gradient-to-br from-chart-2/20 to-card p-5 animate-stagger-in">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-5 w-5 text-chart-2" />
              <p className="text-sm font-semibold text-foreground">{goals.length} metas ativas</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Você já economizou R$ {goals.reduce((s, g) => s + (g.current_amount || 0), 0).toLocaleString("pt-BR")} de R$ {goals.reduce((s, g) => s + (g.target_amount || 0), 0).toLocaleString("pt-BR")}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {goals.map((goal, i) => {
              const pct = goal.target_amount > 0 ? Math.round((goal.current_amount || 0) / goal.target_amount * 100) : 0;
              return (
                <div key={goal.id} className="group interactive-card rounded-2xl bg-card p-4 animate-stagger-in relative" style={{ animationDelay: `${60 + i * 40}ms` }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{goal.icon || "🎯"}</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{goal.name || "Sem nome"}</p>
                        <p className="text-[10px] text-muted-foreground">Meta: {goal.deadline || "Sem prazo"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-primary tabular-nums">{pct}%</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditGoal({ ...goal }); setShowEditGoal(true); }} className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => { setDeleteGoalId(goal.id); setShowDeleteGoal(true); }} className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-accent overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-muted-foreground tabular-nums">R$ {(goal.current_amount || 0).toLocaleString("pt-BR")}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">R$ {(goal.target_amount || 0).toLocaleString("pt-BR")}</span>
                  </div>
                </div>
              );
            })}
            {goals.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma meta cadastrada</p>}
          </div>

          <button onClick={() => setShowAddGoal(true)} className="interactive-button flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-medium text-primary-foreground">
            <Plus className="h-4 w-4" />
            Adicionar meta
          </button>
        </TabsContent>
      </Tabs>

      {/* ============== BUDGET DIALOGS ============== */}
      <Dialog open={showAddBudget} onOpenChange={setShowAddBudget}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader><DialogTitle>Nova Categoria</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ícone</label>
              <div className="flex flex-wrap gap-2">
                {budgetIconOptions.map(ic => (
                  <button key={ic} onClick={() => setNewItem({ ...newItem, icon: ic })} className={`text-xl p-1 rounded-lg transition-colors ${newItem.icon === ic ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-accent"}`}>{ic}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome da categoria</label>
              <input value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} placeholder="Ex: Alimentação" className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              <p className="text-[10px] text-muted-foreground mt-1">Use exatamente o mesmo nome usado nas transações.</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Limite (R$)</label>
              <CalculatorAmountInput value={newItem.budget_limit || 0} onChange={v => setNewItem({ ...newItem, budget_limit: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBudget(false)}>Cancelar</Button>
            <Button onClick={handleAddBudget} disabled={!newItem.category}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditBudget} onOpenChange={setShowEditBudget}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader><DialogTitle>Editar Categoria</DialogTitle></DialogHeader>
          {editItem && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Ícone</label>
                <div className="flex flex-wrap gap-2">
                  {budgetIconOptions.map(ic => (
                    <button key={ic} onClick={() => setEditItem({ ...editItem, icon: ic })} className={`text-xl p-1 rounded-lg transition-colors ${editItem.icon === ic ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-accent"}`}>{ic}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
                <input autoFocus value={editItem.category} onChange={e => setEditItem({ ...editItem, category: e.target.value })} className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Limite (R$)</label>
                <CalculatorAmountInput value={editItem.budget_limit || 0} onChange={v => setEditItem({ ...editItem, budget_limit: v })} />
              </div>
              <p className="text-[10px] text-muted-foreground">O gasto é calculado automaticamente a partir das suas transações do mês.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditBudget(false)}>Cancelar</Button>
            <Button onClick={handleSaveBudget}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteBudget} onOpenChange={setShowDeleteBudget}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader><DialogTitle>Excluir Categoria</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir esta categoria?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteBudget(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteBudget}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== GOAL DIALOGS ============== */}
      <Dialog open={showEditGoal} onOpenChange={setShowEditGoal}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader><DialogTitle>Editar Meta</DialogTitle></DialogHeader>
          {editGoal && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Ícone</label>
                <div className="flex flex-wrap gap-2">
                  {goalIconOptions.map(ic => (
                    <button key={ic} onClick={() => setEditGoal({ ...editGoal, icon: ic })} className={`text-xl p-1 rounded-lg transition-colors ${editGoal.icon === ic ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-accent"}`}>{ic}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
                <input autoFocus value={editGoal.name} onChange={e => setEditGoal({ ...editGoal, name: e.target.value })} className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Valor atual (R$)</label>
                <CalculatorAmountInput value={editGoal.current_amount || 0} onChange={v => setEditGoal({ ...editGoal, current_amount: v })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Valor alvo (R$)</label>
                <CalculatorAmountInput value={editGoal.target_amount || 0} onChange={v => setEditGoal({ ...editGoal, target_amount: v })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Prazo</label>
                <input value={editGoal.deadline} onChange={e => setEditGoal({ ...editGoal, deadline: e.target.value })} placeholder="Ex: Dez 2025" className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditGoal(false)}>Cancelar</Button>
            <Button onClick={handleSaveGoal}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteGoal} onOpenChange={setShowDeleteGoal}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader><DialogTitle>Excluir Meta</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir esta meta?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteGoal(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteGoal}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddGoal} onOpenChange={setShowAddGoal}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader><DialogTitle>Nova Meta</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ícone</label>
              <div className="flex flex-wrap gap-2">
                {goalIconOptions.map(ic => (
                  <button key={ic} onClick={() => setNewGoal({ ...newGoal, icon: ic })} className={`text-xl p-1 rounded-lg transition-colors ${newGoal.icon === ic ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-accent"}`}>{ic}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
              <input value={newGoal.name} onChange={e => setNewGoal({ ...newGoal, name: e.target.value })} placeholder="Ex: Viagem Europa" className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Valor atual (R$)</label>
              <CalculatorAmountInput value={newGoal.current_amount || 0} onChange={v => setNewGoal({ ...newGoal, current_amount: v })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Valor alvo (R$)</label>
              <CalculatorAmountInput value={newGoal.target_amount || 0} onChange={v => setNewGoal({ ...newGoal, target_amount: v })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prazo</label>
              <input value={newGoal.deadline} onChange={e => setNewGoal({ ...newGoal, deadline: e.target.value })} placeholder="Ex: Dez 2025" className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddGoal(false)}>Cancelar</Button>
            <Button onClick={handleAddGoal} disabled={!newGoal.name || !newGoal.target_amount}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/orcametas")({
  head: () => ({
    meta: [
      { title: "OrçaMetas — Cofre 360" },
      { name: "description", content: "Gerencie seu orçamento mensal e suas metas financeiras" },
    ],
  }),
  component: OrcaMetasPage,
});
