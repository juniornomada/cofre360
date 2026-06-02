import { createFileRoute } from "@tanstack/react-router";
import { SmartLink as Link } from "@/components/SmartLink";
import { ArrowLeft, Plus, Landmark, Trash2, X, Check, Loader2, Upload, FileText, MoreVertical, GripVertical, Pencil, Eye, EyeOff, CheckSquare, Square, Filter, FilterX } from "lucide-react";
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

  const currentBalance = account.balance + income - expense;

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
      onClick={() => isSelectionMode && onToggleSelect(account.id)}
    >
      <div className="flex items-center gap-2.5 px-2 sm:px-4 py-0.5">
        {isSelectionMode && (
          <div className="flex items-center justify-center shrink-0 w-8 h-8 rounded-full hover:bg-accent transition-colors">
            {isSelected ? (
              <CheckSquare className="h-5 w-5 text-primary" />
            ) : (
              <Square className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        )}
        <BankLogo icon={account.icon || ""} color={account.color || ""} name={account.name} size="sm" />
        <div className="flex-1 min-w-0" style={{ animationDelay: `${60 + index * 80}ms` }}>
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
                <div className="w-24 sm:w-32 shrink-0">
                  <CalculatorAmountInput
                    value={parseFloat(editBalance) || 0}
                    onChange={(v) => setEditBalance(v.toString())}
                    className="h-8 text-xs sm:text-sm"
                  />
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => startEdit(account)}
              className="text-left w-full"
            >
              <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-[15px] font-semibold text-foreground truncate tracking-tight leading-tight">{account.name}</p>
                    {account.is_visible === false && (
                      <EyeOff className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                    )}
                    <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground shrink-0" />
                  </div>
                <p className={cn(
                  "text-[15px] font-bold tabular-nums tracking-tight leading-tight whitespace-nowrap shrink-0",
                  currentBalance < 0 ? "text-destructive" : "text-foreground"
                )}>
                  {balanceVisible ? `R$ ${currentBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ ••••"}
                </p>
              </div>
            </button>
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
                  <DropdownMenuItem onClick={() => startEdit(account)} className="cursor-pointer">
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar conta
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

      const { data: txData, error: txError } = await supabase.from("transactions").select("bank_account_id, amount, type").eq("user_id", session.user.id).not("bank_account_id", "is", null);
      if (txError) throw txError;

      if (txData) {
        const incMap: Record<string, number> = {};
        const expMap: Record<string, number> = {};
        for (const tx of txData) {
          const id = tx.bank_account_id as string;
          if (tx.type === "income") {
            incMap[id] = (incMap[id] || 0) + Number(tx.amount);
          } else {
            expMap[id] = (expMap[id] || 0) + Number(tx.amount);
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
    const promise = (async () => {
      const payload = {
        id: crypto.randomUUID(),
        ...valid,
        icon: formIcon,
        color: formColor,
      };
      const { error } = await supabase.from("bank_accounts").insert(payload);
      if (error) throw error;
      setDialogOpen(false);
      await fetchAccounts();
    })();

    toast.promise(promise, {
      loading: "Adicionando conta...",
      success: "Conta adicionada com sucesso!",
      error: (err) => `Erro ao adicionar conta: ${err.message || err}`,
    });

    try {
      await promise;
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

    if (showConfirmUpdate && confirmText !== "CONFIRMAR") {
      toast.error("Digite CONFIRMAR para autorizar a alteração do saldo inicial.");
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
    <div className="animate-page-enter flex flex-col gap-8 px-2 sm:px-4 pt-6 pb-28">
      {/* Header and Total Balance */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="interactive-button flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent transition-colors shrink-0">
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <div className="flex flex-col min-w-0">
            <h1 className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] truncate">Contas</h1>
            <p className="text-2xl font-bold text-foreground tabular-nums tracking-tight truncate">
              {balanceVisible ? `R$ ${totalCurrent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ ••••"}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1 shrink-0 self-end mb-0.5">
          <button onClick={() => updateBalanceVisible(!balanceVisible)} className="interactive-button p-2 rounded-lg hover:bg-accent/50 text-muted-foreground">
            {balanceVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
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
                 value={editingAccount ? editName : formName}
                 onChange={(e) => editingAccount ? setEditName(e.target.value) : setFormName(e.target.value)}
                 placeholder="Ex: Banco do Brasil"
                 className="rounded-xl"
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
                       <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>
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
                    <p className="text-[10px] text-muted-foreground text-center">
                      Para salvar, digite <span className="font-bold text-destructive">CONFIRMAR</span> abaixo:
                    </p>
                    <Input
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                      placeholder="Digite CONFIRMAR"
                      className="h-9 text-center uppercase font-bold border-destructive/20 focus-visible:ring-destructive"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => editingAccount && saveEdit(editingAccount.id)}
                      disabled={confirmText !== "CONFIRMAR" || isSubmitting}
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
