import { createFileRoute } from "@tanstack/react-router";
import { SmartLink as Link } from "@/components/SmartLink";
import { ArrowLeft, Plus, CreditCard, Trash2, X, Check, Loader2, Wallet, Landmark, ChevronLeft, ChevronRight, Receipt, FileUp, GripVertical, Layers, Pencil, MoreVertical, Eye, EyeOff, Copy, AlertCircle, CheckCircle2, Info, Search, SlidersHorizontal, CalendarIcon, Trash, ChevronDown, ChevronUp } from "lucide-react";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

const PdfInvoiceImportDialog = lazy(() => import("@/components/PdfInvoiceImportDialog").then(m => ({ default: m.PdfInvoiceImportDialog })));
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { deleteTransactionScope, isInstallmentTx } from "@/lib/installment-delete";
import { CategoryPicker } from "@/components/CategoryPicker";
import { CalculatorAmountInput } from "@/components/CalculatorAmountInput";
import { CardBrand, brandPresets } from "@/components/CardBrand";
import { BankLogo, bankPresets } from "@/components/BankLogo";
import { cn, normalizeText } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";


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


type CardData = {
  id: string;
  name: string;
  last_four: string | number | null;
  brand: string;
  card_limit: number;
  used: number;
  color: string | null;
  emoji: string | null;
  closing_day: number | null;
  due_day: number | null;
  is_visible: boolean | null;
};

type BankAccount = {
  id: string;
  name: string;
  balance: number;
  icon: string | null;
  color: string | null;
};

type PaymentLine = {
  accountId: string;
  amount: string;
};

import { groupByBillingCycle, parseTxDate, getCycleDates, type CardTransaction, type InvoicePeriod } from "@/lib/invoice-utils";

const colorOptions = [
  { label: "Roxo", value: "from-purple-600 to-purple-900", emoji: "🟣" },
  { label: "Laranja", value: "from-orange-500 to-orange-700", emoji: "🟠" },
  { label: "Preto", value: "from-gray-700 to-gray-900", emoji: "⚫" },
  { label: "Azul", value: "from-blue-500 to-blue-800", emoji: "🔵" },
  { label: "Azul Marinho", value: "from-blue-900 to-blue-950", emoji: "🌑" },
  { label: "Ciano", value: "from-cyan-400 to-cyan-600", emoji: "💎" },
  { label: "Verde", value: "from-green-500 to-green-800", emoji: "🟢" },
  { label: "Verde Escuro", value: "from-green-800 to-green-950", emoji: "🌲" },
  { label: "Vermelho", value: "from-red-500 to-red-800", emoji: "🔴" },
  { label: "Amarelo", value: "from-yellow-400 to-yellow-600", emoji: "🟡" },
  { label: "Rosa", value: "from-pink-400 to-pink-700", emoji: "🌸" },
  { label: "Índigo", value: "from-indigo-600 to-indigo-900", emoji: "🌌" },
  { label: "Teal", value: "from-teal-500 to-teal-800", emoji: "🌊" },
  { label: "Dourado", value: "from-yellow-600 to-amber-900", emoji: "📀" },
  { label: "Prateado", value: "from-slate-300 to-slate-500", emoji: "🥈" },
];




function SortableCardWrapper({ id, children, animationDelay }: { id: string; children: React.ReactNode; animationDelay: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    animationDelay: `${animationDelay}ms`,
    touchAction: "manipulation" as const,
  } as React.CSSProperties;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "animate-stagger-in cursor-grab active:cursor-grabbing relative select-none",
        isDragging && "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-2xl shadow-2xl scale-[1.02] transition-transform",
      )}
    >
      {children}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/30 backdrop-blur-[1px] animate-fade-in">
          <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-gray-900 shadow-lg ring-2 ring-primary">
            <GripVertical className="h-4 w-4" />
            Mover cartão
          </div>
        </div>
      )}
    </div>
  );
 }

 export const Route = createFileRoute("/cards")({
   head: () => ({
     meta: [
       { title: "Cartões — Cofre 360" },
       { name: "description", content: "Gerencie seus cartões" },
     ],
   }),
   validateSearch: (search: Record<string, unknown>) => ({
     action: (search.action as string) || undefined,
   }),
   component: CardsPage,
 });
