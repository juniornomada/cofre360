import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TrendingUp, Eye, EyeOff, Bell, Pencil, Trash2, CalendarIcon, Loader2, Clock, Wallet, ChevronRight, ArrowUpRight, ArrowDownRight, AlertTriangle, Sparkles, Flame, Plus, Minus, ArrowLeftRight, Layers, GripVertical, Filter, FilterX, LogOut } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TransactionItem } from "@/components/TransactionItem";
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { format, parse, isToday, isYesterday, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { parseCategoryValue, getCategoryIcon } from "@/lib/categories";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BankLogo } from "@/components/BankLogo";
import { EmptyState } from "@/components/EmptyState";
import { SmartLink as Link } from "@/components/SmartLink";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const CategoryPicker = lazy(() => import("@/components/CategoryPicker").then(m => ({ default: m.CategoryPicker })));
const QuickAddTransactionDialog = lazy(() => import("@/components/QuickAddTransactionDialog").then(m => ({ default: m.QuickAddTransactionDialog })));
import { CalculatorAmountInput } from "@/components/CalculatorAmountInput";

import type { QuickAddInitialType } from "@/components/QuickAddTransactionDialog";
import { saveInstallmentPlan, stripInstallmentSuffix } from "@/lib/installment-edit";
import { deleteTransactionScope, isInstallmentTx } from "@/lib/installment-delete";
import { toast } from "sonner";
import { useUserPreferences } from "@/hooks/use-user-preferences";


interface Transaction {
  id: string;
  icon: string;
  name: string;
  category: string;
  date: string;
  amount: number;
  type: "income" | "expense";
  card?: string | null;
  bank_account_id?: string | null;
  installment_group_id?: string | null;
  installment_number?: number;
  total_installments?: number;
  // For unified transfer rendering
  isTransferPair?: boolean;
  transferFromName?: string;
  transferToName?: string;
  is_visible?: boolean;
}

const shortMonthMap: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

function parseTxDateToDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const day = parseInt(slash[1], 10);
    const month = parseInt(slash[2], 10) - 1;
    let year = parseInt(slash[3], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
  }
  const parts = trimmed.toLowerCase().split(/\s+/);
  if (parts.length >= 2) {
    const day = parseInt(parts[0], 10);
    const monthIdx = shortMonthMap[parts[1]];
    if (!isNaN(day) && monthIdx !== undefined) {
      const year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
      return new Date(year, monthIdx, day);
    }
  }
  return null;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}


function SortableAccountItem({ acc, balanceVisible, fmt }: { acc: any; balanceVisible: boolean; fmt: (v: number) => string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: acc.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    touchAction: "manipulation",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "relative select-none",
        isDragging && "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-xl shadow-2xl scale-[1.01] z-50",
      )}
    >
      <div className="flex flex-1 items-center gap-2 overflow-hidden">
        <Link
          to="/accounts"
          search={{ action: undefined } as any}
          className="flex-1 flex items-center gap-2.5 rounded-xl bg-background/40 px-2.5 py-1.5 hover:bg-background/60 transition-colors overflow-hidden"
        >
        <BankLogo icon={acc.icon} color={acc.color} name={acc.name} size="sm" />
        <p className="text-xs font-medium text-foreground flex-1 min-w-0 truncate">{acc.name}</p>
        <p className={cn(
          "text-xs font-bold tabular-nums",
          acc.balance >= 0 ? "text-foreground" : "text-destructive"
        )}>
          {balanceVisible ? `R$ ${fmt(acc.balance)}` : "R$ ••••"}
        </p>
        </Link>
      </div>
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/5 backdrop-blur-[0.5px] rounded-xl animate-fade-in">
          <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold text-gray-900 shadow-lg ring-1 ring-primary">
            <GripVertical className="h-3 w-3" />
            Mover
          </div>
        </div>
      )}
    </div>
  );
}


