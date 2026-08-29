import { createFileRoute } from "@tanstack/react-router";
import { SmartLink as Link } from "@/components/SmartLink";
import { TransactionItem } from "@/components/TransactionItem";
import { EmptyState } from "@/components/EmptyState";
import { mainCategories, parseCategoryValue } from "@/lib/categories";
import { Search, Pencil, Trash2, Plus, CalendarIcon, Loader2, Upload, CheckSquare, Square, X, SlidersHorizontal, ArrowLeftRight, ArrowRight, Eye, EyeOff, FileText, MoreVertical, GripVertical, ArrowLeft, Landmark } from "lucide-react";
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";

const CsvImportDialog = lazy(() => import("@/components/CsvImportDialog").then(m => ({ default: m.CsvImportDialog })));
const CategoryPieCharts = lazy(() => import("@/components/CategoryPieCharts").then(m => ({ default: m.CategoryPieCharts })));
const CategoryPicker = lazy(() => import("@/components/CategoryPicker").then(m => ({ default: m.CategoryPicker })));
const QuickAddTransactionDialog = lazy(() => import("@/components/QuickAddTransactionDialog").then(m => ({ default: m.QuickAddTransactionDialog })));
import { CalculatorAmountInput } from "@/components/CalculatorAmountInput";
import { BankLogo } from "@/components/BankLogo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

 import { format, parse } from "date-fns";
 import { calculateInstallmentDetails } from "@/lib/installment-utils";
import { ptBR } from "date-fns/locale";
import { cn, normalizeText } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { saveInstallmentPlan, stripInstallmentSuffix, detectInstallmentChanges, splitInstallmentChanges, propagateCosmeticFieldsToGroup } from "@/lib/installment-edit";
import { toDivideMode, toFixedMode, validateInstallmentInputs, changeInstallmentCount } from "@/lib/installment-mode-toggle";
import { deleteTransactionScope, isInstallmentTx } from "@/lib/installment-delete";
import { loadEditDraft, saveEditDraft, clearEditDraft } from "@/lib/edit-transaction-draft";
import { toast } from "sonner";
import { Layers } from "lucide-react";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { mapServerError } from "@/lib/map-server-error";
import { sanitizeTransactionName } from "@/lib/normalize-transaction-name";
import { validateEditedExpenseBalance } from "@/lib/transaction-balance-validation";
import { inferDebitInstallmentContext } from "@/lib/debit-installment-history-sync";



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
  installment_number?: number | null;
  total_installments?: number | null;
  installment_mode?: "divide" | "fixed" | null;
  installment_source_amount?: number | null;
  is_visible?: boolean;
}

interface BankAccountOption {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  balance?: number;
}


interface CardOption {
  name: string;
  brand: string;
}

const filterCategories = ["Todas", ...mainCategories];
const iconOptions = ["🛵", "🏠", "💰", "🎬", "⛽", "🛒", "💊", "🎮", "💸", "🍕", "🚗", "👕", "📱", "🎵", "✈️", "🏥", "📚", "🐾"];

