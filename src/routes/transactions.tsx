import { createFileRoute } from "@tanstack/react-router";
import { SmartLink as Link } from "@/components/SmartLink";
import { TransactionItem } from "@/components/TransactionItem";
import { EmptyState } from "@/components/EmptyState";
import { mainCategories, parseCategoryValue } from "@/lib/categories";
import { Search, Pencil, Trash2, Plus, CalendarIcon, Loader2, Upload, CheckSquare, Square, X, SlidersHorizontal, ArrowLeftRight, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";

const CsvImportDialog = lazy(() => import("@/components/CsvImportDialog").then(m => ({ default: m.CsvImportDialog })));
const CategoryPieCharts = lazy(() => import("@/components/CategoryPieCharts").then(m => ({ default: m.CategoryPieCharts })));
const CategoryPicker = lazy(() => import("@/components/CategoryPicker").then(m => ({ default: m.CategoryPicker })));
const QuickAddTransactionDialog = lazy(() => import("@/components/QuickAddTransactionDialog").then(m => ({ default: m.QuickAddTransactionDialog })));
import { CalculatorAmountInput } from "@/components/CalculatorAmountInput";
 import { format, parse } from "date-fns";
 import { calculateInstallmentDetails } from "@/lib/installment-utils";
import { ptBR } from "date-fns/locale";
import { cn, normalizeText } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { saveInstallmentPlan, stripInstallmentSuffix } from "@/lib/installment-edit";
import { deleteTransactionScope, isInstallmentTx } from "@/lib/installment-delete";
import { toast } from "sonner";
import { Layers } from "lucide-react";
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
  cardBrand?: string | null;
  bank_account_id?: string | null;
  created_at?: string;
  installment_group_id?: string | null;
  installment_number?: number;
  total_installments?: number;
  is_visible?: boolean;
}

interface BankAccountOption {
  id: string;
  name: string;
  balance?: number;
}

interface CardOption {
  name: string;
  brand: string;
}

const filterCategories = ["Todas", ...mainCategories];
const iconOptions = ["🛵", "🏠", "💰", "🎬", "⛽", "🛒", "💊", "🎮", "💸", "🍕", "🚗", "👕", "📱", "🎵", "✈️", "🏥", "📚", "🐾"];