function CardsPage() {
  const { balanceVisible, updateBalanceVisible } = useUserPreferences();
  const [cards, setCards] = useState<CardData[]>([]);
  const [cardTotals, setCardTotals] = useState<Record<string, number>>({});
  const [cardPayments, setCardPayments] = useState<Record<string, number>>({});
  const [cardPaymentsByPeriod, setCardPaymentsByPeriod] = useState<Record<string, Record<string, number>>>({});
  const [cardDetailedPaymentsByPeriod, setCardDetailedPaymentsByPeriod] = useState<Record<string, Record<string, { amount: number, date: string }[]>>>({});
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
   
   

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editLimit, setEditLimit] = useState("");
  const [editClosing, setEditClosing] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editColor, setEditColor] = useState("");

  // Invoice dialog state
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invoiceCard, setInvoiceCard] = useState<CardData | null>(null);
  const [cardTransactions, setCardTransactions] = useState<CardTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [activeInvoiceIdx, setActiveInvoiceIdx] = useState(0);

  // Installment edit dialog (add parcelamento to an existing card transaction)
  const [installmentTx, setInstallmentTx] = useState<CardTransaction | null>(null);
  const [installmentDialogOpen, setInstallmentDialogOpen] = useState(false);
  const [installmentCurrent, setInstallmentCurrent] = useState("1");
  const [installmentTotal, setInstallmentTotal] = useState("2");
  const [installmentSaving, setInstallmentSaving] = useState(false);

  // Add card form (dialog only for new cards)
  const [formName, setFormName] = useState("");
  const [formNumber, setFormNumber] = useState("");
  const [formBrand, setFormBrand] = useState("Mastercard");
  const [formLimit, setFormLimit] = useState("");
  const [formUsed, setFormUsed] = useState("");
  const [formColor, setFormColor] = useState(colorOptions[0].value);
  const [formClosingDay, setFormClosingDay] = useState("1");
  const [formDueDay, setFormDueDay] = useState("10");

  // Payment dialog
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payingCard, setPayingCard] = useState<CardData | null>(null);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([{ accountId: "", amount: "" }]);
  const [payingSaving, setPayingSaving] = useState(false);
  const [paymentDate, setPaymentDate] = useState<string>(format(new Date(), "dd MMM", { locale: ptBR }));

  // PDF invoice import dialog
  const [pdfImportOpen, setPdfImportOpen] = useState(false);
  const [pdfImportCard, setPdfImportCard] = useState<CardData | null>(null);

  // Transaction Edit/Delete state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editTx, setEditTx] = useState<CardTransaction | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CardTransaction | null>(null);
  const [deleteScope, setDeleteScope] = useState<"single" | "future" | "all">("single");
  const [editNameMode, setEditNameMode] = useState<"none" | "text">("none");
  const [showEditSuggestions, setShowEditSuggestions] = useState(false);
  const [editInstallmentMode, setEditInstallmentMode] = useState<"divide" | "fixed">("divide");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showInvoiceDetails, setShowInvoiceDetails] = useState(false);

  const [activeTab, setActiveTab] = useState("list");


  // Drag-and-drop sensors — pressionar 1s (mouse e toque) inicia a ordenação
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 1000, tolerance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 1000, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = cards.findIndex((c) => c.id === active.id);
    const newIndex = cards.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(cards, oldIndex, newIndex);
    setCards(reordered);
    // Persist new order
    const updates = reordered.map((c, idx) =>
      supabase.from("cards").update({ sort_order: idx }).eq("id", c.id)
    );
    const results = await Promise.all(updates);
    const failed = results.some((r) => r.error);
    if (failed) {
      toast.error("Erro ao salvar nova ordem");
      fetchAll();
    }
  }, [cards]);

  const fetchAll = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {

      const [cardsRes, txRes, accountsRes, paymentsRes, allTxRes] = await Promise.all([
        supabase.from("cards").select("*").eq("user_id", session.user.id).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("transactions").select("id, name, amount, date, created_at, card, icon, category, type, total_installments, installment_number, installment_group_id").eq("user_id", session.user.id).not("card", "is", null),
        supabase.from("bank_accounts").select("*").eq("user_id", session.user.id).order("created_at", { ascending: true }),
        supabase.from("card_payments").select("card_id, amount, paid_at").eq("user_id", session.user.id),
        supabase.from("transactions").select("bank_account_id, amount, type, is_visible").eq("user_id", session.user.id).not("bank_account_id", "is", null),
      ]);

      if (cardsRes.error) throw cardsRes.error;
      if (accountsRes.error) throw accountsRes.error;
      if (txRes.error) throw txRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      if (cardsRes.data) setCards(cardsRes.data);
      if (accountsRes.data) {
        const incomeByAccount: Record<string, number> = {};
        const expenseByAccount: Record<string, number> = {};
        (allTxRes.data || []).forEach(tx => {
          if (tx.is_visible === false) return;
          const id = tx.bank_account_id!;
          if (tx.type === "income") incomeByAccount[id] = (incomeByAccount[id] || 0) + (tx.amount || 0);
          else expenseByAccount[id] = (expenseByAccount[id] || 0) + (tx.amount || 0);
        });

        setBankAccounts(accountsRes.data.map(a => ({
          ...a,
          balance: Math.round(((a.balance || 0) + (incomeByAccount[a.id] || 0) - (expenseByAccount[a.id] || 0)) * 100) / 100
        })));
      }
      if (txRes.data) {
        const totals: Record<string, number> = {};
        for (const tx of txRes.data) {
          if (tx.card) {
            const amount = Number(tx.amount);
            totals[tx.card] = (totals[tx.card] || 0) + (tx.type === "income" ? -amount : amount);
          }
        }
        setCardTotals(totals);
        setCardTransactions(txRes.data as CardTransaction[]);
      }
      if (paymentsRes.data) {
        const paid: Record<string, number> = {};
        const paidByPeriod: Record<string, Record<string, number>> = {};
        const detailedPaidByPeriod: Record<string, Record<string, { amount: number, date: string }[]>> = {};
        
        for (const p of paymentsRes.data) {
          paid[p.card_id] = (paid[p.card_id] || 0) + Number(p.amount);
          
          if (p.paid_at) {
            const card = cardsRes.data?.find(c => c.id === p.card_id);
            if (card) {
              const billingDate = new Date(p.paid_at);
              // Use the same cycle logic as groupByBillingCycle so payments map
              // to the "Atual" period (its endDate / next closing).
              const { currentClose } = getCycleDates(billingDate, card.closing_day || 1, card.due_day || 10);
              const periodKey = currentClose.toISOString().split("T")[0];

              if (!paidByPeriod[p.card_id]) paidByPeriod[p.card_id] = {};
              if (!detailedPaidByPeriod[p.card_id]) detailedPaidByPeriod[p.card_id] = {};

              paidByPeriod[p.card_id][periodKey] = (paidByPeriod[p.card_id][periodKey] || 0) + Number(p.amount);
              if (!detailedPaidByPeriod[p.card_id][periodKey]) detailedPaidByPeriod[p.card_id][periodKey] = [];
              detailedPaidByPeriod[p.card_id][periodKey].push({ amount: Number(p.amount), date: p.paid_at });
            }
          }
        }
        setCardPayments(paid);
        setCardPaymentsByPeriod(paidByPeriod);
        setCardDetailedPaymentsByPeriod(detailedPaidByPeriod);
      }
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error("Erro ao carregar dados: " + (error.message || "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    
    // Subscribe to real-time updates for relevant tables
    const channel = supabase
      .channel("cards-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cards" },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "card_payments" },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bank_accounts" },
        () => fetchAll()
      )
      .subscribe();

    const onFocus = () => {
      fetchAll();
    };
    window.addEventListener("focus", onFocus);
    
    return () => {
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const searchParams = Route.useSearch();
  useEffect(() => {
    if (searchParams.action === "add") {
      openAddDialog();
    }
  }, [searchParams.action]);

  const openAddDialog = () => {
    setFormName("");
    setFormNumber("");
    setFormBrand("Mastercard");
    setFormLimit("");
    setFormUsed("");
    setFormColor(colorOptions[0].value);
    setFormClosingDay("1");
    setFormDueDay("10");
    setDialogOpen(true);
  };

  const handleAdd = async () => {
    try {
      const last4 = formNumber.slice(-4).padStart(4, "0");
      const emoji = colorOptions.find((c) => c.value === formColor)?.emoji || "💳";
      const { error } = await supabase.from("cards").insert({
        name: formName.trim() || "Novo Cartão",
        last_four: last4,
        brand: formBrand,
        card_limit: parseFloat(formLimit) || 0,
        used: parseFloat(formUsed) || 0,
        color: formColor,
        emoji,
        closing_day: parseInt(formClosingDay) || 1,
        due_day: parseInt(formDueDay) || 10,
      });
      if (error) throw error;
      setDialogOpen(false);
      fetchAll();
      toast.success("Cartão adicionado com sucesso");
    } catch (error: any) {
      console.error("Error adding card:", error);
      toast.error("Erro ao adicionar cartão: " + (error.message || "Erro desconhecido"));
    }
  };

  // Inline edit
  const startEdit = (card: CardData) => {
    setEditingId(card.id);
    setEditName(card.name);
    setEditBrand(card.brand);
    setEditLimit(card.card_limit.toString());
    setEditClosing(card.closing_day?.toString() || "");
    setEditDue(card.due_day?.toString() || "");
    setEditColor(card.color || colorOptions[0].value);
  };

  const saveEdit = async (id: string) => {
    try {
      const { error } = await supabase.from("cards").update({
        name: editName.trim() || "Cartão",
        brand: editBrand || "custom",
        card_limit: parseFloat(editLimit) || 0,
        closing_day: parseInt(editClosing) || 1,
        due_day: parseInt(editDue) || 10,
        color: editColor,
        emoji: colorOptions.find((c) => c.value === editColor)?.emoji || "💳",
      }).eq("id", id);
      if (error) throw error;
      setEditingId(null);
      toast.success("Cartão atualizado");
      fetchAll();
    } catch (error: any) {
      console.error("Error updating card:", error);
      toast.error("Erro ao atualizar cartão: " + (error.message || "Erro desconhecido"));
    }
  };

  const cancelEdit = () => setEditingId(null);

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("cards").delete().eq("id", id);
      if (error) throw error;
      setDeleteConfirm(null);
      fetchAll();
      toast.success("Cartão excluído");
    } catch (error: any) {
      console.error("Error deleting card:", error);
      toast.error("Erro ao excluir cartão: " + (error.message || "Erro desconhecido"));
    }
  };

  const handleToggleVisibility = async (id: string, current: boolean | null) => {
    try {
      const { error } = await supabase.from("cards").update({ is_visible: !current }).eq("id", id);
      if (error) throw error;
      fetchAll();
      toast.success(current ? "Cartão ocultado da página inicial" : "Cartão agora visível na página inicial");
    } catch (error: any) {
      console.error("Error toggling visibility:", error);
      toast.error("Erro ao alterar visibilidade");
    }
  };

  // Open invoice dialog
  const openInvoiceDialog = async (card: CardData) => {
    setInvoiceCard(card);
    setInvoiceDialogOpen(true);
    setActiveInvoiceIdx(0);
    setLoadingTx(true);
    // Refresh payments / totals so "PAGO" and "COMPOSIÇÃO DA FATURA"
    // always reflect the latest card_payments and transactions.
    fetchAll();
    try {
      // Filter transactions by card.name to ensure they belong to the specific card
      const { data, error } = await supabase
        .from("transactions")
        .select("id, name, icon, category, date, amount, type, card, created_at, total_installments, installment_number, installment_group_id")
        .eq("card", card.name)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCardTransactions((data as CardTransaction[]) || []);
    } catch (error: any) {
      console.error("Error fetching card transactions:", error);
      toast.error("Erro ao carregar transações do cartão");
    } finally {
      setLoadingTx(false);
    }
  };

  const invoicePeriods = invoiceCard
    ? groupByBillingCycle(cardTransactions.filter(tx => tx.card === invoiceCard.name), invoiceCard.closing_day, invoiceCard.due_day)
    : [];
  const activePeriod = (invoicePeriods[activeInvoiceIdx] || invoicePeriods[0]) ? {
    ...(invoicePeriods[activeInvoiceIdx] || invoicePeriods[0]),
    label: (invoicePeriods[activeInvoiceIdx] || invoicePeriods[0])?.label.split("|")[0]
  } : null;
  const activePeriodKey = activePeriod?.endDate?.toISOString().split("T")[0];
  const activePeriodPayments = (invoiceCard && activePeriodKey) ? cardDetailedPaymentsByPeriod[invoiceCard.id]?.[activePeriodKey] || [] : [];


  // Open installment edit dialog for a specific transaction
  const openInstallmentDialog = (tx: CardTransaction) => {
    setInstallmentTx(tx);
    setInstallmentCurrent(String(tx.installment_number || 1));
    setInstallmentTotal(String(Math.max(2, tx.total_installments || 2)));
    setInstallmentDialogOpen(true);
  };

  const addMonthsIso = (isoDate: string, months: number): string => {
    // Try ISO; if it's a "DD mmm" string, use parseTxDate to get a Date
    let base: Date;
    if (/^\d{4}-\d{2}-\d{2}/.test(isoDate)) {
      const [y, m, d] = isoDate.split("T")[0].split("-").map(Number);
      base = new Date(Date.UTC(y, (m || 1) - 1 + months, 1));
      const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
      const day = Math.min(d || 1, lastDay);
      const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${base.getUTCFullYear()}-${mm}-${dd}`;
    }
    base = parseTxDate(isoDate, new Date().toISOString());
    const target = new Date(Date.UTC(base.getFullYear(), base.getMonth() + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    const day = Math.min(base.getDate(), lastDay);
    const mm = String(target.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${target.getUTCFullYear()}-${mm}-${dd}`;
  };

  const stripInstallmentSuffix = (name: string): string =>
    name.replace(/\s*\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)\s*$/, "").trim();

  const handleSaveInstallment = async () => {
    if (!installmentTx || !invoiceCard) return;
    const total = parseInt(installmentTotal);
    const current = parseInt(installmentCurrent);
    if (!isFinite(total) || !isFinite(current) || total < 1 || current < 1 || current > total) {
      toast.error("Parcelas inválidas");
      return;
    }

    setInstallmentSaving(true);
    try {
      const baseName = stripInstallmentSuffix(installmentTx.name);
      // If single (total=1), strip group and reset numbers
      if (total === 1) {
        const { error } = await supabase
          .from("transactions")
          .update({
            name: baseName,
            installment_number: 1,
            total_installments: 1,
            installment_group_id: null,
          })
          .eq("id", installmentTx.id);
        if (error) throw error;
        toast.success("Parcelamento removido");
      } else {
        const groupId =
          installmentTx.installment_group_id ||
          (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

        // Update current row
        const { error: updErr } = await supabase
          .from("transactions")
          .update({
            name: `${baseName} (${current}/${total})`,
            installment_number: current,
            total_installments: total,
            installment_group_id: groupId,
          })
          .eq("id", installmentTx.id);
        if (updErr) throw updErr;

        // Fetch existing siblings in the same group to avoid duplicates
        const { data: siblings } = await supabase
          .from("transactions")
          .select("installment_number")
          .eq("installment_group_id", groupId);
        const present = new Set<number>((siblings || []).map((s: any) => s.installment_number));
        present.add(current);

        // Insert future installments
        const toInsert: Array<{
          name: string;
          icon: string;
          category: string;
          date: string;
          amount: number;
          type: string;
          card: string;
          installment_number: number;
          total_installments: number;
          installment_group_id: string;
        }> = [];
        for (let n = current + 1; n <= total; n++) {
          if (present.has(n)) continue;
          const months = n - current;
          toInsert.push({
            name: `${baseName} (${n}/${total})`,
            icon: installmentTx.icon || "🍔",
            category: installmentTx.category,
            date: addMonthsIso(installmentTx.date, months),
            amount: installmentTx.amount,
            type: installmentTx.type,
            card: invoiceCard.name,
            installment_number: n,
            total_installments: total,
            installment_group_id: groupId,
          });
        }

        if (toInsert.length > 0) {
          const { error: insErr } = await supabase.from("transactions").insert(toInsert);
          if (insErr) throw insErr;
        }
        toast.success(
          toInsert.length > 0
            ? `Parcelamento criado (${toInsert.length} parcela${toInsert.length > 1 ? "s" : ""} futura${toInsert.length > 1 ? "s" : ""})`
            : "Parcelamento atualizado"
        );
      }

      setInstallmentDialogOpen(false);
      setInstallmentTx(null);
      // Refresh invoice list
      await openInvoiceDialog(invoiceCard);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar parcelamento");
    } finally {
      setInstallmentSaving(false);
    }
  };

  const [txHistory, setTxHistory] = useState<Map<string, { icon: string; category: string }>>(new Map());
  const fetchHistory = useCallback(async () => {
    const { data } = await supabase
      .from("transactions")
      .select("name, icon, category")
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) {
      const map = new Map<string, { icon: string; category: string }>();
      data.forEach(tx => {
        const cleanName = tx.name.replace(/\s*\(\d+\/\d+\)\s*$/, "").trim().toLowerCase();
        if (!map.has(cleanName)) {
          map.set(cleanName, { icon: tx.icon || "🍔", category: tx.category });
        }
      });
      setTxHistory(map);
    }
  }, []);

  const getAutocompleteSuggestions = (input: string) => {
    if (!input || input.length < 2) return [];
    const q = normalizeText(input);
    const results: { icon: string; category: string; name: string }[] = [];
    for (const [key, val] of txHistory) {
      if (normalizeText(key).includes(q)) results.push({ ...val, name: key });
      if (results.length >= 8) break;
    }
    return results;
  };

  useEffect(() => {
    if (invoiceDialogOpen) fetchHistory();
  }, [invoiceDialogOpen, fetchHistory]);

  const handleEditTx = (tx: CardTransaction) => {
    setEditTx({ ...tx });
    setShowEditDialog(true);
  };

  const saveEditTx = async () => {
    if (!editTx) return;
    setIsSavingEdit(true);
    try {
      const { error } = await supabase
        .from("transactions")
        .update({
          name: editTx.name,
          category: editTx.category,
          icon: editTx.icon,
          date: editTx.date,
          amount: editTx.amount,
        })
        .eq("id", editTx.id);
      
      if (error) throw error;
      
      toast.success("Transação atualizada com sucesso");
      setShowEditDialog(false);
      // Refresh transactions for the card
      if (invoiceCard) openInvoiceDialog(invoiceCard);
      fetchAll();
    } catch (error: any) {
      console.error("Error updating transaction:", error);
      toast.error("Erro ao atualizar transação");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteTx = (tx: CardTransaction) => {
    setDeleteTarget(tx);
    setDeleteScope("single");
    setShowDeleteDialog(true);
  };

  const confirmDeleteTx = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteTransactionScope(deleteTarget, deleteScope);
      toast.success("Transação excluída com sucesso");
      setShowDeleteDialog(false);
      // Refresh transactions for the card
      if (invoiceCard) openInvoiceDialog(invoiceCard);
      fetchAll();
    } catch (error: any) {
      console.error("Error deleting transaction:", error);
      toast.error("Erro ao excluir transação");
    } finally {
      setIsDeleting(false);
    }
  };

   // Payment logic
   const openPayDialog = async (card: CardData, periodIdx?: number) => {
     setPayingCard(card);
     setInvoiceCard(card); // Ensure invoicePeriods is for this card
     setPaymentLines([{ accountId: "", amount: "" }]);
     setPaymentDate(format(new Date(), "dd MMM", { locale: ptBR }));
     
     if (periodIdx !== undefined) {
       setActiveInvoiceIdx(periodIdx);
     } else {
       // Default to current invoice
       setActiveInvoiceIdx(0); 
     }

     setPayDialogOpen(true);
     
     // Recalculate everything to ensure fresh data
     await fetchAll();

     // Fetch transactions to ensure invoicePeriods is populated and accurate
     setLoadingTx(true);
     try {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, name, icon, category, date, amount, type, card, created_at, total_installments, installment_number, installment_group_id")
        .eq("card", card.name)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCardTransactions((data as CardTransaction[]) || []);
     } catch (error: any) {
       console.error("Error fetching card transactions for payment:", error);
     } finally {
       setLoadingTx(false);
     }
   };

  const updatePaymentLine = (index: number, field: keyof PaymentLine, value: string) => {
    setPaymentLines((prev) => prev.map((line, i) => i === index ? { ...line, [field]: value } : line));
  };
  const addPaymentLine = () => setPaymentLines((prev) => [...prev, { accountId: "", amount: "" }]);
  const removePaymentLine = (index: number) => setPaymentLines((prev) => prev.filter((_, i) => i !== index));
  const paymentTotal = paymentLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

  const handlePay = async () => {
    if (!payingCard) return;
    const validLines = paymentLines.filter((l) => l.accountId && parseFloat(l.amount) > 0);
    if (validLines.length === 0) return;
    setPayingSaving(true);
    try {
      // Re-fetch transactions for this specific card to ensure invoice is up to date
      const { data: latestTxs, error: txError } = await supabase
        .from("transactions")
        .select("id, name, icon, category, date, amount, type, card, created_at, total_installments, installment_number, installment_group_id")
        .eq("card", payingCard.name)
        .order("created_at", { ascending: false });

      if (txError) throw txError;
      
      // Update local state and trigger re-calculation of invoicePeriods
      const txs = (latestTxs as CardTransaction[]) || [];
      setCardTransactions(txs);
      const updatedPeriods = groupByBillingCycle(txs, payingCard.closing_day, payingCard.due_day);
      const activePeriod = updatedPeriods[activeInvoiceIdx];
      
      const totalInvoice = activePeriod?.total || 0;

      // Anti-inconsistency check
      const currentDisplayedTotal = invoicePeriods[activeInvoiceIdx]?.total || 0;
      if (Math.abs(totalInvoice - currentDisplayedTotal) > 0.01) {
        toast.error("O valor da fatura mudou durante o processo. Por favor, confira os valores atualizados antes de pagar.", {
          duration: 5000,
          icon: <AlertCircle className="h-5 w-5 text-destructive" />
        });
        setPayingSaving(false);
        return;
      }

      const currentPeriodKey = activePeriod?.endDate?.toISOString().split("T")[0];
      const paidInThisPeriod = currentPeriodKey ? cardPaymentsByPeriod[payingCard.id]?.[currentPeriodKey] || 0 : 0;
      const remainingBeforeThis = Math.max(0, totalInvoice - paidInThisPeriod);

      const isTotalPayment = Math.abs(paymentTotal - remainingBeforeThis) < 0.01;
      
      const paymentName = isTotalPayment 
        ? `Pagamento Total fatura cartão ${payingCard.name}` 
        : `Pagamento Parcial fatura cartão ${payingCard.name}`;

       const today = new Date();
       const monthsAbbr = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
       const dateFormatted = paymentDate;

       // 1. Create card_payments records
       const inserts = validLines.map((l) => ({
         card_id: payingCard.id,
         bank_account_id: l.accountId,
         amount: parseFloat(l.amount),
         paid_at: (() => {
           try {
             const parsed = parse(paymentDate, "dd MMM", new Date(), { locale: ptBR });
             return parsed.toISOString();
           } catch {
             return new Date().toISOString();
           }
         })()
       }));
      await supabase.from("card_payments").insert(inserts);

      // 2. Update bank balances and create expense transactions
      for (const line of validLines) {
        const account = bankAccounts.find((a) => a.id === line.accountId);
        const amount = parseFloat(line.amount);
        if (account) {
          // The application uses a virtual balance system: virtual_balance = account.balance + total_income - total_expenses
          // The current `account.balance` in the component already reflects this virtual balance.
          // Since we are about to create a new expense transaction of `amount`, it will automatically be subtracted 
          // from the virtual balance during the next `fetchAll()`. 
          // Therefore, we MUST NOT subtract the amount from the `bank_accounts.balance` column in the DB, 
          // as that would result in a double deduction (once in the base balance and once in the transactions).
          // We only update the updated_at timestamp or keep the balance as is.
          // await supabase.from("bank_accounts").update({ balance: account.balance - amount }).eq("id", line.accountId);
          
          // Create transaction for history/debiting from reports
          const { error: txInsError } = await supabase.from("transactions").insert({
            name: paymentName,
            amount: amount,
            type: "expense",
            category: "Pagamento de Cartão",
            icon: "💳",
            date: dateFormatted,
            bank_account_id: line.accountId,
            created_at: new Date().toISOString()
          });
          
          if (txInsError) throw txInsError;
        }
      }
      
      toast.success(`${paymentName} de R$ ${paymentTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} realizado!`);
      setPayDialogOpen(false);
      
      // Force immediate re-fetch of everything to update status indicators
      await fetchAll();
      
      // Update specific card transactions to ensure they are consistent in all views
      const { data: updatedTxs } = await supabase
        .from("transactions")
        .select("id, name, icon, category, date, amount, type, card, created_at, total_installments, installment_number, installment_group_id")
        .eq("card", payingCard.name)
        .order("created_at", { ascending: false });
      
      if (updatedTxs) {
        setCardTransactions((updatedTxs as CardTransaction[]) || []);
      }
    } catch (error) {
      console.error("Payment error:", error);
      toast.error("Erro ao processar pagamento");
    } finally {
      setPayingSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const totalAllInvoices = cards.reduce((sum, c) => {
    const used = (cardTotals[c.name] || 0) + (c.used || 0);
    const paid = cardPayments[c.id] || 0;
    return sum + Math.max(0, used - paid);
  }, 0);
  const totalLimit = cards.reduce((sum, c) => sum + (c.card_limit || 0), 0);
  const totalAvailable = Math.max(0, totalLimit - totalAllInvoices);

  return (
    <div className="animate-page-enter flex flex-col gap-5 px-4 pt-6 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="interactive-button flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-sm hover:bg-accent transition-all">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground tracking-tight">Cartões</h1>
            <p className="text-[10px] text-muted-foreground leading-none">{cards.length} {cards.length === 1 ? "cartão" : "cartões"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => updateBalanceVisible(!balanceVisible)} 
            className="interactive-button flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-sm hover:bg-accent transition-all"
            title={balanceVisible ? "Ocultar saldos" : "Mostrar saldos"}
          >
            {balanceVisible ? <Eye className="h-5 w-5 text-muted-foreground" /> : <EyeOff className="h-5 w-5 text-muted-foreground" />}
          </button>
          <button 
            onClick={openAddDialog} 
            className="interactive-button flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground border border-primary/20 shadow-lg hover:brightness-110 transition-all"
            title="Adicionar cartão"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">


        <TabsContent value="list" className="mt-5 space-y-5">
          {cards.length > 0 && (
            <div className="grid grid-cols-2 gap-3 animate-stagger-in">
              <div className="rounded-2xl bg-card border border-border/50 p-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fatura total</p>
                <p className="mt-1 text-lg font-bold text-foreground tabular-nums">
                  {balanceVisible ? `R$ ${totalAllInvoices.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "••••••"}
                </p>
              </div>
              <div className="rounded-2xl bg-card border border-border/50 p-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Limite disponível</p>
                <p className="mt-1 text-lg font-bold text-primary tabular-nums">
                  {balanceVisible ? `R$ ${totalAvailable.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "••••••"}
                </p>
              </div>
            </div>
          )}

          {cards.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl bg-card border border-dashed border-border/50">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                <CreditCard className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">Nenhum cartão ainda</p>
              <p className="text-xs text-muted-foreground mt-1">Adicione seu primeiro cartão abaixo</p>
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-4">
                {cards.map((card, i) => {
      const cardTransactionsFiltered = cardTransactions.filter(t => t.card === card.name);
      const invoicePeriodsCard = groupByBillingCycle(cardTransactionsFiltered, card.closing_day, card.due_day);
      const currentPeriod = invoicePeriodsCard.find(p => p.key === "current") || invoicePeriodsCard[1] || invoicePeriodsCard[0];
      const activeInvoicePeriod = currentPeriod ? {
        ...currentPeriod,
        label: currentPeriod.label.split("|")[0]
      } : null;
      const invoiceRemaining = activeInvoicePeriod?.total || 0;
      const totalUsed = cardTotals[card.name] || 0;
      const initialUsed = card.used || 0;
      const totalPaid = cardPayments[card.id] || 0;
      
      const periodKeyForPayment = currentPeriod?.endDate?.toISOString().split("T")[0];
      const paidThisPeriod = periodKeyForPayment ? (cardPaymentsByPeriod[card.id]?.[periodKeyForPayment] || 0) : 0;
      const outstandingBalance = Math.max(0, (totalUsed + initialUsed) - totalPaid);
      const pct = card.card_limit > 0 ? Math.round((outstandingBalance / card.card_limit) * 100) : 0;
      const isEditing = editingId === card.id;
      const today = new Date();
      const todayDay = today.getDate();
      const invoiceClosed = todayDay > card.closing_day;
      const isPaid = totalUsed > 0 && invoiceRemaining === 0;
      // Compute due date of current invoice (next due_day after today)
      const currentDue = new Date(today.getFullYear(), today.getMonth(), card.due_day);
      if (currentDue < today) currentDue.setMonth(currentDue.getMonth() + 1);
      // Compute closing date of current invoice (next closing_day after today)
      const currentClose = new Date(today.getFullYear(), today.getMonth(), card.closing_day);
      if (currentClose < today) currentClose.setMonth(currentClose.getMonth() + 1);
      // Next invoice due date (one month after current)
      const nextDue = new Date(currentDue.getFullYear(), currentDue.getMonth() + 1, card.due_day);
      const formatDueDate = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      void nextDue; void isPaid; void invoiceClosed;
          return (
            <SortableCardWrapper key={card.id} id={card.id} animationDelay={60 + i * 80}>
              <div className={cn(
                "rounded-2xl shadow-md shadow-black/5 overflow-hidden border border-border/40 transition-all duration-300 bg-gradient-to-br",
                isEditing ? editColor : card.color
              )}>
                <div className="interactive-card px-3.5 py-2.5 text-white relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 h-28 w-28 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                  <div className="flex items-center justify-between gap-2 mb-2 relative z-10">
                    {isEditing ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 w-40 rounded-lg bg-white/20 border-white/30 text-white text-sm placeholder:text-white/50"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(card.id); if (e.key === "Escape") cancelEdit(); }}
                      />
                    ) : (
                      <button
                        onClick={() => startEdit(card)}
                        className="flex items-center gap-x-3 gap-y-1 flex-wrap min-w-0 flex-1 text-left hover:underline transition-all group/name"
                      >
                        <span className="text-sm font-bold truncate max-w-full">{card.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono tabular-nums text-white/85">•••• {card.last_four}</span>
                          <CardBrand brand={card.brand} size="sm" />
                        </div>
                        <Pencil className="h-3 w-3 opacity-0 group-hover/name:opacity-100 transition-opacity ml-1" />
                      </button>
                    )}
                    <div className="flex items-center gap-1 shrink-0 relative z-30">
                      {isEditing ? (
                        <div className="flex items-center gap-1 bg-white/20 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-sm" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => saveEdit(card.id)} className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors" title="Salvar">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={cancelEdit} className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors" title="Cancelar">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {deleteConfirm === card.id ? (
                            <div className="flex items-center gap-1 bg-destructive/80 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-sm animate-in zoom-in-95 duration-200">
                              <button onClick={() => handleDelete(card.id)} className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors">
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setDeleteConfirm(null)} className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleToggleVisibility(card.id, card.is_visible);
                                }}
                                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/10 shadow-sm"
                                title={card.is_visible ? "Ocultar do Início" : "Mostrar no Início"}
                              >
                                {card.is_visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-white/60" />}
                              </button>

                              <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <button className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/10 shadow-sm">
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="rounded-xl z-[100]" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenuItem onClick={() => startEdit(card)} className="cursor-pointer">
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Editar cartão
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setDeleteConfirm(card.id)} className="cursor-pointer text-destructive focus:text-destructive">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Excluir cartão
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {isEditing ? (
                    <div className="flex flex-col gap-2 mb-2 relative z-10">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] opacity-70 w-14">Bandeira</span>
                        <div className="flex gap-1 flex-wrap">
                          {brandPresets.map((bp) => (
                            <button
                              key={bp.id}
                              onClick={() => setEditBrand(bp.id)}
                              className={cn(
                                "px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors",
                                editBrand.toLowerCase() === bp.id.toLowerCase() ? "bg-white text-black" : "bg-white/20 text-white hover:bg-white/30"
                              )}
                            >
                              {bp.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] opacity-70 w-14">Cor</span>
                        <div className="flex gap-1.5 flex-wrap overflow-x-auto no-scrollbar pb-1">
                          {colorOptions.map((co) => (
                            <button
                              key={co.value}
                              onClick={() => setEditColor(co.value)}
                              className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-all shrink-0",
                                editColor === co.value ? "ring-2 ring-white scale-110 shadow-lg" : "opacity-60 hover:opacity-100"
                              )}
                              title={co.label}
                            >
                              {co.emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] opacity-70 w-14">Limite R$</span>
                        <div className="w-24 sm:w-28 shrink-0">
                          <CalculatorAmountInput
                            value={parseFloat(editLimit) || 0}
                            onChange={(v) => setEditLimit(v.toString())}
                            className="h-7 bg-white/20 border-white/30 text-white text-[11px] sm:text-xs placeholder:text-white/50"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] opacity-70 w-14">Fecha dia</span>
                        <Input
                          type="number"
                          value={editClosing}
                          onChange={(e) => setEditClosing(e.target.value.replace(/\D/g, "").slice(0, 2))}
                          className="h-7 w-14 rounded-lg bg-white/20 border-white/30 text-white text-xs"
                          min={1} max={31}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(card.id); if (e.key === "Escape") cancelEdit(); }}
                        />
                        <span className="text-[10px] opacity-70 w-14 ml-2">Vence dia</span>
                        <Input
                          type="number"
                          value={editDue}
                          onChange={(e) => setEditDue(e.target.value.replace(/\D/g, "").slice(0, 2))}
                          className="h-7 w-14 rounded-lg bg-white/20 border-white/30 text-white text-xs"
                          min={1} max={31}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(card.id); if (e.key === "Escape") cancelEdit(); }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>

              <div className="px-3.5 pb-3 pt-1 text-white relative z-20">
                <div className="absolute inset-0 bg-black/15 pointer-events-none -z-10" />
                <div className="relative">
                  {(() => {
                    const periodKey = currentPeriod?.endDate?.toISOString().split("T")[0];
                    const paidThisPeriod = periodKey ? (cardPaymentsByPeriod[card.id]?.[periodKey] || 0) : 0;
                    const remainingThisPeriod = Math.max(0, invoiceRemaining - paidThisPeriod);
                    const isFullyPaid = invoiceRemaining > 0 && remainingThisPeriod === 0;
                    const isPartiallyPaid = paidThisPeriod > 0 && remainingThisPeriod > 0;
                    const detailedPayments = periodKey ? cardDetailedPaymentsByPeriod[card.id]?.[periodKey] || [] : [];
                    
                    return (
                      <>
                        <div className="flex justify-between items-start gap-2 mb-1.5">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/90 flex items-center gap-1.5 flex-wrap">
                              Fatura {activeInvoicePeriod?.label?.split("|")[0]?.split(" (")[0] || "atual"}
                              {isFullyPaid && (
                                <span className="rounded-full bg-emerald-500/90 text-white text-[8px] font-extrabold uppercase px-1.5 py-0.5 ring-1 ring-white/30 inline-flex items-center gap-0.5 shrink-0">
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                  Paga total
                                </span>
                              )}
                            </p>
                            <p className="text-base font-extrabold text-white tabular-nums drop-shadow-md truncate" data-testid="fatura-atual-valor">
                              {balanceVisible ? `R$ ${invoiceRemaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "••••••"}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 text-[9px] font-semibold text-white shrink-0">
                            <span className="tabular-nums whitespace-nowrap">
                              Fecha {formatDueDate(currentClose)}
                            </span>
                            <span className="tabular-nums whitespace-nowrap">
                              Vence {formatDueDate(currentDue)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-1 border-t border-white/10 pt-1">
                          <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-0.5 min-w-0 items-start">
                              <p className="text-[10px] text-white/70 font-medium truncate">
                                Pago <span className="text-emerald-400 font-bold ml-1">{balanceVisible ? `R$ ${paidThisPeriod.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "••••••"}</span>
                              </p>
                            </div>
                            <div className="opacity-70">
                              <p className="text-[9px] text-white/80 tabular-nums">
                                Disponível <span className="font-bold text-white">{balanceVisible ? `R$ ${Math.max(0, card.card_limit - outstandingBalance).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "••••••"}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex justify-start mt-0.5">
                            <p className="text-[10px] text-white/70 font-medium">
                              Faltam <span className="text-destructive font-bold ml-1">{balanceVisible ? `R$ ${remainingThisPeriod.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "••••••"}</span>
                            </p>
                          </div>
                          {isPartiallyPaid && (
                            <div className="flex justify-start mt-4">
                              <span className="rounded-full bg-blue-500/90 text-white text-[8px] font-extrabold uppercase px-1.5 py-0.5 ring-1 ring-white/30 inline-flex items-center gap-0.5">
                                <Receipt className="h-2.5 w-2.5" />
                                Parcialmente paga
                              </span>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                  <div className="flex gap-1.5 mt-2 justify-end">
                    <button
                      onClick={() => openInvoiceDialog(card)}
                      className="interactive-button flex items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-xs font-bold text-gray-900 hover:bg-white/90 transition-colors shadow-md ring-2 ring-white/60"
                    >
                      <Receipt className="h-3 w-3" strokeWidth={2.5} />
                      Faturas
                    </button>
                    <button
                      onClick={() => { setPdfImportCard(card); setPdfImportOpen(true); }}
                      className="interactive-button flex items-center justify-center rounded-lg bg-black/60 w-9 h-8 text-white hover:bg-black/70 transition-colors ring-2 ring-white/50"
                      title="Importar PDF"
                    >
                      <FileUp className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>
                 </div>

            </SortableCardWrapper>
          );
        })}
          </div>
        </SortableContext>
      </DndContext>
    </TabsContent>

      </Tabs>


      {/* Invoice Dialog */}
      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="max-w-md mx-auto rounded-2xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-primary" />
              Faturas — {invoiceCard?.name}
            </DialogTitle>
          </DialogHeader>

          {loadingTx ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : cardTransactions.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma transação neste cartão</p>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center gap-2 px-5 pb-3">
                <button
                  onClick={() => setActiveInvoiceIdx(Math.max(0, activeInvoiceIdx - 1))}
                  disabled={activeInvoiceIdx <= 0}
                  className="interactive-button p-1.5 rounded-lg bg-accent hover:bg-accent/80 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex-1 text-center">
                  <p className="text-sm font-semibold text-foreground">
                    {activePeriod?.label.includes("(") ? activePeriod.label.split(" (")[0] : activePeriod?.label || "—"}
                  </p>
                  {activePeriod && (
                    <p className="text-[10px] text-muted-foreground">
                      F {activePeriod.endDate.getDate().toString().padStart(2, "0")}/{ (activePeriod.endDate.getMonth() + 1).toString().padStart(2, "0") }
                      {" · Venc "}
                      {activePeriod.dueDate.getDate().toString().padStart(2, "0")}/{ (activePeriod.dueDate.getMonth() + 1).toString().padStart(2, "0") }
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setActiveInvoiceIdx(Math.min(invoicePeriods.length - 1, activeInvoiceIdx + 1))}
                  disabled={activeInvoiceIdx >= invoicePeriods.length - 1}
                  className="interactive-button p-1.5 rounded-lg bg-accent hover:bg-accent/80 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="flex gap-1 px-5 pb-3 overflow-x-auto no-scrollbar">
                {invoicePeriods.map((period, idx) => (
                    <button
                      key={period.key}
                      onClick={() => setActiveInvoiceIdx(idx)}
                      data-testid={`period-tab-${period.key}`}
                      className={cn(
                        "whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium transition-colors shrink-0",
                        idx === activeInvoiceIdx
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent/50 text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {period.label.split("|")[0]}
                    </button>

                ))}
              </div>

              {activePeriod && (
                <div className="mx-5 mb-4 flex flex-col gap-3">
                  <div className="rounded-xl bg-accent/50 p-3 flex justify-between items-center gap-3">
                    <div className="flex-1">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">Total da fatura</span>
                      <span className="text-sm font-bold text-destructive tabular-nums" data-testid="total-da-fatura-valor">
                        R$ {activePeriod.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {activePeriod.total > 0 && (
                      <Button 
                        size="sm" 
                        className="h-8 rounded-lg text-[11px] font-bold gap-1.5"
                        onClick={() => {
                          setInvoiceDialogOpen(false);
                          openPayDialog(invoiceCard!, activeInvoiceIdx);
                        }}
                      >
                        <Wallet className="h-3.5 w-3.5" />
                        Pagar
                      </Button>
                    )}
                  </div>

                  {(() => {
                    const paidTotal = activePeriodPayments.reduce((sum, p) => sum + p.amount, 0);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const isOverdue =
                      !!activePeriod &&
                      activePeriod.dueDate < today &&
                      Math.max(0, (activePeriod.total || 0) - paidTotal) > 0.009;
                    const fmtFull = (d: Date) =>
                      `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
                        .toString()
                        .padStart(2, "0")}/${d.getFullYear()}`;
                    return (
                      <section
                        aria-labelledby="billing-composition-title"
                        className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-3"
                      >
                        <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-emerald-500/10 pb-2">
                          <div className="min-w-0">
                            <h3
                              id="billing-composition-title"
                              className="text-sm font-semibold text-foreground"
                            >
                              Composição da Fatura
                            </h3>
                            {activePeriod && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Fecha em {fmtFull(activePeriod.endDate)} · Vence em {fmtFull(activePeriod.dueDate)}
                              </p>
                            )}
                          </div>
                          {isOverdue && (
                            <span className="rounded-full bg-destructive/15 text-destructive text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 ring-1 ring-destructive/30">
                              Vencida
                            </span>
                          )}
                        </header>

                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Já Pago</span>
                          <span
                            className="text-sm font-bold text-emerald-600 tabular-nums"
                            aria-live="polite"
                          >
                            R$ {paidTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        {activePeriodPayments.length === 0 ? (
                          <p className="py-2 text-center text-[11px] text-muted-foreground">
                            Nenhum pagamento vinculado ao período.
                          </p>
                        ) : (
                          <ul className="space-y-1.5 list-none m-0 p-0">
                            {activePeriodPayments.map((p, pIdx) => (
                              <li
                                key={`paid-detail-${pIdx}`}
                                className="flex justify-between items-center text-[10px]"
                              >
                                <span className="text-muted-foreground font-medium">{p.date}</span>
                                <span className="text-emerald-600 font-bold tabular-nums">
                                  R$ {p.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    );
                  })()}

                </div>
              )}

              <div className="flex-1 overflow-y-auto px-5 pb-5">
                {activePeriod && activePeriod.transactions.length === 0 && activePeriodPayments.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">Nenhuma transação nesta fatura</p>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {activePeriod?.transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center gap-2 py-2.5 border-b border-border/50 last:border-0">
                        <span className="text-lg">{tx.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {tx.name.replace(/\s*\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)\s*$/, "").trim()}
                            {(tx.total_installments || 1) > 1 && (
                              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                                ({tx.installment_number}/{tx.total_installments})
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{tx.category} · {tx.date}</p>
                        </div>
                        <div className="flex items-center gap-2 group/card-tx-row relative">
                          <span className="text-xs font-semibold text-destructive tabular-nums shrink-0">
                            -R$ {Number(tx.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                          <div className="flex items-center gap-1 opacity-0 group-hover/card-tx-row:opacity-100 transition-all duration-200 translate-x-2 group-hover/card-tx-row:translate-x-0">
                            <button
                              onClick={() => handleEditTx(tx)}
                              className="p-1.5 rounded-full bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTx(tx)}
                              className="p-1.5 rounded-full bg-accent/50 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => openInstallmentDialog(tx)}
                              className="p-1.5 rounded-full bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                              title="Editar parcelamento"
                            >
                              <Layers className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {activePeriodPayments.length > 0 && (
                      <div className="mt-4 mb-2 flex items-center gap-2">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2">Lançamentos</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add card dialog (new cards only) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm mx-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Novo cartão</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nome do cartão</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ex: Nubank" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Últimos 4 dígitos</Label>
              <Input value={formNumber} onChange={(e) => setFormNumber(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" maxLength={4} className="rounded-xl font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Bandeira</Label>
                <Select value={formBrand} onValueChange={setFormBrand}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {brandPresets.filter(b => b.id !== "custom").map((b) => (
                      <SelectItem key={b.id} value={b.label}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Cor</Label>
                <Select value={formColor} onValueChange={setFormColor}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {colorOptions.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Limite (R$)</Label>
                <CalculatorAmountInput value={parseFloat(formLimit) || 0} onChange={(v) => setFormLimit(v.toString())} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fatura atual (R$)</Label>
                <CalculatorAmountInput value={parseFloat(formUsed) || 0} onChange={(v) => setFormUsed(v.toString())} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Dia do fechamento</Label>
                <Input type="number" value={formClosingDay} onChange={(e) => setFormClosingDay(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="1" min={1} max={31} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Dia do vencimento</Label>
                <Input type="number" value={formDueDay} onChange={(e) => setFormDueDay(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="10" min={1} max={31} className="rounded-xl" />
              </div>
            </div>
            <button
              onClick={handleAdd}
              disabled={!formName.trim()}
              className="interactive-button flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-50 mt-2"
            >
              Adicionar cartão
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pay invoice dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm mx-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg w-full">
              <Wallet className="h-5 w-5 text-primary shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="truncate">Pagar Fatura — {payingCard?.name}</span>
                {invoicePeriods[activeInvoiceIdx] && (
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Competência: {activePeriod?.label.split(" (")[0]}
                  </span>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          {payingCard && (
            <div className="flex flex-col gap-4 mt-2">
              {!invoicePeriods[activeInvoiceIdx] ? (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex gap-2.5 items-start">
                  <Info className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-900">Fatura não gerada</p>
                    <p className="text-[10px] text-slate-800 leading-relaxed">
                      Este ciclo de cobrança ainda não possui transações registradas ou não foi iniciado.
                    </p>
                  </div>
                </div>
              ) : invoicePeriods[activeInvoiceIdx].total === 0 ? (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex gap-2.5 items-start">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-amber-900">Fatura sem despesas</p>
                    <p className="text-[10px] text-amber-800 leading-relaxed">
                      Não encontramos gastos para este ciclo. Você pode realizar um pagamento avulso ou escolher outro período.
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="rounded-xl bg-accent/50 p-3">
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Fatura {activePeriod?.label?.split("|")[0]?.split(" (")[0] || "selecionada"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activePeriod?.label?.split("|")[0]?.includes("(") ? "(" + activePeriod.label.split("|")[0].split(" (")[1] : ""}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    R$ {(activePeriod?.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex flex-col text-xs text-muted-foreground mb-1">
                  <div className="flex justify-between items-start">
                    <span className="flex items-center gap-1.5">
                      Já pago
                      {(() => {
                        const periodKey = activePeriod?.endDate?.toISOString().split("T")[0];
                        const payments = periodKey ? cardDetailedPaymentsByPeriod[payingCard.id]?.[periodKey] || [] : [];
                        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
                        const totalInvoice = activePeriod?.total || 0;
                        
                        if (totalPaid > 0 && totalPaid < totalInvoice) {
                          return (
                            <Badge variant="outline" className="h-4 px-1 text-[8px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 border-amber-500/20">
                              Parcial
                            </Badge>
                          );
                        } else if (totalPaid >= totalInvoice && totalInvoice > 0) {
                          return (
                            <Badge variant="outline" className="h-4 px-1 text-[8px] font-bold uppercase tracking-wider bg-primary/10 text-primary border-primary/20">
                              Total
                            </Badge>
                          );
                        }
                        return null;
                      })()}
                    </span>
                    <span className="tabular-nums text-primary font-medium text-right">
                      {(() => {
                        const periodKey = activePeriod?.endDate?.toISOString().split("T")[0];
                        const payments = periodKey ? cardDetailedPaymentsByPeriod[payingCard.id]?.[periodKey] || [] : [];
                        // Sort payments by date to ensure chronological order in the formula
                        const sortedPayments = [...payments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                        const totalPaid = sortedPayments.reduce((sum, p) => sum + p.amount, 0);
                        
                        if (sortedPayments.length > 1) {
                          const formula = sortedPayments
                            .map(p => `R$ ${p.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${format(new Date(p.date), "dd/MM")})`)
                            .join(" + ");
                          return (
                            <div className="flex flex-col items-end">
                              <span className="text-[9px] text-muted-foreground leading-tight mb-0.5">{formula} =</span>
                              <span>R$ {totalPaid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </div>
                          );
                        }
                        
                        return `R$ ${totalPaid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
                      })()}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between text-sm font-semibold text-foreground border-t border-border pt-1 mt-1">
                  <span>Restante</span>
                  <span className="tabular-nums">
                    R$ {Math.max(0, (activePeriod?.total || 0) - (activePeriod?.endDate ? cardPaymentsByPeriod[payingCard.id]?.[activePeriod.endDate.toISOString().split("T")[0]] || 0 : 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

               <div className="rounded-xl border border-border/40 bg-accent/10 overflow-hidden">
                <button 
                  onClick={() => setShowInvoiceDetails(!showInvoiceDetails)}
                  className="w-full flex items-center justify-between p-2.5 hover:bg-accent/30 transition-colors"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Receipt className="h-3 w-3" />
                    Composição da Fatura
                  </span>
                  {showInvoiceDetails ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                </button>
                
                {showInvoiceDetails && (
                  <div className="px-2.5 pb-2.5 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="max-h-[120px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                      {activePeriod?.transactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between gap-1 py-1 border-b border-border/10 last:border-0">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="text-[12px] shrink-0 opacity-80">{tx.icon}</span>
                            <div className="flex flex-col min-w-0 leading-tight">
                              <span className="truncate text-[10px] text-foreground font-medium">{tx.name}</span>
                              <span className="text-[8px] text-muted-foreground">{tx.date && tx.date.includes(" ") ? tx.date : (tx.date ? format(new Date(tx.date), "dd MMM", { locale: ptBR }) : "")}</span>
                            </div>
                          </div>
                          <span className={cn(
                            "tabular-nums font-bold shrink-0 text-[10px] text-right ml-auto",
                            tx.type === "income" ? "text-primary" : "text-destructive"
                          )}>
                            {tx.type === "income" ? "+" : "-"} R$ {Number(tx.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                      {(!activePeriod?.transactions || activePeriod.transactions.length === 0) && (
                        <p className="text-center py-2 text-[10px] text-muted-foreground">Nenhuma transação neste período</p>
                      )}
                    </div>
                    
                    <div className="pt-2 border-t border-border/40 space-y-1">
                      {(() => {
                        const txs = activePeriod?.transactions || [];
                        const compras = txs.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
                        const creditos = txs.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
                        return (
                          <>
                            <div className="flex justify-between text-[9px] leading-tight">
                              <span className="text-muted-foreground">Compras:</span>
                              <span className="text-destructive font-medium">- R$ {compras.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between text-[9px] leading-tight">
                              <span className="text-muted-foreground">Créditos:</span>
                              <span className="text-primary font-medium">+ R$ {creditos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between text-[10px] font-bold pt-1 border-t border-border/20 mt-1">
                              <span className="text-foreground">Total:</span>
                              <span className="text-foreground tabular-nums">R$ {(compras - creditos).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>

              <Label className="text-xs text-muted-foreground">Pagar com:</Label>

              {bankAccounts.length > 0 && (() => {
                const currentInvoiceTotal = (invoicePeriods[activeInvoiceIdx] || invoicePeriods[0])?.total || 0;
                const currentPeriodKey = (invoicePeriods[activeInvoiceIdx] || invoicePeriods[0])?.key;
                const paidInThisPeriod = currentPeriodKey ? cardPaymentsByPeriod[payingCard.id]?.[currentPeriodKey.split("|")[1] || currentPeriodKey] || 0 : 0;
                const remaining = Math.max(0, currentInvoiceTotal - paidInThisPeriod);
                const eligible = bankAccounts.filter((a) => a.balance > 0).sort((a, b) => b.balance - a.balance);
                const best = eligible[0];
                if (!best || remaining <= 0) return null;
                const payable = Math.min(best.balance, remaining);
                return (
                  <button
                    onClick={() => setPaymentLines([{ accountId: best.id, amount: payable.toFixed(2) }])}
                    className="interactive-button flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground hover:bg-primary/10 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <BankLogo icon={best.icon || "custom"} color={best.color || "from-gray-500 to-gray-700"} name={best.name} size="xs" />
                      Pagar com saldo de {best.name}
                    </span>

                    <span className="font-semibold text-primary tabular-nums">
                      R$ {payable.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </button>
                );
              })()}

              <div className="space-y-1.5 mb-2">
                <Label className="text-[11px] font-semibold text-foreground block">Data do pagamento</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl bg-accent/30 border-none h-9 px-2.5 text-xs", !paymentDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-primary" />
                      {paymentDate || "Selecione a data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[60]" align="start">
                    <Calendar
                      mode="single"
                      selected={(() => { try { return parse(paymentDate, "dd MMM", new Date(), { locale: ptBR }); } catch { return undefined; } })()}
                      onSelect={(date) => { if (date) setPaymentDate(format(date, "dd MMM", { locale: ptBR })); }}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {bankAccounts.length === 0 ? (
                <div className="text-center py-4">
                  <Landmark className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhuma conta cadastrada</p>
                  <Link to="/accounts" className="text-xs text-primary mt-1 inline-block">
                    Cadastrar conta →
                  </Link>
                </div>
              ) : (
                <>
                  {paymentLines.map((line, index) => (
                    <div key={index} className="flex items-end gap-1.5 sm:gap-2">
                      <div className="flex-1 space-y-1.5 min-w-0">
                        <Label className="text-[10px] text-muted-foreground truncate block">Conta</Label>
                        <Select value={line.accountId} onValueChange={(v) => updatePaymentLine(index, "accountId", v)}>
                          <SelectTrigger className="rounded-xl text-xs h-10 px-2 overflow-hidden">
                            <SelectValue placeholder="Conta">
                              {line.accountId && (() => {
                                const acc = bankAccounts.find(a => a.id === line.accountId);
                                if (!acc) return "Conta";
                                return (
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <BankLogo icon={acc.icon || "custom"} color={acc.color || "from-gray-500 to-gray-700"} name={acc.name} size="xs" />
                                    <span className="truncate max-w-[50px] sm:max-w-none">{acc.name}</span>
                                  </div>
                                );
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {bankAccounts.map((acc) => (
                              <SelectItem key={acc.id} value={acc.id} className="text-xs">
                                <div className="flex items-center gap-2">
                                  <BankLogo icon={acc.icon || "custom"} color={acc.color || "from-gray-500 to-gray-700"} name={acc.name} size="xs" />
                                  <span>{acc.name} — R$ {acc.balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                                </div>
                              </SelectItem>
                            ))}

                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-24 sm:w-28 space-y-1.5 shrink-0">
                        <Label className="text-[10px] text-muted-foreground block">Valor (R$)</Label>
                        <CalculatorAmountInput
                          value={parseFloat(line.amount) || 0}
                          onChange={(v) => updatePaymentLine(index, "amount", v.toString())}
                          className="h-10 text-xs sm:text-sm"
                        />
                      </div>
                      {paymentLines.length > 1 && (
                        <button onClick={() => removePaymentLine(index)} className="interactive-button p-2 rounded-lg hover:bg-accent mb-0.5">
                          <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  ))}

                  <button
                    onClick={addPaymentLine}
                    className="interactive-button flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar outra conta
                  </button>

                  {paymentTotal > 0 && (
                    <div className="rounded-xl bg-primary/10 p-3 flex justify-between items-center">
                      <span className="text-xs font-medium text-foreground">Total do pagamento</span>
                      <span className="text-sm font-bold text-primary tabular-nums">
                        R$ {paymentTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  <button
                    onClick={handlePay}
                    disabled={payingSaving || paymentTotal <= 0 || paymentLines.every((l) => !l.accountId)}
                    className="interactive-button flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-50 mt-1"
                  >
                    {payingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Confirmar pagamento
                  </button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Installment edit dialog */}
      <Dialog open={installmentDialogOpen} onOpenChange={setInstallmentDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm mx-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-primary" />
              Parcelamento
            </DialogTitle>
          </DialogHeader>
          {installmentTx && (
            <div className="flex flex-col gap-4 mt-2">
              <div className="rounded-xl bg-accent/50 p-3">
                <p className="text-xs font-medium text-foreground truncate">{installmentTx.name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  R$ {Number(installmentTx.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · {installmentTx.date}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Parcela atual</Label>
                  <Input
                    type="number"
                    min={1}
                    value={installmentCurrent}
                    onChange={(e) => setInstallmentCurrent(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Total de parcelas</Label>
                  <Input
                    type="number"
                    min={1}
                    value={installmentTotal}
                    onChange={(e) => setInstallmentTotal(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    className="rounded-xl"
                  />
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                As parcelas futuras serão criadas automaticamente nos meses seguintes, com o mesmo valor.
                Defina o total como <strong>1</strong> para remover o parcelamento.
              </p>

              <button
                onClick={handleSaveInstallment}
                disabled={installmentSaving}
                className="interactive-button flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {installmentSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Salvar parcelamento
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm mx-auto rounded-2xl p-4 sm:p-6 flex flex-col gap-4">
          <DialogHeader className="pr-6">
            <DialogTitle className="text-sm">Editar Transação</DialogTitle>
          </DialogHeader>
          {editTx && (
            <div className="flex flex-col gap-4">
              <div className="relative">
                <Label className="text-xs text-muted-foreground mb-1 block">Nome</Label>
                <Input
                  autoFocus
                  value={editTx.name}
                  onChange={e => {
                    let name = e.target.value;
                    if (name.length > 0) name = name.charAt(0).toUpperCase() + name.slice(1);
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
                  onFocus={() => setShowEditSuggestions(editTx.name.length >= 2)}
                  onBlur={() => setTimeout(() => setShowEditSuggestions(false), 200)}
                  className="rounded-xl h-10 focus-visible:ring-primary/30"
                />
                {showEditSuggestions && getAutocompleteSuggestions(editTx.name).length > 0 && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-xl bg-popover border border-border shadow-lg max-h-48 overflow-y-auto">
                    {getAutocompleteSuggestions(editTx.name).map((s, i) => (
                      <button
                        key={i}
                        type="button"
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
              
              <div className="min-h-[60px]">
                <Suspense fallback={<div className="h-10 flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>}>
                  <CategoryPicker
                    value={editTx.category}
                    onChange={(val, icon) => setEditTx({ ...editTx, category: val, icon: icon || editTx.icon })}
                    type={editTx.type as any}
                  />
                </Suspense>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl bg-accent/30 border-none h-10", !editTx.date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editTx.date}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={(() => {
                        try {
                          return parse(editTx.date, "dd MMM", new Date(), { locale: ptBR });
                        } catch { return undefined; }
                      })()}
                      onSelect={(date) => {
                        if (date) setEditTx({ ...editTx, date: format(date, "dd MMM", { locale: ptBR }) });
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Valor (R$)</Label>
                <CalculatorAmountInput
                  value={editTx.amount}
                  onChange={(v) => setEditTx({ ...editTx, amount: v })}
                />
              </div>

              <Button
                onClick={saveEditTx}
                disabled={isSavingEdit}
                className="w-full rounded-2xl py-6 font-semibold mt-2"
              >
                {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar alterações"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm mx-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Excluir Transação</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir esta transação?
              {deleteTarget && isInstallmentTx(deleteTarget) && " Esta transação faz parte de um parcelamento."}
            </p>

            {deleteTarget && isInstallmentTx(deleteTarget) && (
              <div className="flex flex-col gap-2 p-3 bg-accent/50 rounded-xl border border-border">
                <button
                  onClick={() => setDeleteScope("single")}
                  className={cn("flex items-center justify-between p-2 rounded-lg text-xs transition-colors", deleteScope === "single" ? "bg-primary/20 text-primary font-bold" : "hover:bg-accent")}
                >
                  Apenas esta parcela
                  {deleteScope === "single" && <Check className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => setDeleteScope("future")}
                  className={cn("flex items-center justify-between p-2 rounded-lg text-xs transition-colors", deleteScope === "future" ? "bg-primary/20 text-primary font-bold" : "hover:bg-accent")}
                >
                  Esta e as futuras
                  {deleteScope === "future" && <Check className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => setDeleteScope("all")}
                  className={cn("flex items-center justify-between p-2 rounded-lg text-xs transition-colors", deleteScope === "all" ? "bg-primary/20 text-primary font-bold" : "hover:bg-accent")}
                >
                  Todo o parcelamento
                  {deleteScope === "all" && <Check className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowDeleteDialog(false)}>Cancelar</Button>
              <Button
                variant="destructive"
                className="flex-1 rounded-xl"
                onClick={confirmDeleteTx}
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF invoice import dialog */}
      <Suspense fallback={null}>
        {pdfImportCard && (
          <PdfInvoiceImportDialog
            open={pdfImportOpen}
            onOpenChange={setPdfImportOpen}
            cardId={pdfImportCard.id}
            cardName={pdfImportCard.name}
            onSuccess={() => {
              toast.success("Fatura importada com sucesso!");
              fetchAll();
            }}
          />
        )}
      </Suspense>
    </div>
  );
}
