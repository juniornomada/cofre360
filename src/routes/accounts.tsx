import { createFileRoute } from "@tanstack/react-router";
import { SmartLink as Link } from "@/components/SmartLink";
import { ArrowLeft, Plus, Landmark, Trash2, X, Check, Loader2, Upload, FileText, MoreVertical, GripVertical, Pencil, Eye, EyeOff, CheckSquare, Square, Filter, FilterX, Search, SlidersHorizontal, Calculator, Eraser, Info, CreditCard } from "lucide-react";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";

const CsvImportDialog = lazy(() => import("@/components/CsvImportDialog").then(m => ({ default: m.CsvImportDialog })));
const PdfStatementImportDialog = lazy(() => import("@/components/PdfStatementImportDialog").then(m => ({ default: m.PdfStatementImportDialog })));
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { BankLogo, bankPresets } from "@/components/BankLogo";
import { toast } from "sonner";
import { CalculatorAmountInput } from "@/components/CalculatorAmountInput";
import { cn } from "@/lib/utils";
import { formatSignedBRL } from "@/lib/format-brl";
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


type BankAccount = {
  id: string;
  name: string;
  balance: number;
  icon: string | null;
  color: string | null;
  is_visible: boolean | null;
};

const bankColorOptions = [
  { label: "Azul", value: "from-blue-500 to-blue-800", emoji: "🔵" },
  { label: "Azul Marinho", value: "from-blue-900 to-blue-950", emoji: "🌑" },
  { label: "Ciano", value: "from-cyan-400 to-cyan-600", emoji: "💎" },
  { label: "Roxo", value: "from-purple-600 to-purple-900", emoji: "🟣" },
  { label: "Laranja", value: "from-orange-500 to-orange-700", emoji: "🟠" },
  { label: "Verde", value: "from-green-500 to-green-800", emoji: "🟢" },
  { label: "Verde Escuro", value: "from-green-800 to-green-950", emoji: "🌲" },
  { label: "Preto", value: "from-gray-700 to-gray-900", emoji: "⚫" },
  { label: "Vermelho", value: "from-red-500 to-red-800", emoji: "🔴" },
  { label: "Amarelo", value: "from-yellow-400 to-yellow-600", emoji: "🟡" },
  { label: "Rosa", value: "from-pink-400 to-pink-700", emoji: "🌸" },
  { label: "Índigo", value: "from-indigo-600 to-indigo-900", emoji: "🌌" },
  { label: "Teal", value: "from-teal-500 to-teal-800", emoji: "🌊" },
  { label: "Dourado", value: "from-yellow-600 to-amber-900", emoji: "📀" },
  { label: "Prateado", value: "from-slate-300 to-slate-500", emoji: "🥈" },
];

type SortableAccountItemProps = {
  account: BankAccount;
  index: number;
  isEditing: boolean;
  editName: string;
  editBalance: string;
  setEditName: (v: string) => void;
  setEditBalance: (v: string) => void;
  income: number;
  expense: number;
  deleteConfirm: string | null;
  setDeleteConfirm: (v: string | null) => void;
  startEdit: (account: BankAccount) => void;
  saveEdit: (id: string) => void;
  cancelEdit: () => void;
  handleDelete: (id: string) => void;
  setCsvImportAccount: (a: BankAccount) => void;
  setPdfImportAccount: (a: BankAccount) => void;
  
  handleToggleVisibility: (id: string, current: boolean | null) => void;
  openRecalc: (a: BankAccount) => void;
  openBreakdown: (a: BankAccount) => void;

  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  balanceVisible: boolean;
};