function Dashboard() {
  const {
    balanceVisible,
    hideZeroBalances,
    updateBalanceVisible,
    updateHideZeroBalances
  } = useUserPreferences();
  const [userEmail, setUserEmail] = useState<string | null>(null);



  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [accountBalances, setAccountBalances] = useState<{ id: string; name: string; icon: string | null; color: string | null; balance: number; is_visible?: boolean }[]>([]);
  const [cardOptions, setCardOptions] = useState<string[]>(["Nenhum"]);
  const [allCards, setAllCards] = useState<{ id: string; name: string; emoji: string | null; color: string | null; is_visible?: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [deleteScope, setDeleteScope] = useState<"single" | "future" | "all">("single");
  const [pendingReminders, setPendingReminders] = useState<{ id: string; title: string | null; icon: string | null; due_date: string | null; amount: number | null; type: string | null; bank_account_id: string | null; card_id: string | null }[]>([]);
  const [goals, setGoals] = useState<{ id: string; name: string | null; icon: string | null; current_amount: number | null; target_amount: number | null }[]>([]);

  const [greeting, setGreeting] = useState<string>("");

  useEffect(() => {
    setGreeting(getGreeting());
  }, []);



  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair: " + error.message);
    } else {
      window.location.href = "/auth";
    }
  };


    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const emptyStateRef = useRef<HTMLDivElement>(null);
    const transactionsListRef = useRef<HTMLDivElement>(null);
  const [quickAddType, setQuickAddType] = useState<QuickAddInitialType>("expense");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [editInstallmentMode, setEditInstallmentMode] = useState<"divide" | "fixed">("divide");
  const [editInstallmentFixedValue, setEditInstallmentFixedValue] = useState(0);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 1000, tolerance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 1000, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = accountBalances.findIndex((a) => a.id === active.id);
    const newIndex = accountBalances.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(accountBalances, oldIndex, newIndex);
    setAccountBalances(reordered);
    try {
      await Promise.all(
        reordered.map((a, idx) => supabase.from("bank_accounts").update({ sort_order: idx }).eq("id", a.id)),
      );
    } catch (error: any) {
      console.error("Error reordering accounts:", error);
      toast.error("Erro ao reordenar contas");
    }
  };

  const handleToggleAccountVisibility = async (id: string, currentVisible: boolean) => {
    const newVisible = !currentVisible;
    setAccountBalances(prev => prev.map(a => a.id === id ? { ...a, is_visible: newVisible } : a));
    
    try {
      const { error } = await supabase
        .from("bank_accounts")
        .update({ is_visible: newVisible })
        .eq("id", id);
      
      if (error) throw error;
      toast.success(newVisible ? "Conta agora é exibida" : "Conta agora está oculta");
    } catch (error) {
      console.error("Error toggling account visibility:", error);
      toast.error("Erro ao atualizar visibilidade");
      // Rollback on error
      setAccountBalances(prev => prev.map(a => a.id === id ? { ...a, is_visible: currentVisible } : a));
    }
  };

  const openQuickAdd = (t: QuickAddInitialType) => {
    setQuickAddType(t);
    setPopoverOpen(false);
    setQuickAddOpen(true);
  };

  const fetchAll = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setUserEmail(session.user.email || null);


    try {

    // Fire ALL queries in parallel — was sequential before, causing slow load.
    // Also: only select fields we actually use, instead of select("*").
    const TX_FIELDS = "id, icon, name, category, date, amount, type, card, bank_account_id, installment_group_id, installment_number, total_installments, is_visible";
    const [
      rawRecentRes,
      allTxRes,
      acctsRes,
      cardsRes,
      remsRes,
      glsRes,
    ] = await Promise.all([
      supabase.from("transactions").select(TX_FIELDS).eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("transactions").select("type, amount, date, card, bank_account_id, category").eq("user_id", session.user.id),
      supabase.from("bank_accounts").select("id, name, icon, color, balance, is_visible, sort_order").eq("user_id", session.user.id).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      supabase.from("cards").select("id, name, emoji, color, is_visible").eq("user_id", session.user.id).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      supabase.from("reminders").select("id, title, icon, due_date, amount, type, bank_account_id, card_id").eq("user_id", session.user.id).eq("is_completed", false).order("due_date", { ascending: true }).limit(3),
      supabase.from("goals").select("id, name, icon, current_amount, target_amount").eq("user_id", session.user.id),
    ]);

    if (rawRecentRes.error) throw rawRecentRes.error;
    if (allTxRes.error) throw allTxRes.error;
    if (acctsRes.error) throw acctsRes.error;
    if (cardsRes.error) throw cardsRes.error;
    if (remsRes.error) throw remsRes.error;
    if (glsRes.error) throw glsRes.error;

    const rawRecent = rawRecentRes.data;
    const allTx = allTxRes.data;
    const accts = acctsRes.data;
    const cards = cardsRes.data;
    const rems = remsRes.data;
    const gls = glsRes.data;

    setCardOptions(["Nenhum", ...((cards || []).map((c: any) => c.name))]);
    if (cards) setAllCards(cards as any);
    if (rems) setPendingReminders(rems as any);
    if (gls) setGoals(gls as any);

    const acctNameById: Record<string, string> = {};
    for (const a of accts || []) acctNameById[a.id] = a.name;

    // Collapse transfer pairs into a single visual row.
    if (rawRecent) {
      const seen = new Set<string>();
      const merged: Transaction[] = [];
      for (const tx of rawRecent as any[]) {
        if (seen.has(tx.id)) continue;
        if (tx.category === "Transferência" && tx.installment_group_id) {
          const partner = (rawRecent as any[]).find(
            (o) => o.id !== tx.id && o.installment_group_id === tx.installment_group_id && o.category === "Transferência"
          );
          if (partner) {
            seen.add(tx.id);
            seen.add(partner.id);
            const expenseSide = tx.type === "expense" ? tx : partner;
            const incomeSide = tx.type === "income" ? tx : partner;
            const fromName = acctNameById[expenseSide.bank_account_id] || "Conta";
            const toName = acctNameById[incomeSide.bank_account_id] || "Conta";
            merged.push({
              ...expenseSide,
              name: `${fromName} → ${toName}`,
              isTransferPair: true,
              transferFromName: fromName,
              transferToName: toName,
            } as Transaction);
            continue;
          }
        }
        seen.add(tx.id);
        merged.push(tx as Transaction);
      }
      setTransactions(merged.filter(tx => tx.is_visible !== false).slice(0, 8));
    }

    if (allTx) {
      setAllTransactions(allTx as Transaction[]);
    }
    if (accts) {
      const incMap: Record<string, number> = {};
      const expMap: Record<string, number> = {};
      for (const tx of (allTx || []).filter((t: any) => t.is_visible !== false) as any[]) {
        const id = tx.bank_account_id as string | null;
        if (!id) continue;
        if (tx.type === "expense" && tx.card) continue;
        if (tx.type === "income") incMap[id] = (incMap[id] || 0) + Number(tx.amount);
        else expMap[id] = (expMap[id] || 0) + Number(tx.amount);
      }
      setAccountBalances(accts.map(a => ({
        id: a.id,
        name: a.name,
        icon: a.icon,
        color: a.color,
        balance: Number(a.balance) + (incMap[a.id] || 0) - (expMap[a.id] || 0),
      })));
    }
    } catch (error: any) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Erro ao carregar dados do dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  // Kept as separate refresh handlers (used after edits/deletes).
  const fetchTransactions = fetchAll;

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleToggleVisibility = async (tx: Transaction) => {
    try {
      const newVisibility = tx.is_visible === false ? true : false;
      const idsToUpdate = [tx.id];
      
      // If it's a transfer pair, find the linked transaction
      if (tx.isTransferPair && tx.installment_group_id) {
        const { data: linked } = await supabase
          .from("transactions")
          .select("id")
          .eq("installment_group_id", tx.installment_group_id)
          .eq("category", "Transferência");
        
        if (linked) {
          linked.forEach(l => {
            if (l.id !== tx.id) idsToUpdate.push(l.id);
          });
        }
      }

      const { error } = await supabase
        .from("transactions")
        .update({ is_visible: newVisibility })
        .in("id", idsToUpdate);

      if (error) throw error;

      toast.success(newVisibility ? "Transação visível" : "Transação oculta");
      fetchAll();
    } catch (error: any) {
      console.error("Error toggling visibility:", error);
      toast.error("Erro ao alterar visibilidade");
    }
  };

  const handleEdit = (tx: Transaction) => {
    setEditTx({ ...tx });
    setEditInstallmentMode("divide");
    setEditInstallmentFixedValue(tx.amount || 0);
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editTx) return;
    const total = Math.max(1, Math.floor(editTx.total_installments || 1));
    const current = Math.max(1, Math.min(total, Math.floor(editTx.installment_number || 1)));
    const baseName = stripInstallmentSuffix(editTx.name);
    const finalName = total > 1 ? `${baseName} (${current}/${total})` : baseName;

    // Compute per-installment value (only relevant when total > 1).
    let perInstallment = editTx.amount;
    if (total > 1) {
      if (editInstallmentMode === "divide") {
        perInstallment = Math.round((editTx.amount / total) * 100) / 100;
      } else {
        perInstallment = editInstallmentFixedValue;
      }
    }

    try {
      // Balance check for expenses from bank accounts (including transfers which are expenses on the origin side)
      if (editTx.type === "expense" && editTx.bank_account_id) {
        const acc = accountBalances.find(a => a.id === editTx.bank_account_id);
        if (acc) {
          const originalTx = allTransactions.find(t => t.id === editTx.id);
          let availableBalance = acc.balance || 0;
          
          // If editing an existing expense from the same account, add back the current amount to check limit
          if (originalTx && originalTx.bank_account_id === editTx.bank_account_id && originalTx.type === "expense") {
            availableBalance += originalTx.amount;
          }
          
          if (perInstallment > availableBalance) {
            toast.error(`Saldo insuficiente na conta ${acc.name} (Saldo disponível: R$ ${availableBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);
            return;
          }
        }
      }

      const { error: updErr } = await supabase.from("transactions").update({
        icon: editTx.icon,
        name: finalName,
        category: editTx.category,
        date: editTx.date,
        amount: perInstallment,
        type: editTx.type,
        card: editTx.card,
        bank_account_id: editTx.bank_account_id || null,
      }).eq("id", editTx.id);
      if (updErr) throw updErr;

      const result = await saveInstallmentPlan({
        id: editTx.id,
        name: finalName,
        icon: editTx.icon,
        category: editTx.category,
        date: editTx.date,
        amount: perInstallment,
        type: editTx.type,
        card: editTx.card ?? null,
        bank_account_id: editTx.bank_account_id ?? null,
        installment_group_id: editTx.installment_group_id ?? null,
        current,
        total,
        installmentAmount: perInstallment,
      });

      if (result.cleared) {
        toast.success("Parcelamento removido");
      } else if (result.futureRowsAdded > 0) {
        toast.success(
          `Parcelamento salvo (${result.futureRowsAdded} parcela${result.futureRowsAdded > 1 ? "s" : ""} futura${result.futureRowsAdded > 1 ? "s" : ""})`
        );
      } else {
        toast.success("Transação atualizada");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar transação");
    } finally {
      setShowEditDialog(false);
      setEditTx(null);
      fetchTransactions();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      const { deletedCount } = await deleteTransactionScope(deleteTarget, deleteScope);
      if (deletedCount > 1) {
        toast.success(`${deletedCount} transações excluídas`);
      } else {
        toast.success("Transação excluída");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao excluir transação");
    } finally {
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      setDeleteScope("single");
      fetchTransactions();
    }
  };

  // Saldo real = soma dos saldos por conta bancária.
  // NÃO somar totalIncome/totalExpense direto, pois despesas de cartão de crédito
  // não saem da conta no momento da compra (só quando a fatura é paga via card_payments,
  // que gera uma transação separada). Transações sem bank_account_id também não
  // afetam saldo de conta nenhuma.
  const balance = accountBalances.reduce((s, a) => s + a.balance, 0);

  // Monthly summary: current month income/expense
  const monthlySummary = useMemo(() => {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    let income = 0, expense = 0;
    for (const tx of allTransactions) {
      const d = parseTxDateToDate(tx.date);
      if (!d) continue;
      if (d.getMonth() === curMonth && d.getFullYear() === curYear) {
        if (tx.type === "income") income += Number(tx.amount);
        else expense += Number(tx.amount);
      }
    }
    return { income, expense, net: income - expense };
  }, [allTransactions]);

  // Forecast: future income/expense from now to end of month
  // Includes future-dated transactions (e.g. installments) + pending reminders
  const monthForecast = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    let income = 0, expense = 0;

    // Future transactions (e.g. credit card installments dated later this month)
    for (const tx of allTransactions) {
      const d = parseTxDateToDate(tx.date);
      if (!d) continue;
      if (d > today && d <= monthEnd) {
        if (tx.type === "income") income += Number(tx.amount);
        else expense += Number(tx.amount);
      }
    }

    // Pending reminders due between today and end of month
    for (const r of pendingReminders) {
      const d = parseTxDateToDate(r.due_date);
      if (!d) continue;
      if (d >= today && d <= monthEnd) {
        if (r.type === "income") income += Number(r.amount);
        else expense += Number(r.amount);
      }
    }

    return { income, expense, net: income - expense };
  }, [allTransactions, pendingReminders]);

  const monthInitialBalance = balance - monthlySummary.net;
  const forecastBalance = balance + monthForecast.net;

  // Top spending categories this month + previous month for trend comparison
  const topCategories = useMemo(() => {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    const prevMonth = (curMonth - 1 + 12) % 12;
    const prevYear = curMonth === 0 ? curYear - 1 : curYear;
    const catMap: Record<string, number> = {};
    const prevMap: Record<string, number> = {};
    for (const tx of allTransactions) {
      if (tx.type !== "expense") continue;
      const d = parseTxDateToDate(tx.date);
      if (!d) continue;
      const group = parseCategoryValue(tx.category).group;
      if (d.getMonth() === curMonth && d.getFullYear() === curYear) {
        catMap[group] = (catMap[group] || 0) + Number(tx.amount);
      } else if (d.getMonth() === prevMonth && d.getFullYear() === prevYear) {
        prevMap[group] = (prevMap[group] || 0) + Number(tx.amount);
      }
    }
    const top = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, amount]) => ({ cat, amount, prev: prevMap[cat] || 0 }));
    return top;
  }, [allTransactions]);

  // Health Score (0-100): based on expense/income ratio + savings + alerts
  const healthScore = useMemo(() => {
    if (monthlySummary.income === 0 && monthlySummary.expense === 0) return null;
    let score = 100;
    if (monthlySummary.income > 0) {
      const ratio = (monthlySummary.expense / monthlySummary.income) * 100;
      if (ratio > 100) score = 20;
      else if (ratio > 90) score = 40;
      else if (ratio > 70) score = 60;
      else if (ratio > 50) score = 80;
      else score = 95;
    } else if (monthlySummary.expense > 0) {
      score = 30;
    }
    if (balance < 0) score = Math.max(10, score - 30);
    return score;
  }, [monthlySummary, balance]);

  // Forecast
  const forecast = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const futureByMonth: Record<string, { income: number; expense: number }> = {};
    for (const tx of allTransactions) {
      const d = parseTxDateToDate(tx.date);
      if (!d) continue;
      const txMonth = d.getMonth();
      const txYear = d.getFullYear();
      if (txYear < currentYear || (txYear === currentYear && txMonth < currentMonth)) continue;
      const key = `${txYear}-${String(txMonth).padStart(2, "0")}`;
      if (!futureByMonth[key]) futureByMonth[key] = { income: 0, expense: 0 };
      if (tx.type === "income") futureByMonth[key].income += Number(tx.amount);
      else futureByMonth[key].expense += Number(tx.amount);
    }
    const months = Object.keys(futureByMonth).sort();
    let runningBalance = balance;
    return months.slice(0, 4).map(key => {
      const [y, m] = key.split("-").map(Number);
      const label = new Date(y, m, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      const data = futureByMonth[key];
      runningBalance = runningBalance + data.income - data.expense;
      return { key, label, year: y, ...data, projected: runningBalance };
    });
  }, [allTransactions, balance]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtShort = (v: number) => {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return v.toFixed(0);
  };

  // Smart alerts: actionable insights for today
  const smartAlerts = useMemo(() => {
    const alerts: { id: string; icon: typeof AlertTriangle; iconColor: string; bg: string; title: string; subtitle: string; to?: "/reminders" | "/goals" | "/transactions" | "/insights" }[] = [];

    // 1. Reminder due in next 3 days
    const today = new Date();
    for (const r of pendingReminders) {
      const d = parseTxDateToDate(r.due_date);
      if (!d) continue;
      const days = differenceInDays(d, today);
      if (days >= 0 && days <= 3) {
        alerts.push({
          id: `rem-${r.id}`,
          icon: Clock,
          iconColor: "text-warning",
          bg: "bg-warning/10",
          title: days === 0 ? `Vence hoje: ${r.title}` : `Vence em ${days} ${days === 1 ? "dia" : "dias"}: ${r.title}`,
          subtitle: `R$ ${fmt(Number(r.amount))}`,
          to: "/reminders",
        });
        break;
      }
    }

    // 3. Goal close to completion (>= 80%)
    for (const g of goals) {
      if (g.target_amount > 0) {
        const pct = (Number(g.current_amount) / Number(g.target_amount)) * 100;
        if (pct >= 80 && pct < 100) {
          alerts.push({
            id: `goal-${g.id}`,
            icon: Sparkles,
            iconColor: "text-primary",
            bg: "bg-primary/10",
            title: `${g.icon} ${g.name}: ${Math.round(pct)}% concluída!`,
            subtitle: `Faltam R$ ${fmt(Number(g.target_amount) - Number(g.current_amount))} para alcançar.`,
            to: "/goals",
          });
          break;
        }
      }
    }

    // 4. No transactions registered today (motivational)
    const hasTodayTx = allTransactions.some(tx => {
      const d = parseTxDateToDate(tx.date);
      return d && isToday(d);
    });
    if (!hasTodayTx && allTransactions.length > 0 && alerts.length < 3) {
      alerts.push({
        id: "no-today",
        icon: Flame,
        iconColor: "text-amber-400",
        bg: "bg-amber-500/10",
        title: "Você ainda não registrou nada hoje",
        subtitle: "Manter o hábito diário melhora seu controle financeiro 🔥",
        to: "/transactions",
      });
    }

    return alerts.slice(0, 3);
  }, [pendingReminders, goals, allTransactions]);

  // Group recent transactions by day
  const groupedTransactions = useMemo(() => {
    const groups: Record<string, { label: string; items: Transaction[] }> = {};
    for (const tx of transactions) {
      
      const d = parseTxDateToDate(tx.date);
      let key: string;
      let label: string;
      if (d && isToday(d)) { key = "1-today"; label = "Hoje"; }
      else if (d && isYesterday(d)) { key = "2-yesterday"; label = "Ontem"; }
      else if (d) {
        const monthsAbbr = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
        const formatted = `${d.getDate()} ${monthsAbbr[d.getMonth()]}`;
        key = `3-${tx.date}`;
        label = formatted;
      }
      else { key = "4-other"; label = "Outros"; }
      if (!groups[key]) groups[key] = { label, items: [] };
      groups[key].items.push(tx);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [transactions]);
  const currentMonthName = new Date().toLocaleDateString("pt-BR", { month: "long" });

  const displayAccounts = useMemo(() => {
    if (!hideZeroBalances) return accountBalances;
    return accountBalances.filter(acc => Math.abs(acc.balance) >= 0.01);
  }, [accountBalances, hideZeroBalances]);

  return (
    <div className="animate-page-enter flex flex-col gap-5 px-4 pt-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <div
            className="flex flex-col leading-none select-none rounded-xl border px-3 py-1.5 mb-1"
            style={{
              borderColor: "hsl(142 95% 55%)",
              boxShadow:
                "0 0 10px hsl(142 95% 55% / 0.9), 0 0 20px hsl(142 95% 55% / 0.6), inset 0 0 6px hsl(142 95% 55% / 0.35)",
            }}
          >
            <span className="text-xl font-extrabold tracking-tight text-primary dark:text-[hsl(142_95%_62%)] dark:[text-shadow:0_0_10px_hsl(142_95%_55%/0.85),0_0_20px_hsl(142_95%_55%/0.55)]">
              cofre <span className="text-primary/80 dark:text-[hsl(142_95%_70%)]">360</span>
            </span>
            <span className="mt-0.5 text-[10px] font-medium tracking-wide text-primary/70 dark:text-[hsl(142_90%_68%)] dark:[text-shadow:0_0_6px_hsl(142_95%_55%/0.65)]">
              Seu dinheiro. Seu controle.
            </span>
          </div>
          {userEmail && (
            <span className="text-[10px] text-muted-foreground px-1 truncate max-w-[150px]">
              {userEmail}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleLogout}
            className="interactive-button flex h-10 w-10 items-center justify-center rounded-full bg-card border"
            style={{
              borderColor: "hsl(142 95% 55%)",
              boxShadow:
                "0 0 10px hsl(142 95% 55% / 0.9), 0 0 20px hsl(142 95% 55% / 0.6), inset 0 0 6px hsl(142 95% 55% / 0.35)",
            }}
            title="Sair"
          >
            <LogOut className="h-5 w-5 text-muted-foreground" />
          </button>
          <Link

            to="/reminders"
            className="interactive-button relative flex h-10 w-10 items-center justify-center rounded-full bg-card border"
            style={{
              borderColor: "hsl(142 95% 55%)",
              boxShadow:
                "0 0 10px hsl(142 95% 55% / 0.9), 0 0 20px hsl(142 95% 55% / 0.6), inset 0 0 6px hsl(142 95% 55% / 0.35)",
            }}
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
            {pendingReminders.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                {pendingReminders.length}
              </span>
            )}
          </Link>
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full bg-card border"
            style={{
              borderColor: "hsl(142 95% 55%)",
              boxShadow:
                "0 0 10px hsl(142 95% 55% / 0.9), 0 0 20px hsl(142 95% 55% / 0.6), inset 0 0 6px hsl(142 95% 55% / 0.35)",
            }}
          >
            <ThemeToggle />
          </div>
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                aria-label="Adicionar transação"
                className="interactive-button flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground border"
                style={{
                  borderColor: "hsl(142 95% 55%)",
                  boxShadow:
                    "0 0 10px hsl(142 95% 55% / 0.9), 0 0 20px hsl(142 95% 55% / 0.6), inset 0 0 6px hsl(142 95% 55% / 0.35)",
                }}
              >
                <Plus className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-2">
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => openQuickAdd("expense")}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent text-left"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                    <Minus className="h-4 w-4" />
                  </span>
                  Despesa
                </button>
                <button
                  type="button"
                  onClick={() => openQuickAdd("income")}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent text-left"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Plus className="h-4 w-4" />
                  </span>
                  Receita
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => openQuickAdd("transfer")}
                      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent text-left w-full group"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/15 text-blue-500 group-hover:bg-blue-500/25 transition-colors">
                        <ArrowLeftRight className="h-4 w-4" />
                      </span>
                      Transf
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center" sideOffset={10}>
                    Transferência
                  </TooltipContent>
                </Tooltip>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Balance Card — refined with health score + daily available */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/15 via-card to-card p-5 border border-border/40">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex flex-col min-w-0">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              Saldo
            </p>
            <p className={cn(
              "text-2xl font-bold tabular-nums transition-all duration-300 truncate",
              balance >= 0 ? "text-foreground" : "text-destructive"
            )}>
              {balanceVisible ? `R$ ${fmt(balance)}` : "R$ ••••••"}
            </p>
          </div>
          
          <div className="flex items-center gap-2 shrink-0 self-end mb-0.5">
            {healthScore !== null && balanceVisible && healthScore >= 40 && (
              <div className={cn(
                "hidden sm:flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                healthScore >= 80 ? "bg-primary/15 text-primary" :
                healthScore >= 60 ? "bg-blue-500/15 text-blue-400" :
                "bg-amber-500/15 text-amber-400"
              )}>
                {healthScore >= 80 ? "Saudável" : healthScore >= 60 ? "Estável" : "Atenção"}
              </div>
            )}
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={() => updateHideZeroBalances(!hideZeroBalances)} 
                    className={cn(
                      "interactive-button p-1.5 rounded-lg hover:bg-accent/50 transition-colors",
                      hideZeroBalances ? "text-primary bg-primary/10" : "text-muted-foreground"
                    )}
                  >
                    {hideZeroBalances ? <FilterX className="h-4 w-4" /> : <Filter className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {hideZeroBalances ? "Exibir contas com saldo zero" : "Ocultar contas com saldo zero"}
                </TooltipContent>
              </Tooltip>
              <button onClick={() => updateBalanceVisible(!balanceVisible)} className="interactive-button p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground">
                {balanceVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Per-account balances */}
        {displayAccounts.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={displayAccounts.map((a) => a.id)} strategy={verticalListSortingStrategy}>
              <div className="mt-3 flex flex-col gap-1">
                {displayAccounts.map((acc) => (
                  <SortableAccountItem key={acc.id} acc={acc} balanceVisible={balanceVisible} fmt={fmt} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Saldo inicial do mês + previsão fim do mês — moved to bottom */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-background/40 px-3 py-2 flex flex-col justify-between min-h-[58px]">
            <p className="text-[10px] text-muted-foreground leading-none mb-1 flex items-center gap-1.5 min-h-[18px]">
              Saldo inicial do mês
            </p>
            <p className={cn(
              "text-sm font-semibold tabular-nums",
              monthInitialBalance >= 0 ? "text-muted-foreground" : "text-destructive"
            )}>
              {balanceVisible ? `R$ ${fmt(monthInitialBalance)}` : "R$ ••••"}
            </p>
          </div>
          <Link
            to="/insights"
            search={{
              ask: `Olha meu saldo previsto para o fim do mês: R$ ${fmt(forecastBalance)} (saldo atual R$ ${fmt(balance)}). Considerando minhas receitas e despesas previstas, parcelas futuras e lembretes pendentes, esse saldo está saudável? Aponte os 3 maiores riscos do mês, sugira ajustes específicos por categoria (ex.: reduzir alimentação, evitar gastos aleatórios) com valores em R$, e diga se algum orçamento já está estourado ou prestes a estourar. Foque em ações práticas para manter ou melhorar esse saldo previsto.`,
            } as any}
            className="interactive-card rounded-xl bg-background/40 px-3 py-2 hover:bg-background/60 transition-colors text-left flex flex-col justify-between min-h-[58px]"
          >
            <p className="text-[10px] text-muted-foreground leading-none mb-1 flex items-center gap-1.5 min-h-[18px]">
              Previsto fim do mês
              <span
                className="inline-flex items-center justify-center rounded-full p-1 bg-background"
                style={{
                  border: "1px solid hsl(142 95% 55%)",
                  boxShadow:
                    "0 0 6px hsl(142 95% 55% / 0.7), 0 0 12px hsl(142 95% 55% / 0.4), inset 0 0 4px hsl(142 95% 55% / 0.3)",
                }}
              >
                <Sparkles className="h-2.5 w-2.5" style={{ color: "hsl(142 95% 55%)" }} />
              </span>
            </p>
            <p className={cn(
              "text-sm font-semibold tabular-nums",
              forecastBalance >= 0 ? "text-muted-foreground" : "text-destructive"
            )}>
              {balanceVisible ? `R$ ${fmt(forecastBalance)}` : "R$ ••••"}
            </p>
          </Link>
        </div>

      </div>



      {/* Recent Transactions — moved to right below balance */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Recentes</h2>
          <Link to="/transactions" preload="intent" search={{ action: undefined, type: undefined } as any} className="text-[10px] font-medium text-primary flex items-center gap-0.5">
            Ver tudo <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
         {loading ? (
           <div className="flex items-center justify-center py-8">
             <Loader2 className="h-5 w-5 animate-spin text-primary" />
           </div>
         ) : transactions.length === 0 ? (
           <EmptyState 
             ref={emptyStateRef}
             onAction={(type) => openQuickAdd(type === "transfer" ? "expense" : type)} 
             title="Nenhuma transação encontrada"
             description="Parece que você ainda não registrou nada este mês. Que tal começar agora?"
           />
         ) : (
           <div ref={transactionsListRef} tabIndex={-1} className="flex flex-col gap-3 focus:outline-none">
            {groupedTransactions.map((group) => (
              <div key={group.label}>
                <div className="flex flex-col gap-1.5">
                  {group.items.map((tx, i) => (
                    <div key={tx.id} className="group/tx-row relative" style={{ animationDelay: `${i * 40}ms` }}>
                      <TransactionItem 
                        {...tx} 
                        card={tx.card ?? undefined} 
                        amount={Number(tx.amount)} 
                        amountVisible={balanceVisible}
                        
                        style={{ animationDelay: `${i * 40}ms` }} 
                        onEdit={() => handleEdit(tx)}
                        onDelete={() => { setDeleteTarget(tx); setDeleteScope("single"); setShowDeleteDialog(true); }}
                        
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {smartAlerts.filter(a => a.id !== "no-today").length > 0 && (
        <div className="flex flex-col gap-2">
          {smartAlerts.filter(a => a.id !== "no-today").map((alert) => {
            const inner = (
              <>
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", alert.bg)}>
                  <alert.icon className={cn("h-4 w-4", alert.iconColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{alert.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{alert.subtitle}</p>
                </div>
                {alert.to && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </>
            );
            const className = "interactive-card flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 border border-border/30";
            if (alert.to) {
              return <Link key={alert.id} to={alert.to} preload="intent" className={className}>{inner}</Link>;
            }
            return <div key={alert.id} className={className}>{inner}</div>;
          })}
        </div>
      )}

      {/* This Month Summary */}
      {balanceVisible && (monthlySummary.income > 0 || monthlySummary.expense > 0) && (
        <div className="rounded-2xl bg-card p-4 border border-border/30">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground capitalize">{currentMonthName}</h2>
            <Link to="/insights" preload="intent" search={{ ask: undefined } as any} className="text-[10px] font-medium text-primary flex items-center gap-0.5">
              Detalhes <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Mini bar comparison */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground w-16">Receita</span>
              <div className="flex-1 h-2 rounded-full bg-accent overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.min(100, monthlySummary.income > 0 ? (monthlySummary.income / Math.max(monthlySummary.income, monthlySummary.expense)) * 100 : 0)}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-primary tabular-nums w-20 text-right">R$ {fmtShort(monthlySummary.income)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground w-16">Despesa</span>
              <div className="flex-1 h-2 rounded-full bg-accent overflow-hidden">
                <div
                  className="h-full rounded-full bg-destructive transition-all duration-500"
                  style={{ width: `${Math.min(100, monthlySummary.expense > 0 ? (monthlySummary.expense / Math.max(monthlySummary.income, monthlySummary.expense)) * 100 : 0)}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-destructive tabular-nums w-20 text-right">R$ {fmtShort(monthlySummary.expense)}</span>
            </div>
          </div>

          {/* Top categories with icons + trend vs previous month */}
          {topCategories.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/30 flex gap-2">
              {topCategories.map(({ cat, amount, prev }) => {
                const trend = prev > 0 ? ((amount - prev) / prev) * 100 : 0;
                const hasTrend = prev > 0;
                const up = trend > 5;
                const down = trend < -5;
                return (
                  <Link
                    key={cat}
                    to="/transactions"
                    preload="intent"
                    search={{ action: undefined, type: undefined, category: cat } as any}
                    className="interactive-card flex-1 rounded-lg bg-accent/50 px-2 py-2 text-center hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center justify-center mb-0.5">
                      <span className="text-base leading-none">{getCategoryIcon(cat)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{cat}</p>
                    <p className="text-xs font-semibold text-foreground tabular-nums">R$ {fmtShort(amount)}</p>
                    {hasTrend && (up || down) && (
                      <div className={cn(
                        "mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-medium",
                        up ? "text-destructive" : "text-primary"
                      )}>
                        {up ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                        {Math.abs(Math.round(trend))}%
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Previsão para os próximos meses (mês atual + próximos 3) */}
      {forecast.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Previsão</h2>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {forecast.slice(0, 4).map((m) => {
              const total = m.income - m.expense;
              return (
                <div key={m.key} className="rounded-xl bg-background/60 px-2 py-2.5 flex flex-col items-center gap-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">{m.label}</p>
                  <div className="w-full flex flex-col gap-0.5">
                    <div className="flex items-center justify-center gap-0.5 text-[10px] tabular-nums text-primary font-medium">
                      <ArrowUpRight className="h-2.5 w-2.5" />
                      {balanceVisible ? fmtShort(m.income) : "•••"}
                    </div>
                    <div className="flex items-center justify-center gap-0.5 text-[10px] tabular-nums text-destructive font-medium">
                      <ArrowDownRight className="h-2.5 w-2.5" />
                      {balanceVisible ? fmtShort(m.expense) : "•••"}
                    </div>
                  </div>
                  <div className="w-full pt-1 border-t border-border/40 flex flex-col items-center">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Total</p>
                    <p className={cn(
                      "text-[11px] font-bold tabular-nums",
                      total >= 0 ? "text-foreground" : "text-destructive"
                    )}>
                      {balanceVisible ? `R$ ${fmtShort(total)}` : "R$ •••"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {/* Upcoming Reminders — compact */}
      {pendingReminders.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-warning" />
              Próximos lembretes
            </h2>
            <Link to="/reminders" className="text-[10px] font-medium text-primary flex items-center gap-0.5">
              Ver todos <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex flex-col gap-1.5">
            {pendingReminders.map((r) => {
              const linkedAccount = r.bank_account_id ? accountBalances.find(a => a.id === r.bank_account_id) : null;
              const linkedCard = r.card_id ? allCards.find(c => c.id === r.card_id) : null;
              // Note: cards are not explicitly loaded into a "cards" state in this component, 
              // but we have cardOptions and bankAccounts. We might need cards too.
              // Looking at fetchAll, cardsRes is fetched but only names are set in cardOptions.
              // I'll need to update fetchAll to get full card objects if we want emojis.
              
              return (
                <Link key={r.id} to="/reminders" className="interactive-card flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 border border-border/20">
                  <span className="text-lg">{r.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                      {linkedAccount && (
                        <div className={cn("flex items-center rounded-md px-1 py-0.5 shadow-sm shrink-0 bg-gradient-to-br", linkedAccount.color)}>
                          <BankLogo icon={linkedAccount.icon || ""} color={linkedAccount.color || ""} name={linkedAccount.name} size="xs" />
                        </div>
                      )}
                      {linkedCard && (
                        <div className={cn("flex items-center rounded-md px-1 py-0.5 shadow-sm shrink-0 bg-gradient-to-br", linkedCard.color)}>
                          <div className="flex h-5 w-5 items-center justify-center rounded-sm bg-white/20 text-[10px]">
                            {linkedCard.emoji || "💳"}
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{(() => { const d = parseTxDateToDate(r.due_date || ""); if (!d) return r.due_date; const m = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"]; return `${d.getDate()} ${m[d.getMonth()]}`; })()}</p>
                  </div>
                <span className={cn(
                  "text-sm font-semibold tabular-nums",
                  r.type === "income" ? "text-primary" : "text-foreground"
                )}>
                  R$ {fmt(Number(r.amount))}
                </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}


      {/* "Você ainda não registrou nada hoje" — moved to end of page */}
      {smartAlerts.filter(a => a.id === "no-today").map((alert) => {
        const inner = (
          <>
            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", alert.bg)}>
              <alert.icon className={cn("h-4 w-4", alert.iconColor)} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{alert.title}</p>
              <p className="text-[11px] text-muted-foreground truncate">{alert.subtitle}</p>
            </div>
            {alert.to && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          </>
        );
        const className = "interactive-card flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 border border-border/30";
        if (alert.to) {
          return <Link key={alert.id} to={alert.to} className={className}>{inner}</Link>;
        }
        return <div key={alert.id} className={className}>{inner}</div>;
      })}

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader><DialogTitle>Editar Transação</DialogTitle></DialogHeader>
          {editTx && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
                <input value={editTx.name} onChange={e => setEditTx({ ...editTx, name: e.target.value })} className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none" />
              </div>
              <Suspense fallback={<div className="h-20 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
                <CategoryPicker
                  value={editTx.category}
                  onChange={(val, icon) => setEditTx({ ...editTx, category: val, icon })}
                  type={editTx.type}
                />
              </Suspense>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Data</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl bg-card border-none", !editTx.date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editTx.date || "Selecionar data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={(() => { try { return parse(editTx.date, "dd MMM", new Date(), { locale: ptBR }); } catch { return undefined; } })()} onSelect={(date) => { if (date) setEditTx({ ...editTx, date: format(date, "dd MMM", { locale: ptBR }) }); }} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Valor (R$)</label>
                <CalculatorAmountInput value={editTx.amount} onChange={v => setEditTx({ ...editTx, amount: v })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
                <div className="flex gap-2">
                  <button onClick={() => setEditTx({ ...editTx, type: "expense", category: "Alimentação > Outros", icon: "🍔" })} className={`flex-1 rounded-xl py-2 text-xs font-medium transition-colors ${editTx.type === "expense" ? "bg-destructive text-destructive-foreground" : "bg-card text-muted-foreground"}`}>Despesa</button>
                  <button onClick={() => setEditTx({ ...editTx, type: "income", category: "Receita > Salário", icon: "💰" })} className={`flex-1 rounded-xl py-2 text-xs font-medium transition-colors ${editTx.type === "income" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>Receita</button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Forma de pagamento</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const firstCard = cardOptions.find(c => c !== "Nenhum") ?? null;
                      setEditTx({ ...editTx, bank_account_id: null, card: editTx.card || firstCard });
                    }}
                    className={`flex-1 rounded-xl py-2 text-xs font-medium transition-colors ${editTx.card ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                  >
                    💳 Cartão (Crédito)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTx({ ...editTx, card: null, bank_account_id: editTx.bank_account_id || (accountBalances[0]?.id ?? null) })}
                    className={`flex-1 rounded-xl py-2 text-xs font-medium transition-colors ${editTx.bank_account_id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                  >
                    🏦 Conta (Débito)
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Alterne entre crédito e débito sem precisar excluir a transação.</p>
              </div>
              {editTx.card !== null && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Cartão de Crédito</label>
                  <select value={editTx.card || ""} onChange={e => setEditTx({ ...editTx, card: e.target.value || null, bank_account_id: null })} className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none">
                    {cardOptions.filter(c => c !== "Nenhum").map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              {editTx.bank_account_id !== null && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Conta Bancária</label>
                  <select value={editTx.bank_account_id || ""} onChange={e => setEditTx({ ...editTx, bank_account_id: e.target.value || null, card: null })} className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none">
                    {accountBalances.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}

              {/* Parcelamento */}
              <div className="rounded-xl bg-card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-foreground">Parcelamento</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Parcela atual</label>
                    <input
                      type="number"
                      min={1}
                      value={editTx.installment_number ?? 1}
                      onChange={e => setEditTx({ ...editTx, installment_number: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full rounded-lg bg-background px-2 py-1.5 text-sm text-foreground outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Total de parcelas</label>
                    <input
                      type="number"
                      min={1}
                      value={editTx.total_installments ?? 1}
                      onChange={e => setEditTx({ ...editTx, total_installments: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full rounded-lg bg-background px-2 py-1.5 text-sm text-foreground outline-none"
                    />
                  </div>
                </div>

                {(editTx.total_installments ?? 1) > 1 && (
                  <>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">Modo de cálculo</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditInstallmentMode("divide")}
                          className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium transition-colors ${editInstallmentMode === "divide" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                        >
                          Dividir total
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditInstallmentMode("fixed")}
                          className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium transition-colors ${editInstallmentMode === "fixed" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                        >
                          Valor por parcela
                        </button>
                      </div>
                    </div>

                    {editInstallmentMode === "divide" ? (
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        O <strong>valor</strong> acima é o total da compra. Cada parcela ficará com{" "}
                        <strong>R$ {((editTx.amount || 0) / Math.max(1, editTx.total_installments ?? 1)).toFixed(2)}</strong>.
                      </p>
                    ) : (
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-1 block">Valor de cada parcela</label>
                        <CalculatorAmountInput
                          value={editInstallmentFixedValue}
                          onChange={v => setEditInstallmentFixedValue(v)}
                        />
                        <p className="text-[10px] text-muted-foreground leading-relaxed mt-1">
                          Total da compra:{" "}
                          <strong>
                            R$ {(editInstallmentFixedValue * (editTx.total_installments ?? 1)).toFixed(2)}
                          </strong>
                        </p>
                      </div>
                    )}
                  </>
                )}

                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Defina o total maior que 1 para parcelar. As parcelas futuras serão criadas nos meses seguintes. Use total = 1 para remover.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader><DialogTitle>Excluir Transação</DialogTitle></DialogHeader>
          {isInstallmentTx(deleteTarget) ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Esta transação faz parte de um parcelamento ({deleteTarget?.installment_number}/{deleteTarget?.total_installments}). O que deseja excluir?
              </p>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-border/50 p-3 hover:bg-accent/50 transition-colors">
                  <input
                    type="radio"
                    name="delete-scope-home"
                    checked={deleteScope === "single"}
                    onChange={() => setDeleteScope("single")}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">Apenas esta parcela</p>
                    <p className="text-xs text-muted-foreground">Exclui só a parcela {deleteTarget?.installment_number}/{deleteTarget?.total_installments}.</p>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-border/50 p-3 hover:bg-accent/50 transition-colors">
                  <input
                    type="radio"
                    name="delete-scope-home"
                    checked={deleteScope === "future"}
                    onChange={() => setDeleteScope("future")}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">Esta e as parcelas futuras</p>
                    <p className="text-xs text-muted-foreground">Exclui da parcela {deleteTarget?.installment_number} em diante.</p>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-border/50 p-3 hover:bg-accent/50 transition-colors">
                  <input
                    type="radio"
                    name="delete-scope-home"
                    checked={deleteScope === "all"}
                    onChange={() => setDeleteScope("all")}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">Todas as parcelas do grupo</p>
                    <p className="text-xs text-muted-foreground">Exclui todas as {deleteTarget?.total_installments} parcelas, inclusive as já passadas.</p>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir esta transação?</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick add transaction dialog (triggered by "+" button on header) */}
      <Suspense fallback={null}>
        {quickAddOpen && (
          <QuickAddTransactionDialog
            open={quickAddOpen}
            onOpenChange={setQuickAddOpen}
            initialType={quickAddType}
            onSuccess={() => { fetchTransactions(); }}
          />
        )}
       </Suspense>
     </div>
   );
 }
 
 export const Route = createFileRoute("/")({
   validateSearch: (search: Record<string, unknown>) => {
     return {
       compare: z.string().optional().catch(undefined).parse(search.compare),
     };
   },
   component: Dashboard,
 });


