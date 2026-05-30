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
                <div className="w-32">
                  <CalculatorAmountInput
                    value={parseFloat(editBalance) || 0}
                    onChange={(v) => setEditBalance(v.toString())}
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
  const { balanceVisible, updateBalanceVisible, hideZeroBalances, updateHideZeroBalances } = useUserPreferences();
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
    try {
      const { data, error } = await supabase.from("bank_accounts").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true });
      if (error) throw error;
      if (data) setAccounts(data);

      const { data: txData, error: txError } = await supabase.from("transactions").select("bank_account_id, amount, type").not("bank_account_id", "is", null);
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

