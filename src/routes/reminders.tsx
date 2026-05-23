import { createFileRoute } from "@tanstack/react-router";
import { Bell, Plus, Check, Trash2, Pencil, CalendarIcon, Loader2, Clock, Wallet, CreditCard, Repeat, Search } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { format, parse, isPast, isToday, isTomorrow, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn, normalizeText } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { categorizeTransaction } from "@/lib/categorize-transaction";
import { CategoryPicker } from "@/components/CategoryPicker";
import { getCategoryDisplay } from "@/lib/categories";
import { toast } from "sonner";

export const Route = createFileRoute("/reminders")({
  head: () => ({
    meta: [
      { title: "Lembretes — Cofre 360" },
      { name: "description", content: "Gerencie seus lembretes de pagamentos e recebimentos" },
    ],
  }),
  component: RemindersPage,
});

interface Reminder {
  id: string;
  title: string | null;
  amount: number | null;
  due_date: string | null;
  completion_date: string | null;
  type: string | null;
  category: string | null;
  icon: string | null;
  is_completed: boolean | null;
  notes: string | null;
  bank_account_id: string | null;
  card_id: string | null;
  is_recurring: boolean | null;
  recurrence_day: number | null;
}

const iconOptions = ["🔔", "💰", "🏠", "💳", "📱", "⚡", "💧", "🌐", "🚗", "🏥", "📺", "🎓", "🛡️", "💸"];