function SortableAccountItem({
  account,
  index,
  isEditing,
  editName,
  editBalance,
  setEditName,
  setEditBalance,
  income,
  expense,
  deleteConfirm,
  setDeleteConfirm,
  startEdit,
  saveEdit,
  cancelEdit,
  handleDelete,
  setCsvImportAccount,
  setPdfImportAccount,
  
  handleToggleVisibility,
  openRecalc,
  openBreakdown,

  isSelectionMode,
  isSelected,
  onToggleSelect,
  balanceVisible,
}: SortableAccountItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: account.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    touchAction: "manipulation",
  };

  // Saldo calculado exclusivamente a partir das transações lançadas (receitas, despesas e transferências).
  // O campo `account.balance` representa o saldo inicial/de abertura da conta.
  const openingBalance = Math.round(Number(account.balance || 0) * 100) / 100;
  const currentBalance = Math.round((openingBalance + income - expense) * 100) / 100;
  const hasMovements = income !== 0 || expense !== 0;
  // Destaque: quando não há movimentações, a abertura É o saldo atual.
  const openingIsOnlyComponent = !hasMovements && openingBalance !== 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "animate-stagger-in group relative bg-card hover:bg-accent/40 transition-colors select-none",
        !isSelectionMode && "cursor-grab active:cursor-grabbing",
        isDragging && "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-2xl scale-[1.01] z-50",
      )}
    >
      <div className="flex items-center gap-2 px-2 sm:px-4 py-0 min-h-[56px] overflow-hidden">
        {isSelectionMode && (
          <button 
            type="button"
            onClick={() => onToggleSelect(account.id)}
            className="flex items-center justify-center shrink-0 w-8 h-8 rounded-full hover:bg-accent transition-colors z-10"
          >
            {isSelected ? (
              <CheckSquare className="h-5 w-5 text-primary" />
            ) : (
              <Square className="h-5 w-5 text-muted-foreground" />
            )}
          </button>
        )}
        <BankLogo icon={account.icon || ""} color={account.color || ""} name={account.name} size="sm" />
        <div className="flex-1 min-w-0 h-full cursor-pointer" style={{ animationDelay: `${60 + index * 80}ms` }}>
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-9 rounded-lg text-sm"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(account.id); if (e.key === "Escape") cancelEdit(); }}
              />
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground mr-1">R$</span>
                <div className="w-20 sm:w-32 shrink-0">
                  <CalculatorAmountInput
                    value={parseFloat(editBalance) || 0}
                    onChange={(v) => setEditBalance(v.toString())}
                    className="h-8 text-xs sm:text-sm"
                  />
                </div>
              </div>
            </div>
          ) : (
          <Link
            to="/transactions"
            search={{ accountId: account.id } as any}
            className="text-left w-full block h-full flex flex-col justify-center"
          >
            <div className="flex items-center justify-between gap-2 py-3">
              <div className="flex flex-col min-w-0 gap-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-[14px] font-semibold text-foreground truncate tracking-tight leading-tight">{account.name}</p>
                  {account.is_visible === false && (
                    <EyeOff className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); startEdit(account); }}
                    className="interactive-button"
                  >
                    <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground shrink-0" />
                  </button>
                </div>
                {openingBalance !== 0 && (
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
                    <span
                      className={cn(
                        "text-[11px] tabular-nums leading-tight min-w-0 truncate",
                        openingIsOnlyComponent
                          ? "font-semibold text-primary"
                          : "text-muted-foreground",
                        openingBalance < 0 && !openingIsOnlyComponent
                          ? "text-destructive"
                          : "",
                      )}
                      title="Saldo de abertura da conta"
                    >
                      Abertura: {balanceVisible
                        ? formatSignedBRL(openingBalance)
                        : "R$ ••••"}
                    </span>
                    {openingIsOnlyComponent && (
                      <span
                        role="status"
                        aria-label={`Sem movimentações no período — o saldo atual (${
                          balanceVisible ? formatSignedBRL(openingBalance) : "oculto"
                        }) é composto exclusivamente pelo saldo de abertura da conta ${account.name}`}
                        title="Saldo atual é apenas a abertura (sem movimentações no período)"
                        className="shrink-0 whitespace-nowrap text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground border border-primary"
                      >
                        <span aria-hidden="true">único componente</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
              <p className={cn(
                "text-[14px] font-bold tabular-nums tracking-tight leading-tight whitespace-nowrap shrink-0",
                currentBalance < 0 ? "text-destructive" : "text-foreground"
              )}>
                {balanceVisible ? `R$ ${currentBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ ••••"}
              </p>
            </div>
          </Link>
          )}
        </div>
        <div className="flex items-center shrink-0">
          {isEditing ? (
            <div className="flex items-center gap-0.5">
              <button onClick={() => saveEdit(account.id)} className="interactive-button h-9 w-9 flex items-center justify-center rounded-full bg-foreground text-background transition-colors" aria-label="Salvar">
                <Check className="h-4 w-4" />
              </button>
              <button onClick={cancelEdit} className="interactive-button h-9 w-9 flex items-center justify-center rounded-full hover:bg-accent transition-colors" aria-label="Cancelar">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ) : deleteConfirm === account.id ? (
            <div className="flex items-center gap-0.5">
              <button onClick={() => handleDelete(account.id)} className="interactive-button h-9 w-9 flex items-center justify-center rounded-full bg-destructive text-white transition-colors" aria-label="Confirmar exclusão">
                <Check className="h-4 w-4" />
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="interactive-button h-9 w-9 flex items-center justify-center rounded-full hover:bg-accent transition-colors" aria-label="Cancelar exclusão">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggleVisibility(account.id, account.is_visible);
                }}
                className="interactive-button h-9 w-9 flex items-center justify-center rounded-full hover:bg-accent transition-colors"
                title={account.is_visible ? "Ocultar do Início" : "Mostrar no Início"}
              >
                {account.is_visible ? <Eye className="h-4 w-4 text-muted-foreground" /> : <EyeOff className="h-4 w-4 text-muted-foreground/60" />}
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="interactive-button h-9 w-9 flex items-center justify-center rounded-full hover:bg-accent transition-colors" aria-label="Mais ações">
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl">
                  <DropdownMenuItem onClick={() => setCsvImportAccount(account)} className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-2" />
                    Importar CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPdfImportAccount(account)} className="cursor-pointer">
                    <FileText className="h-4 w-4 mr-2" />
                    Importar extrato PDF
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { startEdit(account); }} className="cursor-pointer">
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar conta
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openBreakdown(account)} className="cursor-pointer">
                    <Info className="h-4 w-4 mr-2" />
                    Composição do saldo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openRecalc(account)} className="cursor-pointer">
                    <Calculator className="h-4 w-4 mr-2" />
                    Recalcular saldo
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={() => setDeleteConfirm(account.id)} className="cursor-pointer text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir conta
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-[1px] animate-fade-in">
          <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-gray-900 shadow-lg ring-2 ring-primary">
            <GripVertical className="h-4 w-4" />
            Mover conta
          </div>
        </div>
      )}
    </div>
  );
 }

 export const Route = createFileRoute("/accounts")({
   head: () => ({
     meta: [
       { title: "Contas Bancárias — Cofre 360" },
       { name: "description", content: "Gerencie suas contas correntes" },
     ],
   }),
   validateSearch: (search: Record<string, unknown>) => ({
     action: (search.action as string) || undefined,
   }),
   component: AccountsPage,
 });

function AccountsPage() {
  const { balanceVisible, updateBalanceVisible } = useUserPreferences();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [incomeByAccount, setIncomeByAccount] = useState<Record<string, number>>({});
  const [expenseByAccount, setExpenseByAccount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false); 
  const listRef = useRef<HTMLDivElement>(null);
   
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [csvImportAccount, setCsvImportAccount] = useState<BankAccount | null>(null);
  const [pdfImportAccount, setPdfImportAccount] = useState<BankAccount | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recalcAccount, setRecalcAccount] = useState<BankAccount | null>(null);
  const [recalcRealBalance, setRecalcRealBalance] = useState<number>(0);
  const [isRecalcing, setIsRecalcing] = useState(false);
  const [breakdownAccount, setBreakdownAccount] = useState<BankAccount | null>(null);
  const [breakdownData, setBreakdownData] = useState<{
    included: Array<{ id: string; date: string; description: string | null; amount: number; type: string }>;
    hidden: Array<{ id: string; date: string; description: string | null; amount: number; type: string }>;
    cardLinked: Array<{ id: string; date: string; description: string | null; amount: number; type: string; card: string | null }>;
    incomeSum: number;
    expenseSum: number;
    hiddenIncomeSum: number;
    hiddenExpenseSum: number;
    cardSum: number;
  } | null>(null);
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false);

  const isUndoing = useRef(false);

  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [editBalance, setEditBalance] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editColor, setEditColor] = useState("");

  // Add form
  const [formName, setFormName] = useState("");
  const [formBalance, setFormBalance] = useState("");
  const [formIcon, setFormIcon] = useState("custom");
  const [formColor, setFormColor] = useState(bankPresets.find(b => b.id === "custom")!.color);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkVisibility = async (visible: boolean) => {
    const count = selectedIds.size;
    if (count === 0) return;
    setIsSubmitting(true);
    
    const promise = async () => {
      const { error } = await supabase
        .from("bank_accounts")
        .update({ is_visible: visible })
        .in("id", Array.from(selectedIds));
      
      if (error) throw error;
      
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      fetchAccounts();
      return count;
    };

    toast.promise(promise(), {
      loading: visible ? `Exibindo ${count} contas...` : `Ocultando ${count} contas...`,
      success: (updatedCount) => `${updatedCount} ${updatedCount === 1 ? "conta atualizada" : "contas atualizadas"} com sucesso`,
      error: "Erro ao atualizar visibilidade das contas",
      finally: () => setIsSubmitting(false)
    });
  };

  const fetchAccounts = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {

      const { data, error } = await supabase.from("bank_accounts").select("*").eq("user_id", session.user.id).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
      if (error) throw error;
      if (data) setAccounts(data);

      // Buscar transações visíveis vinculadas a contas bancárias (exclui card e ocultas/soft-deleted).
      const { data: txData, error: txError } = await supabase
        .from("transactions")
        .select("bank_account_id, amount, type, is_visible, card")
        .eq("user_id", session.user.id)
        .not("bank_account_id", "is", null)
        .is("card", null);
      if (txError) throw txError;

      if (txData) {
        const incMap: Record<string, number> = {};
        const expMap: Record<string, number> = {};
        for (const tx of txData) {
          if (tx.is_visible === false) continue; // ignora transações ocultas/removidas logicamente
          const id = tx.bank_account_id as string;
          const amt = Number(tx.amount) || 0;
          if (tx.type === "income") {
            incMap[id] = (incMap[id] || 0) + amt;
          } else {
            expMap[id] = (expMap[id] || 0) + amt;
          }
        }
        setIncomeByAccount(incMap);
        setExpenseByAccount(expMap);
      }
    } catch (error: any) {
      console.error("Error fetching accounts:", error);
      toast.error("Erro ao carregar contas: " + (error.message || "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 1000, tolerance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 1000, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = accounts.findIndex((a) => a.id === active.id);
    const newIndex = accounts.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(accounts, oldIndex, newIndex);
    setAccounts(reordered);
    try {
      await Promise.all(
        reordered.map((a, idx) => supabase.from("bank_accounts").update({ sort_order: idx }).eq("id", a.id)),
      );
    } catch (error: any) {
      console.error("Error reordering accounts:", error);
      toast.error("Erro ao reordenar contas");
    }
  };

  useEffect(() => {
    fetchAccounts();
    // Re-fetch when the window regains focus
    const onFocus = () => fetchAccounts();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchAccounts]);

  const searchParams = Route.useSearch();
  useEffect(() => {
    if (searchParams.action === "add") {
      openAddDialog();
    }
  }, [searchParams.action]);

   const handleAddDialogChange = (open: boolean) => {
     setDialogOpen(open);
     if (!open) {
       setTimeout(() => {
         if (listRef.current) listRef.current.focus();
       }, 100);
     }
   };
 
   const openAddDialog = () => {
     setFormName("");
     setFormBalance("");
     setFormIcon("custom");
     setFormColor(bankPresets.find(b => b.id === "custom")!.color);
     setDialogOpen(true);
   };

  const validateAccount = (name: string, balanceStr: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("O nome da conta é obrigatório");
      return null;
    }

    const rawBalance = balanceStr.toString().trim();
    if (!rawBalance) {
      return { name: trimmedName, balance: 0 };
    }

    const balance = parseFloat(rawBalance.replace(",", "."));
    if (isNaN(balance)) {
      toast.error("Formato de saldo inválido");
      return null;
    }

    if (balance < 0) {
      toast.error("O saldo inicial não pode ser negativo");
      return null;
    }

    return { name: trimmedName, balance };
  };

  const handleAdd = async () => {
    const valid = validateAccount(formName, formBalance);
    if (!valid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const payload = {
        id: crypto.randomUUID(),
        ...valid,
        icon: formIcon,
        color: formColor,
      };
      const { error } = await supabase.from("bank_accounts").insert(payload);
      if (error) throw error;
      setDialogOpen(false);
      fetchAccounts();
      toast.success("Conta adicionada com sucesso");
    } catch (error: any) {
      console.error("Error adding account:", error);
      toast.error("Erro ao adicionar conta: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const [showConfirmUpdate, setShowConfirmUpdate] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const startEdit = (account: BankAccount) => {
    setEditingAccount(account);
    setEditName(account.name);
    setEditBalance(account.balance.toString());
    setEditIcon(account.icon);
    setEditColor(account.color);
    setConfirmText("");
  };

  const saveEdit = async (id: string) => {
    const valid = validateAccount(editName, editBalance);
    if (!valid || isSubmitting) return;

    // Se o saldo mudou, pede confirmação
    const originalAccount = accounts.find(a => a.id === id);
    if (originalAccount && originalAccount.balance !== valid.balance && !showConfirmUpdate) {
      setShowConfirmUpdate(true);
      setConfirmText("");
      return;
    }


    setIsSubmitting(true);
    try {
      const updates = {
        ...valid,
        icon: editIcon,
        color: editColor,
      };

      const { error: updError } = await supabase.from("bank_accounts").update(updates).eq("id", id);
      if (updError) throw updError;

      // Grava no histórico de auditoria se o saldo mudou
      if (originalAccount && originalAccount.balance !== valid.balance) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("bank_account_balance_history").insert({
          bank_account_id: id,
          previous_balance: originalAccount.balance,
          new_balance: valid.balance,
          user_id: user?.id
        });
      }

      setEditingAccount(null);
      setShowConfirmUpdate(false);
      toast.success("Conta atualizada", {
        action: {
          label: "Desfazer",
          onClick: async () => {
            if (isUndoing.current) return;
            isUndoing.current = true;
            try {
              const { data: history, error: historyError } = await supabase
                .from("bank_account_balance_history")
                .select("*")
                .eq("bank_account_id", id)
                .order("created_at", { ascending: false })
                .limit(1)
                .single();

              if (historyError || !history) throw new Error("Não foi possível localizar a alteração para desfazer.");

              const { error: revertError } = await supabase
                .from("bank_accounts")
                .update({ balance: history.previous_balance })
                .eq("id", id);
              if (revertError) throw revertError;

              await supabase.from("bank_account_balance_history").delete().eq("id", history.id);

              toast.success("Alteração desfeita com sucesso!");
              fetchAccounts();
            } catch (err: any) {
              console.error("Undo error:", err);
              toast.error("Erro ao desfazer: " + (err.message || "Erro desconhecido"));
            } finally {
              isUndoing.current = false;
            }
          }
        },
        duration: 8000
      });
      fetchAccounts();
    } catch (error: any) {
      console.error("Error updating account:", error);
      toast.error("Erro ao atualizar conta: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleToggleVisibility = async (id: string, current: boolean | null) => {
    try {
      const { error } = await supabase.from("bank_accounts").update({ is_visible: !current }).eq("id", id);
      if (error) throw error;
      fetchAccounts();
      toast.success(current ? "Conta ocultada da página inicial" : "Conta agora visível na página inicial");
    } catch (error: any) {
      console.error("Error toggling visibility:", error);
      toast.error("Erro ao alterar visibilidade");
    }
  };

  const openRecalc = (a: BankAccount) => {
    const income = incomeByAccount[a.id] || 0;
    const expense = expenseByAccount[a.id] || 0;
    const opening = Number(a.balance || 0);
    const current = Math.round((opening + income - expense) * 100) / 100;
    setRecalcAccount(a);
    setRecalcRealBalance(current);
  };

  const openBreakdown = async (a: BankAccount) => {
    setBreakdownAccount(a);
    setBreakdownData(null);
    setIsLoadingBreakdown(true);
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, date, description, amount, type, is_visible, card")
        .eq("bank_account_id", a.id)
        .order("date", { ascending: false });
      if (error) throw error;

      const included: any[] = [];
      const hidden: any[] = [];
      const cardLinked: any[] = [];
      let incomeSum = 0, expenseSum = 0, hiddenIncomeSum = 0, hiddenExpenseSum = 0, cardSum = 0;

      for (const tx of data || []) {
        const amt = Number(tx.amount) || 0;
        if (tx.card) {
          cardLinked.push(tx);
          cardSum += amt;
        } else if (tx.is_visible === false) {
          hidden.push(tx);
          if (tx.type === "income") hiddenIncomeSum += amt;
          else hiddenExpenseSum += amt;
        } else {
          included.push(tx);
          if (tx.type === "income") incomeSum += amt;
          else expenseSum += amt;
        }
      }
      setBreakdownData({ included, hidden, cardLinked, incomeSum, expenseSum, hiddenIncomeSum, hiddenExpenseSum, cardSum });
    } catch (error: any) {
      console.error("Error loading breakdown:", error);
      toast.error("Erro ao carregar composição: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsLoadingBreakdown(false);
    }
  };



  const handleRecalc = async () => {
    if (!recalcAccount || isRecalcing) return;
    const income = incomeByAccount[recalcAccount.id] || 0;
    const expense = expenseByAccount[recalcAccount.id] || 0;
    const newOpening = Math.round((recalcRealBalance - income + expense) * 100) / 100;
    const previousOpening = Number(recalcAccount.balance || 0);

    if (Math.abs(newOpening - previousOpening) < 0.005) {
      toast.info("A abertura já está consistente com o saldo informado.");
      setRecalcAccount(null);
      return;
    }

    setIsRecalcing(true);
    try {
      const { error } = await supabase
        .from("bank_accounts")
        .update({ balance: newOpening })
        .eq("id", recalcAccount.id);
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("bank_account_balance_history").insert({
        bank_account_id: recalcAccount.id,
        previous_balance: previousOpening,
        new_balance: newOpening,
        user_id: user?.id,
      });

      toast.success("Saldo recalculado com sucesso");
      setRecalcAccount(null);
      fetchAccounts();
    } catch (error: any) {
      console.error("Error recalculating balance:", error);
      toast.error("Erro ao recalcular: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsRecalcing(false);
    }
  };

  const [zeroConfirmOpen, setZeroConfirmOpen] = useState(false);
  const [isZeroing, setIsZeroing] = useState(false);

  const eligibleForZero = accounts.filter((a) => {
    const income = incomeByAccount[a.id] || 0;
    const expense = expenseByAccount[a.id] || 0;
    return income === 0 && expense === 0 && Math.abs(Number(a.balance || 0)) >= 0.005;
  });

  const handleZeroOpenings = async () => {
    if (eligibleForZero.length === 0 || isZeroing) return;
    setIsZeroing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ids = eligibleForZero.map((a) => a.id);
      const { error } = await supabase
        .from("bank_accounts")
        .update({ balance: 0 })
        .in("id", ids);
      if (error) throw error;

      await supabase.from("bank_account_balance_history").insert(
        eligibleForZero.map((a) => ({
          bank_account_id: a.id,
          previous_balance: Number(a.balance || 0),
          new_balance: 0,
          user_id: user?.id,
        })),
      );

      toast.success(`${eligibleForZero.length} ${eligibleForZero.length === 1 ? "abertura zerada" : "aberturas zeradas"}`);
      setZeroConfirmOpen(false);
      fetchAccounts();
    } catch (error: any) {
      console.error("Error zeroing openings:", error);
      toast.error("Erro ao zerar aberturas: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsZeroing(false);
    }
  };


   const cancelEdit = () => setEditingAccount(null);

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
      if (error) throw error;
      setDeleteConfirm(null);
      fetchAccounts();
      toast.success("Conta excluída");
    } catch (error: any) {
      console.error("Error deleting account:", error);
      toast.error("Erro ao excluir conta: " + (error.message || "Erro desconhecido"));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const totalCurrent = accounts.reduce((sum, a) => sum + a.balance + (incomeByAccount[a.id] || 0) - (expenseByAccount[a.id] || 0), 0);

  return (
    <div className="a11y-focus-scope animate-page-enter flex flex-col gap-8 px-2 sm:px-4 pt-6 pb-28">
      {/* Header and Total Balance */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="interactive-button flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-sm hover:bg-accent transition-all shrink-0">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </Link>
          <div className="flex flex-col min-w-0">
            <h1 className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] truncate">Contas</h1>
            <p className="text-2xl font-bold text-foreground tabular-nums tracking-tight truncate">
              {balanceVisible ? `R$ ${totalCurrent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ ••••"}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0 self-end mb-0.5">
          <button 
            onClick={() => updateBalanceVisible(!balanceVisible)} 
            className="interactive-button flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-sm hover:bg-accent transition-all"
            title={balanceVisible ? "Ocultar saldos" : "Mostrar saldos"}
          >
            {balanceVisible ? <Eye className="h-5 w-5 text-muted-foreground" /> : <EyeOff className="h-5 w-5 text-muted-foreground" />}
          </button>
          <button 
            onClick={() => setDialogOpen(true)} 
            className="interactive-button flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground border border-primary/20 shadow-lg hover:brightness-110 transition-all"
            title="Adicionar conta"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Empty state */}
      {accounts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Landmark className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-base font-medium text-foreground mb-1.5 tracking-tight">Nenhuma conta ainda</p>
          <p className="text-sm text-muted-foreground max-w-[240px]">Adicione sua primeira conta bancária para acompanhar saldos e movimentações</p>
        </div>
      )}

      {/* Accounts list — grouped card with dividers */}
      {accounts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">Suas contas</p>
              <button 
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode);
                  setSelectedIds(new Set());
                }}
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors",
                  isSelectionMode ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:bg-accent/80"
                )}
              >
                {isSelectionMode ? "Cancelar Seleção" : "Seleção Múltipla"}
              </button>
            </div>
            {eligibleForZero.length > 0 && !isSelectionMode && (
              <button
                onClick={() => setZeroConfirmOpen(true)}
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                title="Zerar abertura de contas sem transações visíveis"
              >
                <Eraser className="h-3 w-3" />
                Zerar aberturas ({eligibleForZero.length})
              </button>
            )}
          </div>

          {isSelectionMode && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 px-1 animate-in slide-in-from-top-1 duration-200">
              <button 
                onClick={() => handleBulkVisibility(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary/10 text-primary text-[11px] font-bold border border-primary/20 hover:bg-primary/20 transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
                Mostrar Selecionadas ({selectedIds.size})
              </button>
              <button 
                onClick={() => handleBulkVisibility(false)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-destructive/10 text-destructive text-[11px] font-bold border border-destructive/20 hover:bg-destructive/20 transition-colors"
              >
                <EyeOff className="h-3.5 w-3.5" />
                Ocultar Selecionadas ({selectedIds.size})
              </button>
            </div>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={accounts.map((a) => a.id)} strategy={verticalListSortingStrategy}>
              <div className="rounded-2xl bg-card overflow-hidden divide-y divide-border/10">
                {accounts.map((account, i) => (
                  <SortableAccountItem
                    key={account.id}
                    account={account}
                    index={i}
                     isEditing={editingAccount?.id === account.id}
                    editName={editName}
                    editBalance={editBalance}
                    setEditName={setEditName}
                    setEditBalance={setEditBalance}
                    income={incomeByAccount[account.id] || 0}
                    expense={expenseByAccount[account.id] || 0}
                    deleteConfirm={deleteConfirm}
                    setDeleteConfirm={setDeleteConfirm}
                    startEdit={startEdit}
                    saveEdit={saveEdit}
                    cancelEdit={cancelEdit}
                    handleDelete={handleDelete}
                    setCsvImportAccount={setCsvImportAccount}
                    setPdfImportAccount={setPdfImportAccount}
                    handleToggleVisibility={handleToggleVisibility}
                    openRecalc={openRecalc}
                    openBreakdown={openBreakdown}

                    isSelectionMode={isSelectionMode}
                    isSelected={selectedIds.has(account.id)}
                    onToggleSelect={toggleSelect}
                    balanceVisible={balanceVisible}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Add button */}
      <button
        onClick={openAddDialog}
        className="interactive-button flex items-center justify-center gap-2 rounded-full bg-foreground py-3.5 text-sm font-medium text-background hover:bg-foreground/90 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Adicionar conta
      </button>

       {/* Add/Edit Account Dialog */}
       <Dialog open={dialogOpen || !!editingAccount} onOpenChange={(v) => {
         if (!v) {
           setDialogOpen(false);
           setEditingAccount(null);
         }
       }}>
         <DialogContent className="max-w-sm mx-auto rounded-2xl">
           <DialogHeader>
             <DialogTitle>{editingAccount ? "Editar conta" : "Nova conta"}</DialogTitle>
           </DialogHeader>
           <div className="flex flex-col gap-4 mt-2">
             <div className="space-y-1.5">
               <Label className="text-xs text-muted-foreground">Banco</Label>
               <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1">
                 {bankPresets.map((bank) => (
                   <button
                     key={bank.id}
                     type="button"
                     onClick={() => {
                       if (editingAccount) {
                         setEditIcon(bank.id);
                         setEditColor(bank.color);
                         if (!editName || bankPresets.some(b => b.label === editName)) {
                           setEditName(bank.id === "custom" ? "" : bank.label);
                         }
                       } else {
                         setFormIcon(bank.id);
                         setFormColor(bank.color);
                         if (!formName || bankPresets.some(b => b.label === formName)) {
                           setFormName(bank.id === "custom" ? "" : bank.label);
                         }
                       }
                     }}
                     className={`flex flex-col items-center gap-1 rounded-xl p-2 transition-colors ${(editingAccount ? editIcon : formIcon) === bank.id ? "bg-primary/15 ring-2 ring-primary" : "hover:bg-accent"}`}
                   >
                     <BankLogo icon={bank.id} color={bank.color} name={editingAccount ? editName : formName} size="sm" />
                     <span className="text-[10px] text-muted-foreground truncate w-full text-center">{bank.label}</span>
                   </button>
                 ))}
               </div>
             </div>
             <div className="space-y-1.5">
               <Label className="text-xs text-muted-foreground">Nome da conta</Label>
                <Input
                  autoFocus
                  value={editingAccount ? editName : formName}
                  onChange={(e) => editingAccount ? setEditName(e.target.value) : setFormName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const amountBtn = document.querySelector('button[aria-label^="Valor:"]') as HTMLButtonElement;
                      if (amountBtn) amountBtn.focus();
                    }
                  }}
                  placeholder="Ex: Banco do Brasil"
                  className="rounded-xl focus-visible:ring-primary/30"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Saldo Inicial (R$)</Label>
                <CalculatorAmountInput
                  value={parseFloat(editingAccount ? editBalance : formBalance) || 0}
                  onChange={(v) => editingAccount ? setEditBalance(v.toString()) : setFormBalance(v.toString())}
                />
              </div>
             {((editingAccount ? editIcon : formIcon) === "custom") && (
               <div className="space-y-1.5">
                 <Label className="text-xs text-muted-foreground">Cor</Label>
                 <Select
                   value={editingAccount ? editColor : formColor}
                   onValueChange={editingAccount ? setEditColor : setFormColor}
                 >
                   <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                   <SelectContent>
                     {bankColorOptions.map((c) => (
                       <SelectItem key={c.value} value={c.value}>
                         <span className="inline-flex items-center gap-2">
                           <span aria-hidden className={cn("inline-block h-3 w-3 rounded-full bg-gradient-to-br ring-1 ring-black/10", c.value)} />
                           {c.label}
                         </span>
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
             )}
              {showConfirmUpdate ? (
                <div className="mt-2 space-y-2">
                  <div className="bg-destructive/10 p-3 rounded-xl space-y-3">
                    <p className="text-[11px] text-destructive font-semibold text-center leading-tight">
                      Atenção: Você está alterando o saldo inicial. Isso impactará o saldo histórico da conta.
                    </p>
                    {(() => {
                      const valid = validateAccount(editName, editBalance);
                      const originalAccount = accounts.find(a => a.id === editingAccount?.id);
                      if (!valid || !originalAccount) return null;
                      const diff = valid.balance - originalAccount.balance;
                      return (
                        <div className="flex flex-col gap-1 items-center bg-background/40 py-2 px-1 rounded-lg">
                          <div className="flex items-center gap-4 text-xs font-medium">
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] uppercase text-muted-foreground">Anterior</span>
                              <span className="tabular-nums">R$ {originalAccount.balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="text-muted-foreground">→</div>
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] uppercase text-primary">Novo</span>
                              <span className="tabular-nums font-bold">R$ {valid.balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                          <div className={cn(
                            "text-[10px] font-bold mt-1 px-2 py-0.5 rounded-full",
                            diff > 0 ? "bg-primary/20 text-primary" : "bg-destructive/20 text-destructive"
                          )}>
                            {diff > 0 ? "+" : ""} R$ {diff.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => editingAccount && saveEdit(editingAccount.id)}
                      disabled={isSubmitting}
                      className="flex-1 interactive-button flex items-center justify-center gap-2 rounded-2xl bg-destructive py-3 text-sm font-medium text-white disabled:opacity-30 transition-opacity"
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar Alteração"}
                    </button>
                    <button
                      onClick={() => setShowConfirmUpdate(false)}
                      className="flex-1 interactive-button flex items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-medium text-foreground"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => editingAccount ? saveEdit(editingAccount.id) : handleAdd()}
                  disabled={(editingAccount ? !editName.trim() : !formName.trim()) || isSubmitting}
                  className="interactive-button flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-50 mt-2"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingAccount ? "Salvar alterações" : "Adicionar conta")}
                </button>
              )}
           </div>
         </DialogContent>
       </Dialog>

      {/* Recalcular saldo dialog */}
      <Dialog open={!!recalcAccount} onOpenChange={(v) => { if (!v) setRecalcAccount(null); }}>
        <DialogContent className="max-w-sm mx-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Recalcular saldo</DialogTitle>
          </DialogHeader>
          {recalcAccount && (() => {
            const income = incomeByAccount[recalcAccount.id] || 0;
            const expense = expenseByAccount[recalcAccount.id] || 0;
            const opening = Number(recalcAccount.balance || 0);
            const computed = Math.round((opening + income - expense) * 100) / 100;
            const newOpening = Math.round((recalcRealBalance - income + expense) * 100) / 100;
            const diff = Math.round((newOpening - opening) * 100) / 100;
            const fmt = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
            return (
              <div className="flex flex-col gap-4 mt-2">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Informe o saldo real da conta <span className="font-semibold text-foreground">{recalcAccount.name}</span> (ex.: do extrato bancário). O saldo de abertura será ajustado para bater com esse valor, preservando as transações visíveis.
                </p>

                <div className="rounded-xl bg-muted/40 p-3 space-y-1.5 text-[11px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Abertura atual</span><span className="tabular-nums font-medium">{fmt(opening)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">+ Receitas visíveis</span><span className="tabular-nums text-primary">{fmt(income)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">− Despesas visíveis</span><span className="tabular-nums text-destructive">{fmt(expense)}</span></div>
                  <div className="flex justify-between border-t border-border/40 pt-1.5 mt-1.5"><span className="font-semibold">Saldo calculado</span><span className="tabular-nums font-bold">{fmt(computed)}</span></div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Saldo real (R$)</Label>
                  <CalculatorAmountInput
                    value={recalcRealBalance}
                    onChange={(v) => setRecalcRealBalance(v)}
                  />
                </div>

                {Math.abs(diff) >= 0.005 && (
                  <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-[11px] space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Nova abertura</span><span className="tabular-nums font-bold">{fmt(newOpening)}</span></div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ajuste</span>
                      <span className={cn("tabular-nums font-semibold", diff > 0 ? "text-primary" : "text-destructive")}>{diff > 0 ? "+" : ""}{fmt(diff)}</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleRecalc}
                    disabled={isRecalcing}
                    className="flex-1 interactive-button flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {isRecalcing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
                  </button>
                  <button
                    onClick={() => setRecalcAccount(null)}
                    className="flex-1 interactive-button flex items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-medium text-foreground"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Composição do saldo dialog */}
      <Dialog open={!!breakdownAccount} onOpenChange={(v) => { if (!v) { setBreakdownAccount(null); setBreakdownData(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Composição do saldo{breakdownAccount ? ` — ${breakdownAccount.name}` : ""}</DialogTitle>
          </DialogHeader>
          {isLoadingBreakdown && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
          {breakdownAccount && breakdownData && !isLoadingBreakdown && (() => {
            const opening = Math.round(Number(breakdownAccount.balance || 0) * 100) / 100;
            const income = breakdownData.incomeSum;
            const expense = breakdownData.expenseSum;
            const total = Math.round((opening + income - expense) * 100) / 100;
            const fmt = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
            const fmtDate = (d: string) => {
              try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return d; }
            };
            return (
              <div className="space-y-5">
                {/* Fórmula */}
                <div className="rounded-xl border border-border bg-accent/30 p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Abertura</span>
                    <span className="font-semibold tabular-nums">{fmt(opening)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">+ Receitas ({breakdownData.included.filter(t => t.type === "income").length})</span>
                    <span className="font-semibold tabular-nums text-emerald-600">{fmt(income)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">− Despesas ({breakdownData.included.filter(t => t.type !== "income").length})</span>
                    <span className="font-semibold tabular-nums text-destructive">{fmt(expense)}</span>
                  </div>
                  <div className="h-px bg-border my-1" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-foreground">= Saldo atual</span>
                    <span className={cn("font-bold tabular-nums", total < 0 ? "text-destructive" : "text-foreground")}>{fmt(total)}</span>
                  </div>
                </div>

                {/* Ignoradas: vinculadas a cartão */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Ignoradas — vinculadas a cartão ({breakdownData.cardLinked.length})
                      </p>
                    </div>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{fmt(breakdownData.cardSum)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80">Não afetam o saldo da conta — impactam a fatura do cartão.</p>
                  {breakdownData.cardLinked.length > 0 ? (
                    <div className="rounded-lg border border-border max-h-40 overflow-y-auto divide-y divide-border/60">
                      {breakdownData.cardLinked.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground truncate">{tx.description || "(sem descrição)"}</p>
                            <p className="text-[10px] text-muted-foreground">{fmtDate(tx.date)} · {tx.card}</p>
                          </div>
                          <span className={cn("tabular-nums font-semibold ml-2", tx.type === "income" ? "text-emerald-600" : "text-destructive")}>
                            {tx.type === "income" ? "+" : "−"}{fmt(Number(tx.amount) || 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic px-1">Nenhuma.</p>
                  )}
                </div>

                {/* Ocultadas */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Ocultadas ({breakdownData.hidden.length})
                      </p>
                    </div>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      +{fmt(breakdownData.hiddenIncomeSum)} / −{fmt(breakdownData.hiddenExpenseSum)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80">Marcadas como invisíveis — excluídas do saldo até serem reexibidas.</p>
                  {breakdownData.hidden.length > 0 ? (
                    <div className="rounded-lg border border-border max-h-40 overflow-y-auto divide-y divide-border/60">
                      {breakdownData.hidden.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground truncate">{tx.description || "(sem descrição)"}</p>
                            <p className="text-[10px] text-muted-foreground">{fmtDate(tx.date)}</p>
                          </div>
                          <span className={cn("tabular-nums font-semibold ml-2", tx.type === "income" ? "text-emerald-600" : "text-destructive")}>
                            {tx.type === "income" ? "+" : "−"}{fmt(Number(tx.amount) || 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic px-1">Nenhuma.</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => { setBreakdownAccount(null); setBreakdownData(null); }}
                  className="w-full py-2.5 rounded-xl bg-accent text-foreground text-sm font-semibold hover:bg-accent/80 transition-colors"
                >
                  Fechar
                </button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>



      <Dialog open={zeroConfirmOpen} onOpenChange={(v) => { if (!v && !isZeroing) setZeroConfirmOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Zerar aberturas sem movimentações</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              O saldo de abertura das contas abaixo será definido como <span className="font-semibold text-foreground">R$ 0,00</span>. Somente contas <span className="font-semibold text-foreground">sem transações visíveis</span> serão afetadas. Esta ação será registrada no histórico.
            </p>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {eligibleForZero.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-medium text-foreground truncate">{a.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    R$ {Number(a.balance || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
              {eligibleForZero.length === 0 && (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">Nenhuma conta elegível.</div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setZeroConfirmOpen(false)}
                disabled={isZeroing}
                className="flex-1 py-2.5 rounded-xl bg-accent text-foreground text-sm font-semibold hover:bg-accent/80 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleZeroOpenings}
                disabled={isZeroing || eligibleForZero.length === 0}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:brightness-110 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {isZeroing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />}
                Zerar {eligibleForZero.length > 0 ? `(${eligibleForZero.length})` : ""}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>






      <Suspense fallback={null}>
        {csvImportAccount && (
          <CsvImportDialog
            open={!!csvImportAccount}
            onOpenChange={(v) => { if (!v) setCsvImportAccount(null); }}
            bankAccountId={csvImportAccount.id}
            bankAccountName={csvImportAccount.name}
            accounts={accounts.map(a => ({ id: a.id, name: a.name }))}
            onSuccess={fetchAccounts}
          />
        )}

        {pdfImportAccount && (
          <PdfStatementImportDialog
            open={!!pdfImportAccount}
            onOpenChange={(v) => { if (!v) setPdfImportAccount(null); }}
            bankAccountId={pdfImportAccount.id}
            bankAccountName={pdfImportAccount.name}
            onSuccess={fetchAccounts}
          />
        )}
      </Suspense>
    </div>
  );
}