export function TransactionsPage() {
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
  const [activeSource, setActiveSource] = useState<"all" | "account" | "card">(
    searchParams.accountId ? "account" : (localStorage.getItem("transactions_filter_source") as any || "all")
  );
  const [filterAccountId, setFilterAccountId] = useState<string | null>(
    searchParams.accountId || localStorage.getItem("transactions_filter_accountId") || null
  );

  useEffect(() => {
    if (searchParams.accountId) {
      setFilterAccountId(searchParams.accountId);
      setActiveSource("account");
      localStorage.setItem("transactions_filter_accountId", searchParams.accountId);
      localStorage.setItem("transactions_filter_source", "account");
      setShowAdvancedFilters(false);
    }
  }, [searchParams.accountId]);

  useEffect(() => {
    if (filterAccountId) localStorage.setItem("transactions_filter_accountId", filterAccountId);
    else localStorage.removeItem("transactions_filter_accountId");
  }, [filterAccountId]);

  useEffect(() => {
    localStorage.setItem("transactions_filter_source", activeSource);
  }, [activeSource]);
  
  
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [deleteScope, setDeleteScope] = useState<"single" | "future" | "all">("single");
   const [showAddDialog, setShowAddDialog] = useState(false);
   const [quickAddType, setQuickAddType] = useState<"expense" | "income" | "transfer">("expense");
   const [copyTxData, setCopyTxData] = useState<{ name: string; amount: number; category: string; icon: string; card: string | null; bank_account_id: string | null } | null>(null);
   const emptyStateRef = useRef<HTMLDivElement>(null); const listRef = useRef<HTMLDivElement>(null);
   
   
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);
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
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "amount-desc" | "amount-asc" | "installments">("date-desc");
  const todayFormatted = format(new Date(), "dd MMM", { locale: ptBR });
  // Edit-installment UI state
  const [editInstallmentMode, setEditInstallmentMode] = useState<"divide" | "fixed">("divide");
  // Transfer state
  
  const [transferFromId, setTransferFromId] = useState<string>("");
   const [transferToId, setTransferToId] = useState<string>("");
    const [confirmInstallmentDiff, setConfirmInstallmentDiff] = useState(false);
    const [editNameMode, setEditNameMode] = useState<"none" | "text">("none");
    const [showUpdateScopeDialog, setShowUpdateScopeDialog] = useState(false);
    const UPDATE_SCOPE_PREF_KEY = "installment.updateScope.preference";
    const readSavedScope = (): "single" | "all" => {
      if (typeof window === "undefined") return "single";
      const v = window.localStorage.getItem(UPDATE_SCOPE_PREF_KEY);
      return v === "all" ? "all" : "single";
    };
    const [updateScope, setUpdateScope] = useState<"single" | "all">(readSavedScope);
    const [rememberScopeChoice, setRememberScopeChoice] = useState<boolean>(true);
    const [scopeConfirmed, setScopeConfirmed] = useState(false);
    const [scopeChanges, setScopeChanges] = useState<string[]>([]);
 
 
     const editInstallmentDetails = editTx ? calculateInstallmentDetails(
      editInstallmentMode === "fixed" ? 0 : editTx.amount,
      editTx.total_installments ?? 1,
      editInstallmentMode,
      editInstallmentMode === "fixed" ? editTx.amount : 0
    ) : null;
   const hasEditDiff = !!editTx && (editTx.total_installments ?? 1) > 1 && editInstallmentDetails?.diff !== 0;

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
      toast.error(mapServerError(error, "Erro ao carregar cartões"));
    }
  }, []);

  const fetchBankAccounts = useCallback(async () => {
    try {
      const [
        { data: accts, error: acctsError },
        { data: txs, error: txsError }
      ] = await Promise.all([
        supabase.from("bank_accounts").select("id, name, balance").order("created_at", { ascending: true }),
        supabase.from("transactions").select("bank_account_id, amount, type, is_visible").not("bank_account_id", "is", null),
      ]);

      if (acctsError) throw acctsError;
      if (txsError) throw txsError;

      if (accts) {
        const incMap: Record<string, number> = {};
        const expMap: Record<string, number> = {};
        for (const tx of (txs || [])) {
          if (tx.is_visible === false) continue;
          const id = tx.bank_account_id as string;
          if (tx.type === "income") {
            incMap[id] = (incMap[id] || 0) + Number(tx.amount);
          } else {
            expMap[id] = (expMap[id] || 0) + Number(tx.amount);
          }
        }
        setBankAccounts(accts.map(a => ({ 
          id: a.id, 
          name: a.name, 
          icon: a.icon,
          color: a.color,
          balance: Math.round((Number(a.balance) + (incMap[a.id] || 0) - (expMap[a.id] || 0)) * 100) / 100 
        })));

      }
    } catch (error: any) {
      console.error("Error fetching bank accounts:", error);
      toast.error(mapServerError(error, "Erro ao carregar contas"));
    }
  }, []);

  const PAGE_SIZE = 50;
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef = useRef(0);

  const fetchTransactionsPage = useCallback(async (reset = false) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

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
        .eq("user_id", session.user.id) // Ensure we filter by the logged-in user
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
      toast.error(mapServerError(error, "Erro ao carregar transações"));
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
        setQuickAddType("transfer");
      } else {
        setQuickAddType(searchParams.type === "income" ? "income" : "expense");
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
    const matchesAccount = !filterAccountId || tx.bank_account_id === filterAccountId;
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
    return matchesCategory && matchesSource && matchesAccount && matchesType && matchesMin && matchesMax && matchesDate;
  });

  const activeFilterCount = (filterStartDate || filterEndDate ? 1 : 0) + (minAmt !== null || maxAmt !== null ? 1 : 0) + (filterType !== "all" ? 1 : 0) + (sortBy !== "date-desc" ? 1 : 0) + (filterAccountId ? 1 : 0);

  const sortedTransactions = [...filtered].sort((a, b) => {
    if (sortBy === "date-desc") {
      const dateA = parseTxDate(a.date, a.created_at)?.getTime() ?? 0;
      const dateB = parseTxDate(b.date, b.created_at)?.getTime() ?? 0;
      // If dates are equal, sort by created_at desc
      if (dateB === dateA) {
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
      return dateB - dateA;
    }
    if (sortBy === "date-asc") {
      const dateA = parseTxDate(a.date, a.created_at)?.getTime() ?? 0;
      const dateB = parseTxDate(b.date, b.created_at)?.getTime() ?? 0;
      if (dateA === dateB) {
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      }
      return dateA - dateB;
    }
    if (sortBy === "amount-desc") return b.amount - a.amount;
    if (sortBy === "amount-asc") return a.amount - b.amount;
    if (sortBy === "installments") {
      // Primary: group by clean name
      const nameA = stripInstallmentSuffix(a.name).toLowerCase();
      const nameB = stripInstallmentSuffix(b.name).toLowerCase();
      
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      
      // Secondary: different groups with same name should stay together but distinct
      if (a.installment_group_id !== b.installment_group_id) {
        const dateA = parseTxDate(a.date, a.created_at)?.getTime() ?? 0;
        const dateB = parseTxDate(b.date, b.created_at)?.getTime() ?? 0;
        return dateB - dateA;
      }
      
      // Tertiary: installment number
      return (a.installment_number ?? 0) - (b.installment_number ?? 0);
    }
    return 0;
  });

  const clearAdvancedFilters = () => {
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setFilterMinAmount("");
    setFilterMaxAmount("");
    setFilterType("all");
    setSortBy("date-desc");
    setFilterAccountId(null);
    setActiveSource("all");
    localStorage.removeItem("transactions_filter_accountId");
    localStorage.setItem("transactions_filter_source", "all");
  };

  const totalIncome = filtered.filter(t => t.type === "income" && t.is_visible !== false).reduce((s, t) => s + t.amount, 0);
  const totalExpense = filtered.filter(t => t.type === "expense" && t.is_visible !== false).reduce((s, t) => s + t.amount, 0);

  const generatePDF = () => {
    try {
      const doc = new jsPDF();
      const title = "Relatorio de Transacoes - Cofre 360";
      
      doc.setFontSize(18);
      doc.text(title, 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      
      const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");
      doc.text(`Gerado em: ${dateStr}`, 14, 30);

      const tableRows = sortedTransactions.map(tx => [
        tx.date,
        tx.name,
        tx.category,
        tx.type === "income" ? "Receita" : "Despesa",
        `R$ ${tx.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
      ]);

      autoTable(doc, {
        startY: 35,
        head: [["Data", "Nome", "Categoria", "Tipo", "Valor"]],
        body: tableRows,
        theme: "striped",
        headStyles: { fillColor: [26, 26, 46], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });

      const finalY = (doc as any).lastAutoTable.finalY || 40;
      doc.text(`Total Receitas: R$ ${totalIncome.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, 14, finalY + 10);
      doc.text(`Total Despesas: R$ ${totalExpense.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, 14, finalY + 16);
      doc.text(`Saldo: R$ ${(totalIncome - totalExpense).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, 14, finalY + 22);

      doc.save(`transacoes_${format(new Date(), "yyyyMMdd")}.pdf`);
      toast.success("Relatório gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar relatório em PDF");
    }
  };


  const handleEdit = (tx: Transaction) => {
    // Debit rows can originate from a purchase whose credit history still has
    // the authoritative installment context. Reuse only installment metadata;
    // never copy the credit group id or card to the debit transaction.
    const reusedInstallment = inferDebitInstallmentContext(tx, transactions);
    const installmentSeed = reusedInstallment
      ? {
          installment_number: reusedInstallment.installment_number,
          total_installments: reusedInstallment.total_installments,
          installment_mode: reusedInstallment.installment_mode,
          installment_source_amount: reusedInstallment.installment_source_amount,
        }
      : {};
    const effectiveTx = { ...tx, ...installmentSeed };
    const baseAmount = effectiveTx.installment_mode === "divide"
      ? (effectiveTx.installment_source_amount ?? effectiveTx.amount)
      : effectiveTx.amount;
    const baseMode: "divide" | "fixed" = effectiveTx.installment_mode || "divide";
    const draft = loadEditDraft(tx.id);
    if (draft) {
      setEditTx({ ...effectiveTx, amount: baseAmount, ...draft.fields, ...installmentSeed });
      setEditInstallmentMode(reusedInstallment?.installment_mode ?? draft.mode ?? baseMode);
      toast.info("Rascunho da edição anterior restaurado");
    } else {
      setEditTx({ ...effectiveTx, amount: baseAmount });
      setEditInstallmentMode(baseMode);
    }
    setEditNameMode("none");
    setShowEditDialog(true);
  };

  // Autosave edit draft while the edit dialog is open (debounced).
  useEffect(() => {
    if (!showEditDialog || !editTx?.id) return;
    const id = editTx.id;
    const handle = window.setTimeout(() => {
      saveEditDraft(id, {
        fields: {
          amount: editTx.amount,
          total_installments: editTx.total_installments ?? null,
          installment_number: editTx.installment_number ?? null,
          category: editTx.category,
          icon: editTx.icon,
          name: editTx.name,
          date: editTx.date,
          type: editTx.type,
          card: editTx.card ?? null,
          bank_account_id: editTx.bank_account_id ?? null,
        },
        mode: editInstallmentMode,
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [showEditDialog, editTx, editInstallmentMode]);

  const handleCopy = (tx: Transaction) => {
    // Strip installment suffix for the copy
    const cleanName = stripInstallmentSuffix(tx.name);
    setCopyTxData({
      icon: tx.icon,
      name: cleanName,
      category: tx.category,
      amount: tx.amount,
      card: tx.card || null,
      bank_account_id: tx.bank_account_id || null,
    });
    setQuickAddType(tx.category === "Transferência" || tx.category === "Transferências" ? "transfer" : (tx.type === "income" ? "income" : "expense"));
    setShowAddDialog(true);
    toast.success("Dados copiados para nova transação!");
  };

   const handleSaveEdit = async () => {
     if (!editTx) return;
 
     // If it's part of an installment group and we haven't asked for scope yet
     if (editTx.installment_group_id && !scopeConfirmed) {
       const originalTx = transactions.find(t => t.id === editTx.id);
       if (originalTx) {
         const effectiveAmount = editInstallmentMode === "fixed"
           ? editTx.amount
           : (editInstallmentDetails?.valorParcela ?? editTx.amount);
         const changes = detectInstallmentChanges(
           {
             name: originalTx.name,
             amount: originalTx.amount,
             total_installments: originalTx.total_installments,
             category: originalTx.category,
             icon: originalTx.icon,
             date: originalTx.date,
             card: originalTx.card,
             bank_account_id: originalTx.bank_account_id,
           },
           {
             name: editTx.name,
             amount: editTx.amount,
             total_installments: editTx.total_installments,
             category: editTx.category,
             icon: editTx.icon,
             date: editTx.date,
             card: editTx.card,
             bank_account_id: editTx.bank_account_id,
           },
           effectiveAmount,
         );
         const { structural } = splitInstallmentChanges(changes);
         // Only ask about scope for structural changes (name/value/count/date).
         // Cosmetic fields (category/icon/card/account) always propagate to the
         // whole group automatically — they describe the purchase itself.
         if (structural.length > 0) {
           setScopeChanges(structural);
           setShowUpdateScopeDialog(true);
           return;
         }
       }
     }



     if (hasEditDiff && !confirmInstallmentDiff) {
       toast.error("Por favor, confirme o ajuste de centavos no parcelamento.");
       return;
     }
    const editCount = Number(editTx.total_installments ?? 1);
    const editValidationError = validateInstallmentInputs(
      editInstallmentMode,
      editInstallmentMode === "divide" ? editTx.amount : 0,
      editInstallmentMode === "fixed" ? editTx.amount : 0,
      editCount,
    );
    if (editValidationError) {
      toast.error(editValidationError);
      return;
    }

    const total = Math.max(1, Math.floor(Number(editTx.total_installments)));
    const current = Math.max(1, Math.min(total, Math.floor(Number(editTx.installment_number) || 1)));
    const finalName = sanitizeTransactionName(stripInstallmentSuffix(editTx.name));

     // Compute per-installment value
      const { valorParcela: perInstallment } = calculateInstallmentDetails(
        editInstallmentMode === "fixed" ? 0 : editTx.amount,
        total,
        editInstallmentMode,
        editInstallmentMode === "fixed" ? editTx.amount : 0
      );

    try {
      // Balance check for expenses from bank accounts
      if (editTx.type === "expense" && editTx.bank_account_id) {
        const acc = bankAccounts.find(a => a.id === editTx.bank_account_id);
        if (acc) {
          const originalTx = transactions.find(t => t.id === editTx.id);
          const availableBalance = acc.balance || 0;

          const balanceIsValid = !originalTx || validateEditedExpenseBalance({
            originalAmount: originalTx.amount,
            newAmount: perInstallment,
            originalBankAccountId: originalTx.bank_account_id,
            newBankAccountId: editTx.bank_account_id,
            originalType: originalTx.type,
            newType: editTx.type,
            availableBalance,
          });

          if (!balanceIsValid) {
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
        // Preserve a reliable installment context inferred from credit history
        // without joining the debit row to the credit installment group.
        installment_number: total > 1 ? current : (editTx.installment_number ?? 1),
        total_installments: total,
        installment_mode: total > 1 ? editInstallmentMode : (editTx.installment_mode ?? null),
        installment_source_amount: total > 1 ? editTx.amount : (editTx.installment_source_amount ?? null),
      }).eq("id", editTx.id);
      if (updErr) throw updErr;

      // 2) Apply installment plan (creates/clears group + future rows).
      // Debit expenses (no card, no group) have no plan — skip the engine so
      // metadata edits never report "Parcelamento removido".
      const hasInstallmentPlan = !!editTx.card || !!editTx.installment_group_id;
      const result = hasInstallmentPlan
        ? await saveInstallmentPlan({
            id: editTx.id,
            name: finalName,
            icon: editTx.icon,
            category: editTx.category,
            date: editTx.date,
            amount: editTx.amount,
            type: editTx.type,
            card: editTx.card ?? null,
            bank_account_id: editTx.bank_account_id ?? null,
            installment_group_id: editTx.installment_group_id ?? null,
            current,
            total,
            installmentAmount: perInstallment,
            installmentMode: editInstallmentMode,
            installmentSourceAmount: editTx.amount,
            updateAllInGroup: updateScope === "all",
            syncDates: updateScope === "all" && !!scopeChanges.includes("Data"),
          })
        : { cleared: false, futureRowsAdded: 0 };

      // Always propagate cosmetic fields (category/icon/card/account) to all
      // siblings in the group — a purchase's category/card is a property of
      // the whole plan, not of a single installment.
      if (editTx.installment_group_id) {
        const originalTx = transactions.find(t => t.id === editTx.id);
        const cosmeticChanged =
          !originalTx ||
          (originalTx.category || "") !== (editTx.category || "") ||
          (originalTx.icon || "") !== (editTx.icon || "") ||
          (originalTx.card || "") !== (editTx.card || "") ||
          (originalTx.bank_account_id || "") !== (editTx.bank_account_id || "");
        if (cosmeticChanged) {
          await propagateCosmeticFieldsToGroup(editTx.installment_group_id, {
            category: editTx.category,
            icon: editTx.icon,
            card: editTx.card ?? null,
            bank_account_id: editTx.bank_account_id ?? null,
          });
        }
      }

      if (result.cleared) {
        toast.success("Parcelamento removido");
      } else if (result.futureRowsAdded > 0) {
        toast.success(
          `Parcelamento salvo (${result.futureRowsAdded} parcela${result.futureRowsAdded > 1 ? "s" : ""} futura${result.futureRowsAdded > 1 ? "s" : ""} criada${result.futureRowsAdded > 1 ? "s" : ""})`
        );
      } else {
        toast.success("Transação atualizada");
      }
      if (editTx?.id) clearEditDraft(editTx.id);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar transação");
    } finally {
      (document.activeElement as HTMLElement)?.blur();
      setShowEditDialog(false);
      setShowUpdateScopeDialog(false);
      setScopeConfirmed(false);
      // Reload preference (in case another tab/instance changed it) but keep the current session's choice
      setUpdateScope(readSavedScope());
      setEditTx(null);
      fetchTransactions();
      fetchBankAccounts(); // Refresh balances
    }
  };


  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      const { deletedCount } = await deleteTransactionScope(deleteTarget, deleteScope);
      if (deleteTarget?.id) clearEditDraft(deleteTarget.id);
      if (deletedCount > 1) {
        toast.success(`${deletedCount} transações excluídas`);
      } else {
        toast.success("Transação excluída");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao excluir transação");
    } finally {
      (document.activeElement as HTMLElement)?.blur();
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      setDeleteScope("single");
      fetchTransactions();
      fetchBankAccounts(); // Refresh balances
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
        fetchBankAccounts(); // Refresh balances
      }
    });
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
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <Link to="/" className="interactive-button flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-sm hover:bg-accent transition-all">
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </Link>
            {filterAccountId && (
              <Link 
                to="/accounts" 
                className="interactive-button flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-sm hover:bg-accent transition-all"
              >
                <Landmark className="h-5 w-5 text-foreground" />
              </Link>
            )}
            <h1 className="text-xl font-bold text-foreground">Transações</h1>
          </div>
          {filterAccountId && (
            <div className="flex items-center gap-1.5 px-1 animate-fade-in">
              {(() => {
                const acc = bankAccounts.find(a => a.id === filterAccountId);
                if (!acc) return null;
                return (
                  <>
                    <div className="flex items-center gap-2 rounded-full bg-accent/50 px-2.5 py-1 border border-border/50">
                      <BankLogo icon={acc.icon || "custom"} color={acc.color || ""} name={acc.name} size="xs" />
                      <span className="text-xs font-semibold text-muted-foreground truncate max-w-[150px]">{acc.name}</span>
                    </div>
                    <button 
                      onClick={() => {
                        setFilterAccountId(null);
                        localStorage.removeItem("transactions_filter_accountId");
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                      title="Remover filtro de conta"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                );
              })()}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-2">
          {selectionMode ? (
            <>
              <button onClick={toggleSelectAll} className="flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-xs font-medium text-muted-foreground border border-border">
                {selectedIds.size === filtered.length ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                {selectedIds.size === filtered.length ? "Desmarcar" : "Todos"}
              </button>
              {selectedIds.size > 0 && (
                <div className="flex gap-1.5">
                  <button onClick={() => setShowBatchDeleteDialog(true)} className="flex h-8 items-center gap-1.5 rounded-full bg-destructive px-3 text-xs font-medium text-destructive-foreground">
                    <Trash2 className="h-3.5 w-3.5" />
                    {selectedIds.size}
                  </button>
                </div>
              )}
              <button onClick={exitSelectionMode} aria-label="Sair do modo de seleção" title="Sair do modo de seleção" className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-muted-foreground border border-border">
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              {transactions.length > 0 && (
                <>
                  <button onClick={() => setSelectionMode(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-muted-foreground border border-border shadow-sm hover:bg-accent transition-all" title="Selecionar">
                    <CheckSquare className="h-5 w-5" />
                  </button>
                </>
              )}
              <button onClick={() => { setGlobalSearch(""); setShowGlobalSearch(true); }} className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-muted-foreground border border-border shadow-sm hover:bg-accent transition-all" title="Buscar transação">
                <Search className="h-5 w-5" />
              </button>
              <Popover open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters}>
                <PopoverTrigger asChild>
                  <button className="relative flex h-10 w-10 items-center justify-center rounded-full bg-card text-muted-foreground border border-border shadow-sm hover:bg-accent transition-all" title="Filtros avançados">
                    <SlidersHorizontal className="h-5 w-5" />
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
                    <label className="text-xs text-muted-foreground mb-1 block">Ordenar por</label>
                    <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                      <SelectTrigger className="w-full rounded-lg bg-card border border-border h-9 text-xs">
                        <SelectValue placeholder="Ordenar por" />
                      </SelectTrigger>
                      <SelectContent className="z-[70]">
                        <SelectItem value="date-desc" className="text-xs">Data (Mais recente)</SelectItem>
                        <SelectItem value="date-asc" className="text-xs">Data (Mais antiga)</SelectItem>
                        <SelectItem value="amount-desc" className="text-xs">Valor (Maior)</SelectItem>
                        <SelectItem value="amount-asc" className="text-xs">Valor (Menor)</SelectItem>
                        <SelectItem value="installments" className="text-xs">Sequência de Parcelas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Faixa de valor (R$)</label>
                    <div className="flex gap-2">
                       <CalculatorAmountInput
                         value={parseFloat(filterMinAmount) || 0}
                         onChange={v => setFilterMinAmount(v.toString())}
                         className="flex-1"
                       />
                       <CalculatorAmountInput
                         value={parseFloat(filterMaxAmount) || 0}
                         onChange={v => setFilterMaxAmount(v.toString())}
                         className="flex-1"
                       />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Conta Bancária</label>
                    <Select value={filterAccountId || "all"} onValueChange={(v) => setFilterAccountId(v === "all" ? null : v)}>
                      <SelectTrigger className="w-full rounded-lg bg-card border border-border h-9 text-xs">
                        <SelectValue placeholder="Todas as contas" />
                      </SelectTrigger>
                      <SelectContent className="z-[70]">
                        <SelectItem value="all" className="text-xs">Todas as contas</SelectItem>
                        {bankAccounts.map(acc => (
                          <SelectItem key={acc.id} value={acc.id} className="text-xs">{acc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button size="sm" className="w-full rounded-lg" onClick={() => setShowAdvancedFilters(false)}>
                    Aplicar
                  </Button>
                </PopoverContent>
              </Popover>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-muted-foreground border border-border shadow-sm hover:bg-accent transition-all" aria-label="Mais ações" title="Mais ações">
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl">
                  <DropdownMenuItem onClick={generatePDF} className="cursor-pointer">
                    <FileText className="h-4 w-4 mr-2" />
                    Gerar relatório PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowCsvImport(true)} className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-2" />
                    Importar CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <button 
                onClick={() => updateBalanceVisible(!balanceVisible)} 
                className="interactive-button flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-sm hover:bg-accent transition-all"
                title={balanceVisible ? "Ocultar saldos" : "Mostrar saldos"}
              >
                {balanceVisible ? <Eye className="h-5 w-5 text-muted-foreground" /> : <EyeOff className="h-5 w-5 text-muted-foreground" />}
              </button>

              <button onClick={() => setShowAddDialog(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground border border-primary/20 shadow-lg hover:brightness-110 transition-all">
                <Plus className="h-5 w-5" />
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
        <div className="rounded-xl bg-card p-3 text-left">
          <p className="text-[10px] text-muted-foreground">Total receitas</p>
          <p className="text-lg font-bold text-primary tabular-nums">R$ {formatCurrency(totalIncome)}</p>
        </div>
        <div className="rounded-xl bg-card p-3 text-right">
          <p className="text-[10px] text-muted-foreground">Total despesas</p>
          <p className="text-lg font-bold text-destructive tabular-nums">R$ {formatCurrency(totalExpense)}</p>
        </div>
      </div>


       <div ref={listRef} tabIndex={-1} className="flex flex-col gap-2 focus:outline-none">
         {sortedTransactions.map((tx, i) => (
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
                  style={{ animationDelay: `${i * 40}ms` }} 
                  onEdit={selectionMode ? undefined : () => handleEdit(tx)}
                  onDelete={selectionMode ? undefined : () => { setDeleteTarget(tx); setDeleteScope("single"); setShowDeleteDialog(true); }}
                  
                />
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && !loading && (
          <EmptyState 
            onAction={(type) => {
              setQuickAddType(type);
              setCopyTxData(null);
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
        <CategoryPieCharts
          transactions={filtered}
          formatCurrency={formatCurrency}
          activeCategory={activeCategory}
          onCategoryClick={(cat) => {
            setActiveCategory(cat);
            if (typeof window !== "undefined") {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        />
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="fixed inset-x-3 left-auto right-auto top-1/2 w-auto max-w-none -translate-y-1/2 translate-x-0 sm:left-1/2 sm:right-auto sm:w-[28rem] sm:max-w-[28rem] sm:-translate-x-1/2 rounded-2xl bg-background max-h-[88dvh] overflow-hidden p-0 flex flex-col gap-0">
          <DialogHeader className="p-4 pb-2 border-b"><DialogTitle className="text-sm">Editar Transação</DialogTitle></DialogHeader>
          <div className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto p-4 flex flex-col gap-4">
          {editTx && (
            <div className="flex min-w-0 flex-col gap-4">
              <div className="relative min-w-0">
                <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
                <input
                  autoFocus
                  inputMode={editNameMode}
                  value={editTx.name}
                  onChange={e => {
                    let name = e.target.value;
                    if (name.length > 0) {
                      name = name.charAt(0).toUpperCase() + name.slice(1);
                    }
                    setEditTx({ ...editTx, name });
                    setShowEditSuggestions(name.length >= 2);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const categoryButton = document.querySelector('button[aria-label="Selecionar categoria"]') as HTMLButtonElement;
                      if (categoryButton) {
                        categoryButton.focus();
                      }
                    }
                  }}
                  onBlur={() => {
                    setEditNameMode("none");
                    setTimeout(() => setShowEditSuggestions(false), 200);
                  }}
                  onClick={(e) => {
                    const target = e.currentTarget;
                    setEditNameMode("text");
                    setTimeout(() => target.focus(), 0);
                  }}
                  onFocus={() => setShowEditSuggestions(editTx.name.length >= 2)}
                  className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/30"
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
                  <PopoverContent className="w-auto p-0 z-[60]" align="start" sideOffset={4}>

                    <Calendar mode="single" selected={(() => { try { return parse(editTx.date, "dd MMM", new Date(), { locale: ptBR }); } catch { return undefined; } })()} onSelect={(date) => { if (date) setEditTx({ ...editTx, date: format(date, "dd MMM", { locale: ptBR }) }); }} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Valor (R$)</label>
                <CalculatorAmountInput 
                  value={editTx.amount} 
                  onChange={(v) => {
                    setEditTx({ ...editTx, amount: v });
                  }}  
                  autoFocus={false}
                  className={editTx.type === "expense" && !(editTx.category === "Transferência" || editTx.category === "Transferências" || editTx.category?.startsWith("Transferências >")) ? "text-destructive" : editTx.type === "income" && !(editTx.category === "Transferência" || editTx.category === "Transferências" || editTx.category?.startsWith("Transferências >")) ? "text-primary" : "text-foreground"}

                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
                <div className="grid min-w-0 grid-cols-2 gap-2">
                  <button onClick={() => setEditTx({ ...editTx, type: "expense", category: "Alimentação > Outros", icon: "🍔" })} className={`min-w-0 rounded-xl px-2 py-2 text-xs font-medium transition-colors ${editTx.type === "expense" ? "bg-destructive text-destructive-foreground" : "bg-card text-muted-foreground"}`}>Despesa</button>
                  <button onClick={() => setEditTx({ ...editTx, type: "income", category: "Receita > Salário", icon: "💰" })} className={`min-w-0 rounded-xl px-2 py-2 text-xs font-medium transition-colors ${editTx.type === "income" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>Receita</button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Forma de pagamento</label>
                <div className="grid min-w-0 grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditTx({ ...editTx, bank_account_id: null, card: editTx.card || (cardOptions[0]?.name ?? null) })}
                    className={`min-w-0 rounded-xl px-2 py-2 text-[11px] leading-tight font-medium transition-colors ${editTx.card ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                  >
                    💳 Cartão (Crédito)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTx({ ...editTx, card: null, bank_account_id: editTx.bank_account_id || (bankAccounts[0]?.id ?? null) })}
                    className={`min-w-0 rounded-xl px-2 py-2 text-[11px] leading-tight font-medium transition-colors ${editTx.bank_account_id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                  >
                    🏦 Conta (Débito)
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Alterne entre crédito e débito sem precisar excluir a transação.</p>
              </div>
              {editTx.card !== null && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Cartão de Crédito</label>
                  <select 
                    value={editTx.card || ""} 
                    onChange={e => setEditTx({ ...editTx, card: e.target.value || null, bank_account_id: null })} 
                    className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/30"
                  >
                    {cardOptions.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              )}
              {editTx.bank_account_id !== null && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Conta Bancária</label>
                  <Select value={editTx.bank_account_id || ""} onValueChange={(v) => setEditTx({ ...editTx, bank_account_id: v || null, card: null })}>
                    <SelectTrigger className="w-full rounded-xl bg-card border-none h-10 text-sm">
                      <SelectValue placeholder="Selecionar conta">
                        {editTx.bank_account_id && (() => {
                          const acc = bankAccounts.find(a => a.id === editTx.bank_account_id);
                          if (!acc) return "Selecionar conta";
                          return (
                            <div className="flex items-center gap-2 min-w-0">
                              <BankLogo icon={acc.icon || "custom"} color={acc.color || "from-gray-500 to-gray-700"} name={acc.name} size="xs" />
                              <span className="truncate">{acc.name}</span>
                            </div>
                          );
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map(a => (
                        <SelectItem key={a.id} value={a.id} className="text-sm">
                          <div className="flex items-center gap-2">
                            <BankLogo icon={a.icon || "custom"} color={a.color || "from-gray-500 to-gray-700"} name={a.name} size="xs" />
                            <span>{a.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}



              {/* Parcelamento — apenas para despesas no cartão de crédito */}
              {!editTx.card ? (
                <div className="rounded-xl bg-card p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Parcelamento indisponível</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Esta transação foi lançada em conta (débito). O parcelamento está disponível apenas para despesas no cartão de crédito.
                  </p>
                </div>
              ) : (
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
                      onChange={e => {
                        const val = e.target.value;
                        setEditTx({ ...editTx, installment_number: val === "" ? null : Math.max(1, parseInt(val) || 1) });
                      }}
                      className="w-full rounded-lg bg-background px-2 py-1.5 text-sm text-foreground outline-none border border-border focus:border-primary/50"
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <label className="text-[10px] text-muted-foreground mb-1 block">Total de parcelas</label>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 24].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            const prevCount = Math.max(1, Number(editTx.total_installments) || 1);
                            const next = changeInstallmentCount({
                              mode: editInstallmentMode,
                              amount: editTx.amount,
                              prevCount,
                              newCount: n,
                            });
                            setEditTx({ ...editTx, total_installments: n, amount: next.amount });
                          }}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] font-medium transition-colors border",
                            Number(editTx.total_installments) === n 
                              ? "bg-primary text-primary-foreground border-primary" 
                              : "bg-background text-muted-foreground border-border hover:border-primary/50"
                          )}
                        >
                          {n}x
                        </button>
                      ))}
                    </div>
                    <div className="flex-1">
                      <label className="text-[9px] text-muted-foreground mb-0.5 block italic">Ou digite outro valor</label>
                      <input
                        type="number"
                        min={1}
                        value={editTx.total_installments ?? 1}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === "") {
                            setEditTx({ ...editTx, total_installments: null });
                            return;
                          }
                          const newCount = Math.max(1, parseInt(val) || 1);
                          const prevCount = Math.max(1, Number(editTx.total_installments) || 1);
                          const next = changeInstallmentCount({
                            mode: editInstallmentMode,
                            amount: editTx.amount,
                            prevCount,
                            newCount,
                          });
                          setEditTx({ ...editTx, total_installments: newCount, amount: next.amount });
                        }}
                        className="w-full rounded-lg bg-background px-2 py-1.5 text-sm text-foreground outline-none border border-border focus:border-primary/50"
                      />
                    </div>
                  </div>
                </div>

                {(Number(editTx.total_installments) || 1) > 1 && (
                  <>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">Modo de cálculo</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!editTx || editInstallmentMode === "divide") return;
                            const count = Number(editTx.total_installments) || 1;
                            const next = toDivideMode({
                              fromMode: "fixed",
                              amount: editTx.amount,
                              fixedValue: editTx.amount,
                              count,
                            });
                            setEditTx({ ...editTx, amount: next.amount });
                            setEditInstallmentMode("divide");
                          }}
                          className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium transition-colors ${editInstallmentMode === "divide" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                        >
                          Dividir total
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!editTx || editInstallmentMode === "fixed") return;
                            const count = Number(editTx.total_installments) || 1;
                            const next = toFixedMode({
                              fromMode: "divide",
                              amount: editTx.amount,
                              fixedValue: 0,
                              count,
                            });
                            setEditTx({ ...editTx, amount: next.amount });
                            setEditInstallmentMode("fixed");
                          }}
                          className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium transition-colors ${editInstallmentMode === "fixed" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                        >
                          Valor por parcela
                        </button>

                      </div>
                    </div>

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
              )}

            </div>
          )}
          </div>
          <DialogFooter className="p-4 pt-2 border-t mt-0 flex-row gap-2 sm:gap-2">
            <Button variant="outline" size="sm" className="flex-1 h-10 text-xs rounded-xl" onClick={() => { (document.activeElement as HTMLElement)?.blur(); setShowEditDialog(false); }}>Cancelar</Button>
            <Button size="sm" className="flex-1 h-10 text-xs rounded-xl font-bold" onClick={handleSaveEdit}>Salvar alterações</Button>
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
      
      {/* Update Scope Selection (Single vs All installments) */}
      <Dialog open={showUpdateScopeDialog} onOpenChange={(open) => {
        if (!open) {
          setShowUpdateScopeDialog(false);
        }
      }}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader>
            <DialogTitle>Aplicar em quais parcelas?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Você alterou uma transação parcelada. Deseja aplicar as alterações apenas nesta parcela ou em todas as demais? Categoria e ícone são propagados juntos quando você escolhe "Todas as parcelas do grupo".
            </p>
            {scopeChanges.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">Alterações detectadas:</p>
                <div className="flex flex-wrap gap-1.5">
                  {scopeChanges.map((c) => (
                    <span key={c} className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-2">
              <Button 
                variant={updateScope === "single" ? "default" : "outline"}
                className="justify-start h-auto py-3 px-4 flex flex-col items-start gap-1"
                onClick={() => setUpdateScope("single")}
              >
                <span className="font-semibold text-sm">Apenas esta parcela</span>
                <span className="text-xs opacity-70">Altera somente o lançamento selecionado</span>
              </Button>
              <Button 
                variant={updateScope === "all" ? "default" : "outline"}
                className="justify-start h-auto py-3 px-4 flex flex-col items-start gap-1"
                onClick={() => setUpdateScope("all")}
              >
                <span className="font-semibold text-sm">Todas as parcelas do grupo</span>
                <span className="text-xs opacity-70">Atualiza todo o grupo de parcelas</span>
              </Button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={rememberScopeChoice}
                onChange={(e) => setRememberScopeChoice(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-xs text-muted-foreground">
                Lembrar minha escolha nos próximos envios
              </span>
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => {
              setShowUpdateScopeDialog(false);
            }}>Cancelar</Button>
            <Button onClick={() => {
              if (rememberScopeChoice && typeof window !== "undefined") {
                window.localStorage.setItem(UPDATE_SCOPE_PREF_KEY, updateScope);
              }
              setScopeConfirmed(true);
              setShowUpdateScopeDialog(false);
              // handleSaveEdit will now proceed because scopeConfirmed=true
              setTimeout(() => { handleSaveEdit(); }, 0);
            }}>Confirmar e Salvar</Button>
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


      {/* Add */}
      <Suspense fallback={null}>
        {showAddDialog && (
          <QuickAddTransactionDialog 
            open={showAddDialog} 
            onOpenChange={setShowAddDialog}
            initialType={quickAddType}
            initialCardName={searchParams.card}
            initialDate={searchParams.date}
            copyData={copyTxData}
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
     accountId: (search.accountId as string) || undefined,
     card: (search.card as string) || undefined,
     date: (search.date as string) || undefined,
   }),
   component: TransactionsPage,
 });