function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string; icon: string | null; balance: number; color: string | null }[]>([]);
  const [cards, setCards] = useState<{ id: string; name: string; emoji: string | null; last_four: string | number | null; card_limit: number; used: number; color: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  
  
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [payingReminder, setPayingReminder] = useState<Reminder | null>(null);
  const [paying, setPaying] = useState(false);
  const [payDate, setPayDate] = useState<Date>(new Date());
  const [payDateOpen, setPayDateOpen] = useState(false);

  const [newReminder, setNewReminder] = useState({
    title: "",
    amount: 0,
    due_date: "",
    type: "expense" as "expense" | "income",
    category: "Moradia > Aluguel",
    icon: "🏠",
    notes: "",
    bank_account_id: null as string | null,
    card_id: null as string | null,
    is_recurring: false,
    recurrence_day: null as number | null,
  });

  const fetchReminders = useCallback(async () => {
    try {
      const [remindersRes, accountsRes, cardsRes] = await Promise.all([
        supabase.from("reminders").select("*").order("due_date", { ascending: true }),
        supabase.from("bank_accounts").select("id, name, icon, balance, color"),
        supabase.from("cards").select("id, name, emoji, last_four, card_limit, used, color"),
      ]);
      if (remindersRes.error) throw remindersRes.error;
      if (accountsRes.error) throw accountsRes.error;
      if (cardsRes.error) throw cardsRes.error;

      if (remindersRes.data) setReminders(remindersRes.data as Reminder[]);
      if (accountsRes.data) setBankAccounts(accountsRes.data);
      if (cardsRes.data) setCards(cardsRes.data);
    } catch (error: any) {
      console.error("Error fetching reminders:", error);
      toast.error("Erro ao carregar lembretes: " + (error.message || "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const handleAdd = async () => {
    try {
      if (!newReminder.title || !newReminder.due_date) {
        toast.error("Preencha o título e a data");
        return;
      }
      const recurrenceDay = newReminder.is_recurring
        ? (() => {
            const d = parseDate(newReminder.due_date);
            return isNaN(d.getTime()) ? null : d.getDate();
          })()
        : null;
      const { error } = await supabase.from("reminders").insert({
        title: newReminder.title,
        amount: newReminder.amount,
        due_date: newReminder.due_date,
        type: newReminder.type,
        category: newReminder.category,
        icon: newReminder.icon,
        notes: newReminder.notes,
        bank_account_id: newReminder.bank_account_id,
        card_id: newReminder.card_id,
        is_recurring: newReminder.is_recurring,
        recurrence_day: recurrenceDay,
      });
      if (error) throw error;
      setShowAddDialog(false);
      setNewReminder({ title: "", amount: 0, due_date: "", type: "expense", category: "Conta", icon: "🔔", notes: "", bank_account_id: null, card_id: null, is_recurring: false, recurrence_day: null });
      toast.success("Lembrete criado!");
      fetchReminders();
    } catch (error: any) {
      console.error("Error adding reminder:", error);
      toast.error("Erro ao criar lembrete: " + (error.message || "Erro desconhecido"));
    }
  };

  const handleSaveEdit = async () => {
    try {
      if (!editReminder) return;
      const recurrenceDay = editReminder.is_recurring
        ? (editReminder.recurrence_day ?? (() => {
            const d = parseDate(editReminder.due_date);
            return isNaN(d.getTime()) ? null : d.getDate();
          })())
        : null;
      const { error } = await supabase.from("reminders").update({
        title: editReminder.title,
        amount: editReminder.amount,
        due_date: editReminder.due_date,
        type: editReminder.type,
        category: editReminder.category,
        icon: editReminder.icon,
        notes: editReminder.notes,
        is_completed: editReminder.is_completed,
        bank_account_id: editReminder.bank_account_id,
        card_id: editReminder.card_id,
        is_recurring: editReminder.is_recurring,
        recurrence_day: recurrenceDay,
      }).eq("id", editReminder.id);
      if (error) throw error;
      setShowEditDialog(false);
      setEditReminder(null);
      toast.success("Lembrete atualizado!");
      fetchReminders();
    } catch (error: any) {
      console.error("Error updating reminder:", error);
      toast.error("Erro ao atualizar lembrete: " + (error.message || "Erro desconhecido"));
    }
  };

  // Cria a próxima ocorrência mensal de um lembrete recorrente
  const generateNextOccurrence = async (reminder: Reminder) => {
    if (!reminder.is_recurring) return;
    try {
      const current = parseDate(reminder.due_date);
      if (isNaN(current.getTime())) return;
      const next = new Date(current);
      next.setMonth(next.getMonth() + 1);
      // Ajustar para o dia de recorrência (lidando com meses curtos)
      const day = reminder.recurrence_day ?? current.getDate();
      const lastDayOfMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(day, lastDayOfMonth));
      const nextDateStr = format(next, "dd MMM", { locale: ptBR });
      await supabase.from("reminders").insert({
        title: reminder.title,
        amount: reminder.amount,
        due_date: nextDateStr,
        type: reminder.type,
        category: reminder.category,
        icon: reminder.icon,
        notes: reminder.notes,
        bank_account_id: reminder.bank_account_id,
        card_id: reminder.card_id,
        is_recurring: true,
        recurrence_day: day,
      });
    } catch {
      // silencioso, não bloqueia o fluxo principal
    }
  };

  const handleToggleComplete = async (reminder: Reminder) => {
    if (reminder.is_completed) {
      try {
        // Reativar
        const { error } = await supabase.from("reminders").update({ 
          is_completed: false,
          completion_date: null 
        }).eq("id", reminder.id);
        if (error) throw error;
        toast.success("Lembrete reativado");
        fetchReminders();
      } catch (error: any) {
        console.error("Error reactivating reminder:", error);
        toast.error("Erro ao reativar lembrete");
      }
      return;
    }
    // Sempre abre o dialog para escolher data + conta/cartão
    setPayingReminder(reminder);
    setPayDate(new Date());
    setShowPayDialog(true);
  };

  const handlePayWithAccount = async (accountId: string, reminderArg?: Reminder) => {
    const reminder = reminderArg ?? payingReminder;
    if (!reminder) return;
    setPaying(true);
    try {
      const account = bankAccounts.find(a => a.id === accountId);
      if (!account) throw new Error("Conta não encontrada");

      const { category, icon } = categorizeTransaction(reminder.title);
      const today = format(payDate, "dd MMM", { locale: ptBR });
      const isIncome = reminder.type === "income";
      const amount = Number(reminder.amount);

      await supabase.from("transactions").insert({
        name: reminder.title,
        amount,
        date: today,
        type: isIncome ? "income" : "expense",
        category: category || reminder.category,
        icon: reminder.icon || icon,
        bank_account_id: accountId,
      });

      const newBalance = isIncome
        ? Number(account.balance) + amount
        : Number(account.balance) - amount;
      await supabase.from("bank_accounts").update({ balance: newBalance }).eq("id", accountId);

      await supabase.from("reminders").update({ 
        is_completed: true,
        completion_date: today 
      }).eq("id", reminder.id);
      await generateNextOccurrence(reminder);

      const recurringMsg = reminder.is_recurring ? " (próxima ocorrência criada)" : "";
      toast.success(`${isIncome ? "Recebimento" : "Pagamento"} registrado em ${account.name}${recurringMsg}`);
      setShowPayDialog(false);
      setPayingReminder(null);
      fetchReminders();
    } catch {
      toast.error("Erro ao registrar transação");
    } finally {
      setPaying(false);
    }
  };

  const handlePayWithCard = async (cardId: string, reminderArg?: Reminder) => {
    const reminder = reminderArg ?? payingReminder;
    if (!reminder) return;
    if (reminder.type === "income") {
      toast.error("Recebimentos não podem ser feitos via cartão");
      return;
    }
    setPaying(true);
    try {
      const card = cards.find(c => c.id === cardId);
      if (!card) throw new Error("Cartão não encontrado");

      const { category, icon } = categorizeTransaction(reminder.title);
      const today = format(payDate, "dd MMM", { locale: ptBR });
      const amount = Number(reminder.amount);

      await supabase.from("transactions").insert({
        name: reminder.title,
        amount,
        date: today,
        type: "expense",
        category: category || reminder.category,
        icon: reminder.icon || icon,
        card: card.name,
      });

      await supabase.from("cards").update({ used: Number(card.used) + amount }).eq("id", cardId);
      await supabase.from("reminders").update({ 
        is_completed: true,
        completion_date: today 
      }).eq("id", reminder.id);
      await generateNextOccurrence(reminder);

      const recurringMsg = reminder.is_recurring ? " (próxima ocorrência criada)" : "";
      toast.success(`Pagamento registrado no ${card.name}${recurringMsg}`);
      setShowPayDialog(false);
      setPayingReminder(null);
      fetchReminders();
    } catch {
      toast.error("Erro ao registrar transação");
    } finally {
      setPaying(false);
    }
  };

  const handleDelete = async () => {
    try {
      if (!deletingId) return;
      const { error } = await supabase.from("reminders").delete().eq("id", deletingId);
      if (error) throw error;
      setShowDeleteDialog(false);
      setDeletingId(null);
      toast.success("Lembrete excluído");
      fetchReminders();
    } catch (error: any) {
      console.error("Error deleting reminder:", error);
      toast.error("Erro ao excluir lembrete: " + (error.message || "Erro desconhecido"));
    }
  };

  const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const monthMap: Record<string, string> = {
    jan: "jan", feb: "fev", mar: "mar", apr: "abr", may: "mai", jun: "jun",
    jul: "jul", aug: "ago", sep: "set", oct: "out", nov: "nov", dec: "dez",
  };

  const translateDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const fullMonths = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    // Handle ISO format yyyy-mm-dd
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (isoMatch) {
      const [, , mm, dd] = isoMatch;
      return `${parseInt(dd, 10)} ${fullMonths[parseInt(mm, 10) - 1]}`;
    }
    const parts = dateStr.split(" ");
    if (parts.length !== 2) return dateStr;
    const [day, month] = parts;
    const key = month.toLowerCase().slice(0, 3);
    const translatedShort = monthMap[key];
    if (!translatedShort) return dateStr;
    const idx = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"].indexOf(translatedShort);
    return `${day} ${idx >= 0 ? fullMonths[idx] : translatedShort}`;
  };

  const parseDate = (dateStr: string) => {
    // Handle ISO format yyyy-mm-dd directly
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (isoMatch) {
      const [, yyyy, mm, dd] = isoMatch;
      return new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
    }
    const normalized = translateDate(dateStr);
    let date = parse(normalized, "dd MMM", new Date(), { locale: ptBR });
    if (isNaN(date.getTime())) date = parse(dateStr, "dd MMM", new Date());
    return date;
  };

  const getDateStatus = (dateStr: string) => {
    try {
      const date = parseDate(dateStr);
      const displayDate = translateDate(dateStr);
      if (isToday(date)) return { label: "Hoje", color: "text-warning" };
      if (isTomorrow(date)) return { label: "Amanhã", color: "text-warning" };
      if (isPast(date)) return { label: "Atrasado", color: "text-destructive" };
      const days = differenceInDays(date, new Date());
      if (days <= 7) return { label: `${days} dias`, color: "text-primary" };
      return { label: displayDate, color: "text-muted-foreground" };
    } catch {
      return { label: translateDate(dateStr), color: "text-muted-foreground" };
    }
  };

  const filtered = reminders.filter((r) => {
    const qNormalized = normalizeText(searchQuery);
    const matchesSearch = !searchQuery || 
      normalizeText(r.title || "").includes(qNormalized) || 
      normalizeText(r.category || "").includes(qNormalized) ||
      normalizeText(r.notes || "").includes(qNormalized);
    
    if (!matchesSearch) return false;
    
    if (filter === "pending") return !r.is_completed;
    if (filter === "completed") return r.is_completed;
    return true;
  });

  const pendingCount = reminders.filter(r => !r.is_completed).length;
  const totalPending = reminders.filter(r => !r.is_completed && r.type === "expense").reduce((s, r) => s + Number(r.amount), 0);
  const totalReceivable = reminders.filter(r => !r.is_completed && r.type === "income").reduce((s, r) => s + Number(r.amount), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const renderFormFields = (data: typeof newReminder | Reminder, setData: (d: any) => void) => (
    <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Ícone</label>
        <div className="flex flex-wrap gap-2">
          {iconOptions.map(ic => (
            <button key={ic} onClick={() => setData({ ...data, icon: ic })} className={`text-xl p-1 rounded-lg transition-colors ${data.icon === ic ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-accent"}`}>{ic}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Título</label>
        <input value={data.title} onChange={e => setData({ ...data, title: e.target.value })} className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none" placeholder="Ex: Conta de luz" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              if (data.type !== "expense") {
                setData({ ...data, type: "expense", category: "Moradia > Aluguel", icon: "🏠" });
              }
            }} 
            className={`flex-1 rounded-xl py-2 text-xs font-medium transition-colors ${data.type === "expense" ? "bg-destructive text-destructive-foreground" : "bg-card text-muted-foreground"}`}
          >
            Pagamento
          </button>
          <button 
            onClick={() => {
              if (data.type !== "income") {
                setData({ ...data, type: "income", category: "Receita > Salário", icon: "💰" });
              }
            }} 
            className={`flex-1 rounded-xl py-2 text-xs font-medium transition-colors ${data.type === "income" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
          >
            Recebimento
          </button>
        </div>
      </div>
      <CategoryPicker 
        value={data.category || ""} 
        type={data.type as "expense" | "income"}
        onChange={(val, icon) => setData({ ...data, category: val, icon })} 
      />
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Valor (R$)</label>
        <input type="number" step="0.01" value={data.amount} onChange={e => setData({ ...data, amount: parseFloat(e.target.value) || 0 })} className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Data de vencimento</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl bg-card border-none", !data.due_date && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {data.due_date || "Selecionar data"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={(() => { try { return parseDate(data.due_date); } catch { return undefined; } })()} onSelect={(date) => { if (date) setData({ ...data, due_date: format(date, "dd MMM", { locale: ptBR }) }); }} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Pagar/Receber em (opcional)</label>
        <select
          value={data.bank_account_id ? `acc:${data.bank_account_id}` : data.card_id ? `card:${data.card_id}` : ""}
          onChange={e => {
            const v = e.target.value;
            if (!v) setData({ ...data, bank_account_id: null, card_id: null });
            else if (v.startsWith("acc:")) setData({ ...data, bank_account_id: v.slice(4), card_id: null });
            else if (v.startsWith("card:")) setData({ ...data, bank_account_id: null, card_id: v.slice(5) });
          }}
          className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none"
        >
          <option value="">Escolher ao concluir</option>
          {bankAccounts.length > 0 && <optgroup label="Contas bancárias">
            {bankAccounts.map(a => <option key={a.id} value={`acc:${a.id}`}>{a.name}</option>)}
          </optgroup>}
          {data.type !== "income" && cards.length > 0 && <optgroup label="Cartões de crédito">
            {cards.map(c => <option key={c.id} value={`card:${c.id}`}>{c.name}</option>)}
          </optgroup>}
        </select>
        {(data.bank_account_id || data.card_id) && (
          <p className="text-[10px] text-muted-foreground mt-1">Ao concluir, a transação será lançada automaticamente.</p>
        )}
      </div>
      <div className="rounded-xl bg-card p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Repetir mensalmente</p>
              <p className="text-[10px] text-muted-foreground">Gera automaticamente no próximo mês ao concluir</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setData({ ...data, is_recurring: !data.is_recurring })}
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors",
              data.is_recurring ? "bg-primary" : "bg-accent"
            )}
          >
            <span className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-background transition-transform",
              data.is_recurring ? "translate-x-5" : "translate-x-0.5"
            )} />
          </button>
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Observações</label>
        <textarea value={data.notes} onChange={e => setData({ ...data, notes: e.target.value })} className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none resize-none h-16" placeholder="Anotações opcionais..." />
      </div>
    </div>
  );

  return (
    <div className="animate-page-enter flex flex-col gap-4 px-4 pt-6 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Lembretes</h1>
          {pendingCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">{pendingCount}</span>
          )}
        </div>
        <button onClick={() => setShowAddDialog(true)} className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-card p-3">
          <p className="text-[10px] text-muted-foreground">A pagar</p>
          <p className="text-lg font-bold text-destructive tabular-nums">R$ {formatCurrency(totalPending)}</p>
        </div>
        <div className="rounded-xl bg-card p-3">
          <p className="text-[10px] text-muted-foreground">A receber</p>
          <p className="text-lg font-bold text-primary tabular-nums">R$ {formatCurrency(totalReceivable)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {([
          { key: "all", label: "Todos" },
          { key: "pending", label: "Pendentes" },
          { key: "completed", label: "Concluídos" },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`interactive-button whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-200 ${filter === f.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Reminders List */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12">
            <Bell className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhum lembrete {filter === "pending" ? "pendente" : filter === "completed" ? "concluído" : ""}</p>
          </div>
        ) : (
          filtered.map((reminder, i) => {
            const dateStatus = getDateStatus(reminder.due_date);
            const linkedAccount = reminder.bank_account_id ? bankAccounts.find(a => a.id === reminder.bank_account_id) : null;
            const linkedCard = reminder.card_id ? cards.find(c => c.id === reminder.card_id) : null;
            return (
              <div
                key={reminder.id}
                className={cn(
                  "group interactive-card relative flex items-center gap-2 rounded-xl bg-card p-2.5",
                  reminder.is_completed && "opacity-60"
                )}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <button
                  onClick={() => handleToggleComplete(reminder)}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg transition-all duration-200",
                    reminder.is_completed ? "bg-primary/20" : "bg-accent"
                  )}
                >
                  {reminder.is_completed ? <Check className="h-5 w-5 text-primary" /> : reminder.icon}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className={cn("text-sm font-medium truncate", reminder.is_completed ? "line-through text-muted-foreground" : "text-foreground")}>
                      {reminder.title}
                    </p>
                    {reminder.is_recurring && (
                      <span title="Mensal" className="flex shrink-0 items-center justify-center rounded-md bg-primary/10 p-0.5 text-primary">
                        <Repeat className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>
                  {reminder.notes && <p className="text-xs text-muted-foreground truncate">{reminder.notes}</p>}
                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{getCategoryDisplay(reminder.category || "")}</span>
                    <span className="text-[10px] text-muted-foreground">•</span>
                    <span className={cn("text-[10px] font-medium flex flex-col gap-0.5", !reminder.is_completed ? dateStatus.color : "text-muted-foreground")}>
                      <div className="flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        <span>
                          {reminder.is_completed 
                            ? `Vencimento: ${translateDate(reminder.due_date || "")}` 
                            : dateStatus.label}
                        </span>
                      </div>
                      {reminder.is_completed && reminder.completion_date && (
                        <div className="flex items-center gap-0.5 text-primary font-semibold">
                          <Check className="h-2.5 w-2.5" />
                          <span>
                            {reminder.type === "income" ? "Recebido em: " : "Pago em: "}
                            {translateDate(reminder.completion_date)}
                          </span>
                        </div>
                      )}
                    </span>
                    {linkedAccount && (
                      <span className={cn("rounded-md px-1.5 py-0.5 text-[9px] font-medium text-white bg-gradient-to-br", linkedAccount.color)}>
                        {linkedAccount.name}
                      </span>
                    )}
                    {linkedCard && (
                      <span className={cn("rounded-md px-1.5 py-0.5 text-[9px] font-medium text-white bg-gradient-to-br", linkedCard.color)}>
                        {linkedCard.name}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span className={cn(
                    "text-sm font-semibold tabular-nums",
                    reminder.type === "income" ? "text-primary" : "text-foreground"
                  )}>
                    {reminder.type === "expense" ? "- " : "+ "}R$ {formatCurrency(Number(reminder.amount))}
                  </span>
                  <div className="flex gap-1">
                    {!reminder.is_completed && (
                      <button
                        onClick={() => handleToggleComplete(reminder)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                        title="Efetivar lembrete"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditReminder({ ...reminder }); setShowEditDialog(true); }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { setDeletingId(reminder.id); setShowDeleteDialog(true); }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader><DialogTitle>Novo Lembrete</DialogTitle></DialogHeader>
          {renderFormFields(newReminder, setNewReminder)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
            <Button onClick={handleAdd}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader><DialogTitle>Editar Lembrete</DialogTitle></DialogHeader>
          {editReminder && renderFormFields(editReminder, setEditReminder)}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {!editReminder?.is_completed && (
              <Button 
                variant="secondary" 
                className="w-full sm:w-auto bg-primary/10 text-primary hover:bg-primary/20"
                onClick={() => {
                  if (editReminder) {
                    setShowEditDialog(false);
                    handleToggleComplete(editReminder);
                  }
                }}
              >
                Efetivar Agora
              </Button>
            )}
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setShowEditDialog(false)}>Cancelar</Button>
              <Button className="flex-1 sm:flex-none" onClick={handleSaveEdit}>Salvar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader><DialogTitle>Excluir Lembrete</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este lembrete?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay Dialog */}
      <Dialog open={showPayDialog} onOpenChange={(o) => { if (!o) { setShowPayDialog(false); setPayingReminder(null); } }}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader>
            <DialogTitle>
              {payingReminder?.type === "income" ? "Receber em" : "Pagar com"}
            </DialogTitle>
            <DialogDescription>
              {payingReminder && (
                <>
                  {payingReminder.title} • R$ {Number(payingReminder.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
            {/* Date Picker */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground">Data de efetivação</p>
              </div>
              <Popover open={payDateOpen} onOpenChange={setPayDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !payDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {isToday(payDate) ? "Hoje" : format(payDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={payDate}
                    onSelect={(d) => { if (d) { setPayDate(d); setPayDateOpen(false); } }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Bank Accounts */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground">Contas bancárias</p>
              </div>
              <div className="flex flex-col gap-2">
                {bankAccounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Nenhuma conta cadastrada</p>
                ) : (
                  bankAccounts.map(acc => {
                    const isSuggested = payingReminder?.bank_account_id === acc.id;
                    return (
                      <button
                        key={acc.id}
                        disabled={paying}
                        onClick={() => handlePayWithAccount(acc.id)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl bg-card p-3 hover:bg-accent transition-colors disabled:opacity-50 text-left relative overflow-hidden",
                          isSuggested && "ring-2 ring-primary bg-primary/5"
                        )}
                      >
                        {isSuggested && (
                          <div className="absolute top-0 right-0 bg-primary px-2 py-0.5 text-[8px] font-bold text-primary-foreground rounded-bl-lg">
                            SUGERIDO
                          </div>
                        )}
                        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg text-base text-white bg-gradient-to-br", acc.color)}>{acc.icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{acc.name}</p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">Saldo: R$ {Number(acc.balance).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Cards (only for expenses) */}
            {payingReminder?.type !== "income" && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground">Cartões de crédito</p>
                </div>
                <div className="flex flex-col gap-2">
                  {cards.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">Nenhum cartão cadastrado</p>
                  ) : (
                    cards.map(card => {
                      const available = Number(card.card_limit) - Number(card.used);
                      const isSuggested = payingReminder?.card_id === card.id;
                      return (
                        <button
                          key={card.id}
                          disabled={paying}
                          onClick={() => handlePayWithCard(card.id)}
                          className={cn(
                            "flex items-center gap-3 rounded-xl bg-card p-3 hover:bg-accent transition-colors disabled:opacity-50 text-left relative overflow-hidden",
                            isSuggested && "ring-2 ring-primary bg-primary/5"
                          )}
                        >
                          {isSuggested && (
                            <div className="absolute top-0 right-0 bg-primary px-2 py-0.5 text-[8px] font-bold text-primary-foreground rounded-bl-lg">
                              SUGERIDO
                            </div>
                          )}
                          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg text-base text-white bg-gradient-to-br", card.color)}>{card.emoji}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{card.name} •••• {card.last_four}</p>
                            <p className="text-[10px] text-muted-foreground tabular-nums">Disponível: R$ {available.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPayDialog(false); setPayingReminder(null); }} disabled={paying}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