function TransactionsPage() {
  const searchParams = Route.useSearch();
  const { balanceVisible, updateBalanceVisible } = useUserPreferences();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cardOptions, setCardOptions] = useState<CardOption[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [cardNameToBrand, setCardNameToBrand] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(searchParams.category || "Todas");

  // Sync category from URL search param when it changes
  useEffect(() => {
    if (searchParams.category) setActiveCategory(searchParams.category);
  }, [searchParams.category]);
  const [activeSource, setActiveSource] = useState<"all" | "account" | "card">("all");
  
  
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [deleteScope, setDeleteScope] = useState<"single" | "future" | "all">("single");
   const [showAddDialog, setShowAddDialog] = useState(false); const emptyStateRef = useRef<HTMLDivElement>(null); const listRef = useRef<HTMLDivElement>(null);
   
   
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);
  const [showBatchVisibilityDialog, setShowBatchVisibilityDialog] = useState(false);
  const [pendingVisibility, setPendingVisibility] = useState<boolean | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  // Advanced filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(undefined);
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(undefined);
  const [filterMinAmount, setFilterMinAmount] = useState<string>("");
  const [filterMaxAmount, setFilterMaxAmount] = useState<string>("");
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const todayFormatted = format(new Date(), "dd MMM", { locale: ptBR });
  const [newTx, setNewTx] = useState<Omit<Transaction, "id">>({
    icon: "🍔", name: "", category: "Alimentação > Outros", date: todayFormatted, amount: 0, type: "expense", card: null, bank_account_id: null,
  });
  const [installmentEnabled, setInstallmentEnabled] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(2);
  const [installmentMode, setInstallmentMode] = useState<"divide" | "fixed">("divide");
  const [installmentFixedValue, setInstallmentFixedValue] = useState(0);
  // Edit-installment UI state
  const [editInstallmentMode, setEditInstallmentMode] = useState<"divide" | "fixed">("divide");
  const [editInstallmentFixedValue, setEditInstallmentFixedValue] = useState(0);
  // Transfer state
  const [isTransfer, setIsTransfer] = useState(false);
  const [transferFromId, setTransferFromId] = useState<string>("");
   const [transferToId, setTransferToId] = useState<string>("");
   const [confirmInstallmentDiff, setConfirmInstallmentDiff] = useState(false);
 
   const installmentDetails = calculateInstallmentDetails(
     newTx.amount,
     installmentCount,
     installmentMode,
     installmentFixedValue
   );
   const hasDiff = installmentEnabled && !isTransfer && installmentMode === "divide" && installmentDetails.diff !== 0;
 
   const editInstallmentDetails = editTx ? calculateInstallmentDetails(
     editTx.amount,
     editTx.total_installments ?? 1,
     editInstallmentMode,
     editInstallmentFixedValue
   ) : null;
   const hasEditDiff = !!editTx && (editTx.total_installments ?? 1) > 1 && editInstallmentMode === "divide" && editInstallmentDetails?.diff !== 0;

  // Autocomplete state
  const [showAddSuggestions, setShowAddSuggestions] = useState(false);
  const [showEditSuggestions, setShowEditSuggestions] = useState(false);

  // Build a memory map: normalized name → { icon, category, originalName }
  const txMemory = (() => {
    const map = new Map<string, { icon: string; category: string; name: string }>();
    for (const tx of transactions) {
      // Strip installment suffix like " (1/3)"
      const cleanName = tx.name.replace(/\s*\(\d+\/\d+\)\s*$/, "").trim();
      const key = cleanName.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { icon: tx.icon, category: tx.category, name: cleanName });
      }
    }
    return map;
  })();

  const getAutocompleteSuggestions = (input: string) => {
    if (!input || input.length < 2) return [];
    const q = normalizeText(input);
    const results: { icon: string; category: string; name: string }[] = [];
    for (const [key, val] of txMemory) {
      if (normalizeText(key).includes(q)) results.push(val);
      if (results.length >= 8) break;
    }
    return results;
  };

  const cardNameToBrandRef = useRef<Record<string, string>>({});
  useEffect(() => { cardNameToBrandRef.current = cardNameToBrand; }, [cardNameToBrand]);

  const fetchCards = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("cards").select("name, brand").order("created_at", { ascending: true });
      if (error) throw error;
      
      if (data) {
        const options = data.map(c => ({ name: c.name, brand: c.brand }));
        setCardOptions([{ name: "Nenhum", brand: "" }, ...options]);
        const brandMap: Record<string, string> = {};
        data.forEach(c => { brandMap[c.name] = c.brand; });
        setCardNameToBrand(brandMap);
        cardNameToBrandRef.current = brandMap;
        // Re-map transações já carregadas com o brand atualizado
        setTransactions(prev => prev.map(tx => ({
          ...tx,
          cardBrand: tx.card ? brandMap[tx.card] || null : null,
        })));
      }
    } catch (error: any) {
      console.error("Error fetching cards:", error);
      toast.error("Erro ao carregar cartões: " + (error.message || "Erro desconhecido"));
    }
  }, []);

  const fetchBankAccounts = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("bank_accounts").select("id, name, balance").order("created_at", { ascending: true });
      if (error) throw error;
      if (data) setBankAccounts(data.map(a => ({ id: a.id, name: a.name, balance: a.balance || 0 })));
    } catch (error: any) {
      console.error("Error fetching bank accounts:", error);
      toast.error("Erro ao carregar contas: " + (error.message || "Erro desconhecido"));
    }
  }, []);

  const PAGE_SIZE = 50;
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef = useRef(0);

  const fetchTransactionsPage = useCallback(async (reset = false) => {
    try {
      if (reset) {
        offsetRef.current = 0;
        setHasMore(true);
      }
      const from = reset ? 0 : offsetRef.current;
      const to = from + PAGE_SIZE - 1;
      if (reset) setLoading(true); else setLoadingMore(true);

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      if (data) {
        const brandMap = cardNameToBrandRef.current;
        const txsWithBrand = data.map(tx => ({
          ...tx,
          cardBrand: tx.card ? brandMap[tx.card] || null : null,
        })) as Transaction[];
        setTransactions(prev => reset ? txsWithBrand : [...prev, ...txsWithBrand]);
        offsetRef.current = from + data.length;
        if (data.length < PAGE_SIZE) setHasMore(false);
      }
    } catch (error: any) {
      console.error("Error fetching transactions:", error);
      toast.error("Erro ao carregar transações: " + (error.message || "Erro desconhecido"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const fetchTransactions = useCallback(() => fetchTransactionsPage(true), [fetchTransactionsPage]);

  useEffect(() => {
    fetchTransactions();
    fetchCards();
    fetchBankAccounts();
  }, [fetchTransactions, fetchCards, fetchBankAccounts]);


  useEffect(() => {
    if (searchParams.action === "add") {
      if (searchParams.type === "transfer") {
        setIsTransfer(true);
        setNewTx(prev => ({ ...prev, type: "expense" }));
      } else {
        setIsTransfer(false);
        const txType = searchParams.type === "income" ? "income" : "expense";
        setNewTx(prev => ({ ...prev, type: txType }));
      }
      setShowAddDialog(true);
    }
  }, [searchParams.action, searchParams.type]);

  // Parse "dd MMM" using created_at as the reference year (UTC) to avoid timezone/year drift.
  const parseTxDate = (s: string, refIso?: string): Date | null => {
    if (!s) return null;
    const refYear = refIso ? new Date(refIso).getUTCFullYear() : new Date().getUTCFullYear();
    try {
      const parsed = parse(s, "dd MMM", new Date(Date.UTC(refYear, 0, 1)), { locale: ptBR });
      if (isNaN(parsed.getTime())) return null;
      // Reconstruct in UTC to neutralize local timezone offset.
      return new Date(Date.UTC(refYear, parsed.getMonth(), parsed.getDate()));
    } catch { return null; }
  };

  const toUtcDay = (d: Date, endOfDay = false) =>
    new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0));

  const minAmt = filterMinAmount ? parseFloat(filterMinAmount) : null;
  const maxAmt = filterMaxAmount ? parseFloat(filterMaxAmount) : null;

  const filtered = transactions.filter((tx) => {
    const matchesCategory = activeCategory === "Todas" || tx.category === activeCategory || parseCategoryValue(tx.category).group === activeCategory || (activeCategory === "Transferências" && (tx.category === "Transferência" || tx.category === "Transferências"));
    const matchesSource = activeSource === "all"
      ? true
      : activeSource === "card"
        ? !!tx.card
        : !!tx.bank_account_id && !tx.card;
    const matchesType = filterType === "all" ? true : tx.type === filterType;
    const matchesMin = minAmt === null || Number(tx.amount) >= minAmt;
    const matchesMax = maxAmt === null || Number(tx.amount) <= maxAmt;
    let matchesDate = true;
    if (filterStartDate || filterEndDate) {
      const d = parseTxDate(tx.date, tx.created_at);
      if (!d) matchesDate = false;
      else {
        if (filterStartDate && d.getTime() < toUtcDay(filterStartDate).getTime()) matchesDate = false;
        if (filterEndDate && d.getTime() > toUtcDay(filterEndDate, true).getTime()) matchesDate = false;
      }
    }
    return matchesCategory && matchesSource && matchesType && matchesMin && matchesMax && matchesDate;
  });

  const activeFilterCount = (filterStartDate || filterEndDate ? 1 : 0) + (minAmt !== null || maxAmt !== null ? 1 : 0) + (filterType !== "all" ? 1 : 0);

  const clearAdvancedFilters = () => {
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setFilterMinAmount("");
    setFilterMaxAmount("");
    setFilterType("all");
  };

  const totalIncome = filtered.filter(t => t.type === "income" && t.is_visible !== false).reduce((s, t) => s + t.amount, 0);
  const totalExpense = filtered.filter(t => t.type === "expense" && t.is_visible !== false).reduce((s, t) => s + t.amount, 0);

  const handleEdit = (tx: Transaction) => {
    setEditTx({ ...tx });
    setEditInstallmentMode("divide");
    setEditInstallmentFixedValue(tx.amount || 0);
    setShowEditDialog(true);
  };

   const handleSaveEdit = async () => {
     if (!editTx) return;
 
     if (hasEditDiff && !confirmInstallmentDiff) {
       toast.error("Por favor, confirme o ajuste de centavos no parcelamento.");
       return;
     }
    const total = Math.max(1, Math.floor(editTx.total_installments || 1));
    const current = Math.max(1, Math.min(total, Math.floor(editTx.installment_number || 1)));
    const baseName = stripInstallmentSuffix(editTx.name);
    const finalName = total > 1 ? `${baseName} (${current}/${total})` : baseName;

     // Compute per-installment value
     const { valorParcela: perInstallment } = calculateInstallmentDetails(
       editTx.amount,
       total,
       editInstallmentMode,
       editInstallmentFixedValue
     );

    try {
      // Balance check for expenses from bank accounts
      if (editTx.type === "expense" && editTx.bank_account_id) {
        const acc = bankAccounts.find(a => a.id === editTx.bank_account_id);
        if (acc) {
          const originalTx = transactions.find(t => t.id === editTx.id);
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

      // 1) Update fields on the current row (amount = per-installment when split)
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

      // 2) Apply installment plan (creates/clears group + future rows)
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
          `Parcelamento salvo (${result.futureRowsAdded} parcela${result.futureRowsAdded > 1 ? "s" : ""} futura${result.futureRowsAdded > 1 ? "s" : ""} criada${result.futureRowsAdded > 1 ? "s" : ""})`
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

  const handleToggleVisibility = async (tx: Transaction) => {
    try {
      const newVisibility = tx.is_visible === false ? true : false;
      const idsToUpdate = [tx.id];
      
      if (tx.category === "Transferência" && tx.installment_group_id) {
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
      setTransactions(prev => prev.map(t => 
        idsToUpdate.includes(t.id) ? { ...t, is_visible: newVisibility } : t
      ));
    } catch (error: any) {
      console.error("Error toggling visibility:", error);
      toast.error("Erro ao alterar visibilidade");
    }
  };

  const handleBulkVisibility = (visible: boolean) => {
    if (selectedIds.size === 0) return;
    setPendingVisibility(visible);
    setShowBatchVisibilityDialog(true);
  };

  const confirmBulkVisibility = async () => {
    if (pendingVisibility === null) return;
    const visible = pendingVisibility;
    const count = selectedIds.size;
    
    setDeleting(true);
    setShowBatchVisibilityDialog(false);

    const promise = async () => {
      const ids = Array.from(selectedIds);
      let idsToUpdate = [...ids];

      // Identify selected transfers and find their pairs
      const selectedTxs = transactions.filter(t => selectedIds.has(t.id));
      const transferGroupIds = selectedTxs
        .filter(t => t.category === "Transferência" && t.installment_group_id)
        .map(t => t.installment_group_id) as string[];

      if (transferGroupIds.length > 0) {
        const { data: linkedTxs } = await supabase
          .from("transactions")
          .select("id")
          .in("installment_group_id", transferGroupIds)
          .eq("category", "Transferência");
        
        if (linkedTxs) {
          const linkedIds = linkedTxs.map(l => l.id);
          idsToUpdate = Array.from(new Set([...idsToUpdate, ...linkedIds]));
        }
      }

      const { error } = await supabase
        .from("transactions")
        .update({ is_visible: visible })
        .in("id", idsToUpdate);

      if (error) throw error;

      setTransactions(prev => prev.map(t => 
        idsToUpdate.includes(t.id) ? { ...t, is_visible: visible } : t
      ));
      setSelectedIds(new Set());
      setSelectionMode(false);
      setPendingVisibility(null);
      return idsToUpdate.length;
    };

    toast.promise(promise(), {
      loading: visible ? `Exibindo transações...` : `Ocultando transações...`,
      success: (updatedCount) => `${updatedCount} ${updatedCount === 1 ? "transação atualizada" : "transações atualizadas"} com sucesso`,
      error: "Erro ao atualizar visibilidade das transações",
      finally: () => setDeleting(false)
    });
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


  const formatCurrency = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(t => t.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    
    setDeleting(true);
    const promise = async () => {
      const ids = Array.from(selectedIds);
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const { error } = await supabase.from("transactions").delete().in("id", batch);
        if (error) throw error;
      }
      return count;
    };

    toast.promise(promise(), {
      loading: `Excluindo ${count} transações...`,
      success: (deletedCount) => `${deletedCount} ${deletedCount === 1 ? "transação excluída" : "transações excluídas"} com sucesso`,
      error: "Erro ao excluir transações",
      finally: () => {
        setDeleting(false);
        setShowBatchDeleteDialog(false);
        exitSelectionMode();
        fetchTransactions();
      }
    });
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    await supabase.from("transactions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setDeleting(false);
    setShowDeleteAllDialog(false);
    exitSelectionMode();
    fetchTransactions();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="animate-page-enter flex flex-col gap-4 px-4 pt-6 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Transações</h1>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => updateBalanceVisible(!balanceVisible)} 
            className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-muted-foreground border border-border"
          >
            {balanceVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <div className="flex gap-2">
          {selectionMode ? (
            <>
              <button onClick={toggleSelectAll} className="flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-xs font-medium text-muted-foreground border border-border">
                {selectedIds.size === filtered.length ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                {selectedIds.size === filtered.length ? "Desmarcar" : "Todos"}
              </button>
              {selectedIds.size > 0 && (
                <div className="flex gap-1.5">
                  <button onClick={() => handleBulkVisibility(true)} className="flex h-8 items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 text-xs font-medium border border-primary/20" title="Exibir selecionadas">
                    <Eye className="h-3.5 w-3.5" />
                    {selectedIds.size}
                  </button>
                  <button onClick={() => handleBulkVisibility(false)} className="flex h-8 items-center gap-1.5 rounded-full bg-accent text-muted-foreground px-3 text-xs font-medium border border-border" title="Ocultar selecionadas">
                    <EyeOff className="h-3.5 w-3.5" />
                    {selectedIds.size}
                  </button>
                  <button onClick={() => setShowBatchDeleteDialog(true)} className="flex h-8 items-center gap-1.5 rounded-full bg-destructive px-3 text-xs font-medium text-destructive-foreground">
                    <Trash2 className="h-3.5 w-3.5" />
                    {selectedIds.size}
                  </button>
                </div>
              )}
              <button onClick={exitSelectionMode} className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-muted-foreground border border-border">
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              {transactions.length > 0 && (
                <>
                  <button onClick={() => setShowDeleteAllDialog(true)} className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-destructive" title="Apagar todas">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => setSelectionMode(true)} className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-muted-foreground border border-border" title="Selecionar">
                    <CheckSquare className="h-4 w-4" />
                  </button>
                </>
              )}
              <button onClick={() => { setGlobalSearch(""); setShowGlobalSearch(true); }} className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-muted-foreground border border-border" title="Buscar transação">
                <Search className="h-4 w-4" />
              </button>
              <Popover open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters}>
                <PopoverTrigger asChild>
                  <button className="relative flex h-8 w-8 items-center justify-center rounded-full bg-card text-muted-foreground border border-border" title="Filtros avançados">
                    <SlidersHorizontal className="h-4 w-4" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Filtros avançados</h3>
                    {activeFilterCount > 0 && (
                      <button onClick={clearAdvancedFilters} className="text-[11px] text-primary hover:underline">Limpar</button>
                    )}
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
                    <div className="flex gap-2">
                      {([
                        { key: "all" as const, label: "Todos" },
                        { key: "income" as const, label: "Receita" },
                        { key: "expense" as const, label: "Despesa" },
                      ]).map(opt => (
                        <button
                          key={opt.key}
                          onClick={() => setFilterType(opt.key)}
                          className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${filterType === opt.key ? (opt.key === "expense" ? "bg-destructive text-destructive-foreground" : opt.key === "income" ? "bg-primary text-primary-foreground" : "bg-foreground text-background") : "bg-card text-muted-foreground border border-border"}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Período</label>
                    <div className="flex gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="flex-1 justify-start text-xs font-normal rounded-lg">
                            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                            {filterStartDate ? format(filterStartDate, "dd MMM", { locale: ptBR }) : "Início"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={filterStartDate} onSelect={setFilterStartDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="flex-1 justify-start text-xs font-normal rounded-lg">
                            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                            {filterEndDate ? format(filterEndDate, "dd MMM", { locale: ptBR }) : "Fim"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={filterEndDate} onSelect={setFilterEndDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Faixa de valor (R$)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Mín"
                        value={filterMinAmount}
                        onChange={e => setFilterMinAmount(e.target.value)}
                        className="flex-1 rounded-lg bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none border border-border"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Máx"
                        value={filterMaxAmount}
                        onChange={e => setFilterMaxAmount(e.target.value)}
                        className="flex-1 rounded-lg bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none border border-border"
                      />
                    </div>
                  </div>

                  <Button size="sm" className="w-full rounded-lg" onClick={() => setShowAdvancedFilters(false)}>
                    Aplicar
                  </Button>
                </PopoverContent>
              </Popover>
              <button onClick={() => setShowCsvImport(true)} className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-muted-foreground border border-border" title="Importar CSV">
                <Upload className="h-4 w-4" />
              </button>
              <button onClick={() => setShowAddDialog(true)} className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Plus className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>



      {/* Source filter (default: todas) */}
      <div className="flex gap-2">
        {([
          { key: "account" as const, label: "Conta", icon: "🏦" },
          { key: "card" as const, label: "Cartão", icon: "💳" },
        ]).map((src) => {
          const isActive = activeSource === src.key;
          return (
            <button
              key={src.key}
              onClick={() => setActiveSource(isActive ? "all" : src.key)}
              className={`interactive-button flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-medium transition-colors duration-200 ${isActive ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground border border-border"}`}
            >
              <span>{src.icon}</span>
              {src.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {filterCategories.map((cat) => (
          <button key={cat} onClick={() => setActiveCategory(cat)} className={`interactive-button whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-200 ${activeCategory === cat ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-card p-3">
          <p className="text-[10px] text-muted-foreground">Total receitas</p>
          <p className="text-lg font-bold text-primary tabular-nums">R$ {formatCurrency(totalIncome)}</p>
        </div>
        <div className="rounded-xl bg-card p-3">
          <p className="text-[10px] text-muted-foreground">Total despesas</p>
          <p className="text-lg font-bold text-destructive tabular-nums">R$ {formatCurrency(totalExpense)}</p>
        </div>
      </div>

       <div ref={listRef} tabIndex={-1} className="flex flex-col gap-2 focus:outline-none">
         {filtered.map((tx, i) => (
          <div
            key={tx.id}
            className={`group relative ${selectionMode && selectedIds.has(tx.id) ? "ring-1 ring-primary rounded-xl" : ""}`}
            style={{ animationDelay: `${i * 40}ms` }}
            onClick={selectionMode ? () => toggleSelect(tx.id) : undefined}
          >
            <div className="flex items-center gap-2 group/tx-row">
              {selectionMode && (
                <button className="shrink-0 ml-1" onClick={(e) => { e.stopPropagation(); toggleSelect(tx.id); }}>
                  {selectedIds.has(tx.id) ? (
                    <CheckSquare className="h-5 w-5 text-primary" />
                  ) : (
                    <Square className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>
              )}
              <div className="flex-1 min-w-0">
                <TransactionItem 
                  {...tx} 
                  card={tx.card ?? undefined} 
                  cardBrand={tx.cardBrand ?? undefined} 
                  amount={Number(tx.amount)} 
                  amountVisible={balanceVisible}
                  is_visible={tx.is_visible !== false}
                  style={{ animationDelay: `${i * 40}ms` }} 
                  onEdit={selectionMode ? undefined : () => handleEdit(tx)}
                  onDelete={selectionMode ? undefined : () => { setDeleteTarget(tx); setDeleteScope("single"); setShowDeleteDialog(true); }}
                  onToggleVisibility={selectionMode ? undefined : () => handleToggleVisibility(tx)}
                />
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && !loading && (
          <EmptyState 
            onAction={(type) => {
              if (type === "transfer") {
                setIsTransfer(true);
                setNewTx(prev => ({ ...prev, type: "expense" }));
              } else {
                setIsTransfer(false);
                setNewTx(prev => ({ ...prev, type: type }));
              }
              setShowAddDialog(true);
            }} 
            title="Tudo limpo por aqui"
            description="Nenhuma transação corresponde aos filtros selecionados ou ainda não há registros."
          />
        )}
        {hasMore && (
          <div className="flex items-center justify-center py-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchTransactionsPage(false)}
              disabled={loadingMore}
              className="rounded-xl"
            >
              {loadingMore ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Carregando...</>
              ) : (
                "Ver mais"
              )}
            </Button>
          </div>
        )}
        {!hasMore && transactions.length > 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">Todas as transações foram carregadas</p>
        )}

      </div>

      {/* Pie Charts */}
      <div className="mt-8 mb-8">
        <CategoryPieCharts transactions={filtered} formatCurrency={formatCurrency} />
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="w-[94vw] max-w-[94vw] sm:w-[28rem] sm:max-w-[28rem] rounded-2xl bg-background max-h-[92vh] overflow-hidden p-0 flex flex-col gap-0">
          <DialogHeader className="p-4 pb-2 border-b"><DialogTitle className="text-sm">Editar Transação</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {editTx && (
            <div className="flex flex-col gap-4">
              <div className="relative">
                <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
                <input
                  value={editTx.name}
                  onChange={e => {
                    setEditTx({ ...editTx, name: e.target.value });
                    setShowEditSuggestions(e.target.value.length >= 2);
                  }}
                  onFocus={() => setShowEditSuggestions(editTx.name.length >= 2)}
                  onBlur={() => setTimeout(() => setShowEditSuggestions(false), 200)}
                  className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none"
                />
                {showEditSuggestions && getAutocompleteSuggestions(editTx.name).length > 0 && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-xl bg-popover border border-border shadow-lg max-h-48 overflow-y-auto">
                    {getAutocompleteSuggestions(editTx.name).map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setEditTx({ ...editTx, name: s.name, icon: s.icon, category: s.category });
                          setShowEditSuggestions(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors first:rounded-t-xl last:rounded-b-xl"
                      >
                        <span className="text-base">{s.icon}</span>
                        <span className="flex-1 text-left truncate">{s.name}</span>
                        <span className="text-[10px] text-muted-foreground">{s.category}</span>
                      </button>
                    ))}
                  </div>
                )}
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
                <CalculatorAmountInput 
                  value={editTx.amount} 
                  onChange={(v) => setEditTx({ ...editTx, amount: v })}
                />
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
                    onClick={() => setEditTx({ ...editTx, bank_account_id: null, card: editTx.card || (cardOptions[0]?.name ?? null) })}
                    className={`flex-1 rounded-xl py-2 text-xs font-medium transition-colors ${editTx.card ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                  >
                    💳 Cartão (Crédito)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTx({ ...editTx, card: null, bank_account_id: editTx.bank_account_id || (bankAccounts[0]?.id ?? null) })}
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
                    {cardOptions.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              )}
              {editTx.bank_account_id !== null && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Conta Bancária</label>
                  <select value={editTx.bank_account_id || ""} onChange={e => setEditTx({ ...editTx, bank_account_id: e.target.value || null, card: null })} className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none">
                    {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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

                     {editInstallmentMode === "fixed" && (
                       <div>
                         <label className="text-[10px] text-muted-foreground mb-1 block">Valor de cada parcela</label>
                         <input
                           type="number"
                           step="0.01"
                           min={0}
                           value={editInstallmentFixedValue}
                           onChange={e => setEditInstallmentFixedValue(parseFloat(e.target.value) || 0)}
                           className="w-full rounded-lg bg-background px-2 py-1.5 text-sm text-foreground outline-none"
                         />
                       </div>
                     )}
                     <div className="space-y-1.5 mt-1">
                       <p className="text-[10px] text-muted-foreground leading-relaxed">
                         {editInstallmentDetails?.formattedSummary}
                       </p>
                       {hasEditDiff && (
                         <label className="flex items-center gap-2 cursor-pointer group">
                           <input
                             type="checkbox"
                             checked={confirmInstallmentDiff}
                             onChange={(e) => setConfirmInstallmentDiff(e.target.checked)}
                             className="h-3 w-3 rounded border-gray-300 text-primary focus:ring-primary"
                           />
                           <span className="text-[10px] text-destructive font-medium group-hover:text-destructive/80 transition-colors">
                             Estou ciente do ajuste de R$ {editInstallmentDetails?.diff.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                           </span>
                         </label>
                       )}
                     </div>
                  </>
                )}

                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Defina o total maior que 1 para parcelar. As parcelas futuras serão criadas nos meses seguintes. Use total = 1 para remover o parcelamento.
                </p>
              </div>
            </div>
          )}
          </div>
          <DialogFooter className="p-4 pt-2 border-t mt-0 flex-row gap-2 sm:gap-2">
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => setShowEditDialog(false)}>Cancelar</Button>
            <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleSaveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
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
                    name="delete-scope"
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
                    name="delete-scope"
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
                    name="delete-scope"
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

      {/* Delete All */}
      <Dialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader><DialogTitle>Apagar Todas as Transações</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja apagar <strong>todas</strong> as transações? Essa ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteAllDialog(false)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteAll} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Apagar tudo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Delete */}
      <Dialog open={showBatchDeleteDialog} onOpenChange={setShowBatchDeleteDialog}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader><DialogTitle>Excluir Selecionadas</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Deseja excluir <strong>{selectedIds.size}</strong> transação(ões) selecionada(s)?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchDeleteDialog(false)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleBatchDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Excluir {selectedIds.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Visibility */}
      <Dialog open={showBatchVisibilityDialog} onOpenChange={setShowBatchVisibilityDialog}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader>
            <DialogTitle>Alterar Visibilidade</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Deseja {pendingVisibility ? "exibir" : "ocultar"} <strong>{selectedIds.size}</strong> transação(ões) selecionada(s)?
            </p>
            <p className="text-[11px] text-muted-foreground bg-muted p-2 rounded-lg italic">
              Nota: Transações ocultas não são contabilizadas nos saldos das contas e relatórios.
            </p>
          </div>
          <DialogFooter className="flex-row gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setShowBatchVisibilityDialog(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={confirmBulkVisibility}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add */}
      <Suspense fallback={null}>
        {showAddDialog && (
          <QuickAddTransactionDialog 
            open={showAddDialog} 
            onOpenChange={setShowAddDialog}
            initialType={isTransfer ? "transfer" : (newTx.type as "expense" | "income")}
            onSuccess={fetchTransactions}
          />
        )}
      </Suspense>

      <Suspense fallback={null}>
        {showCsvImport && (
          <CsvImportDialog
            open={showCsvImport}
            onOpenChange={setShowCsvImport}
            bankAccountId={bankAccounts[0]?.id || ""}
            bankAccountName={bankAccounts[0]?.name || ""}
            accounts={bankAccounts}
            onSuccess={fetchTransactions}
          />
        )}
      </Suspense>

      {/* Global search dialog — searches all transactions regardless of date, category, or source */}
      <Dialog open={showGlobalSearch} onOpenChange={setShowGlobalSearch}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>Buscar transação</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                type="text"
                placeholder="Nome, categoria, conta ou cartão..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {globalSearch && (
                <button onClick={() => setGlobalSearch("")} className="text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Pesquisa em todas as transações, ignorando dia, categoria e origem.
            </p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto px-4 pb-4 flex flex-col gap-2">
            {(() => {
              const q = globalSearch.trim().toLowerCase();
              if (!q) return (
                <p className="text-center text-xs text-muted-foreground py-6">Digite para buscar...</p>
              );
              const accountNameById = Object.fromEntries(bankAccounts.map(a => [a.id, a.name.toLowerCase()]));
              const qNormalized = normalizeText(globalSearch);
              const results = transactions.filter(tx => {
                const accountName = tx.bank_account_id ? accountNameById[tx.bank_account_id] || "" : "";
                return (
                  normalizeText(tx.name).includes(qNormalized) ||
                  normalizeText(tx.category).includes(qNormalized) ||
                  normalizeText(tx.card || "").includes(qNormalized) ||
                  normalizeText(accountName).includes(qNormalized) ||
                  normalizeText(tx.date).includes(qNormalized)
                );
              });
              if (results.length === 0) return (
                <p className="text-center text-xs text-muted-foreground py-6">Nenhuma transação encontrada</p>
              );
              return results.map(tx => (
                <button
                  key={tx.id}
                  onClick={() => { setShowGlobalSearch(false); handleEdit(tx); }}
                  className="text-left"
                >
                  <TransactionItem {...tx} card={tx.card ?? undefined} cardBrand={tx.cardBrand ?? undefined} amount={Number(tx.amount)} is_visible={tx.is_visible !== false} amountVisible={balanceVisible} />
                </button>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
 }

 export const Route = createFileRoute("/transactions")({
   head: () => ({
     meta: [
       { title: "Transações — Cofre 360" },
       { name: "description", content: "Veja todas as suas transações" },
     ],
   }),
   validateSearch: (search: Record<string, unknown>) => ({
     action: (search.action as string) || undefined,
     type: (search.type as string) || undefined,
     category: (search.category as string) || undefined,
   }),
   component: TransactionsPage,
 });
