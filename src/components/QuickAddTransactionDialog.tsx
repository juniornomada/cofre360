import { useEffect, useState, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CategoryPicker } from "@/components/CategoryPicker";
import { CalendarIcon, ArrowLeftRight, ArrowRight, CreditCard, Landmark, Loader2, RotateCcw } from "lucide-react";
import { BankLogo } from "@/components/BankLogo";
import { CalculatorAmountInput } from "@/components/CalculatorAmountInput";
import { format, parse } from "date-fns";
import { calculateInstallmentDetails } from "@/lib/installment-utils";
import { validateInstallmentInputs } from "@/lib/installment-mode-toggle";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { sanitizeTransactionWrite, sanitizeTransactionWrites } from "@/lib/normalize-transaction-name";

export type QuickAddInitialType = "expense" | "income" | "transfer";

interface BankAccountOption { id: string; name: string; icon: string | null; color: string | null; balance: number }
interface CardOption { name: string; brand: string; emoji: string | null; color: string | null }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialType?: QuickAddInitialType;
  /** Pré-seleciona o cartão de crédito pelo nome (fluxo "Adicionar transação" a partir da fatura). */
  initialCardName?: string;
  /** Pré-seleciona a data em formato "dd MMM" (pt-BR). Fallback: hoje. */
  initialDate?: string;
  onSuccess?: () => void;
  copyData?: {
    name: string;
    amount: number;
    category: string;
    icon: string;
    card: string | null;
    bank_account_id: string | null;
  } | null;
}

interface NewTx {
  icon: string;
  name: string;
  category: string;
  date: string;
  amount: number;
  type: "income" | "expense";
  card: string | null;
  bank_account_id: string | null;
}

export function QuickAddTransactionDialog({ open, onOpenChange, initialType = "expense", initialCardName, initialDate, onSuccess, copyData }: Props) {
  const todayFormatted = format(new Date(), "dd MMM", { locale: ptBR });

  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [cardOptions, setCardOptions] = useState<CardOption[]>([]);

  const [isTransfer, setIsTransfer] = useState(initialType === "transfer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transferFromId, setTransferFromId] = useState("");
  const [transferToId, setTransferToId] = useState("");

  const [newTx, setNewTx] = useState<NewTx>({
    icon: "🍔",
    name: "",
    category: "Alimentação > Outros",
    date: initialDate || todayFormatted,
    amount: 0,
    type: initialType === "income" ? "income" : "expense",
    card: initialCardName || null,
    bank_account_id: null,
  });

  const [installmentEnabled, setInstallmentEnabled] = useState(false);
  const [installmentCount, setInstallmentCount] = useState<number | "">(2);
  const [installmentStart, setInstallmentStart] = useState<number | "">(1);
  const [installmentMode, setInstallmentMode] = useState<"divide" | "fixed">("divide");
  const [installmentFixedValue, setInstallmentFixedValue] = useState(0);
  const [nameInputMode, setNameInputMode] = useState<"none" | "text">("none");

  // In "fixed" mode, the amount typed IS the value per installment.
  useEffect(() => {
    if (installmentEnabled && installmentMode === "fixed") {
      setInstallmentFixedValue(newTx.amount || 0);
    }
  }, [newTx.amount, installmentMode, installmentEnabled]);

  // Validação da "parcela atual": deve ser um inteiro entre 1 e o total.
  // Não clampeamos silenciosamente — o UI mostra o erro para o usuário.
  const installmentStartError = (() => {
    if (!installmentEnabled) return null;
    const total = Number(installmentCount);
    if (!Number.isFinite(total) || total < 1) return null;
    if (installmentStart === "" || installmentStart === null || installmentStart === undefined) {
      return "Informe a parcela atual (entre 1 e " + total + ").";
    }
    const v = Number(installmentStart);
    if (!Number.isInteger(v)) return "A parcela atual deve ser um número inteiro.";
    if (v < 1) return "A parcela atual não pode ser menor que 1.";
    if (v > total) return `A parcela atual (${v}) não pode ser maior que o total de parcelas (${total}).`;
    return null;
  })();


  const fetchData = useCallback(async () => {
    try {
      const [
        { data: cards, error: cardsError },
        { data: accs, error: accsError },
        { data: txs, error: txsError }
      ] = await Promise.all([
        supabase.from("cards").select("name, brand, emoji, color").order("created_at", { ascending: true }),
        supabase.from("bank_accounts").select("id, name, icon, color, balance").order("created_at", { ascending: true }),
        supabase.from("transactions").select("bank_account_id, amount, type, is_visible").not("bank_account_id", "is", null),
      ]);

      if (cardsError) throw cardsError;
      if (accsError) throw accsError;
      if (txsError) throw txsError;

      const incomeByAccount: Record<string, number> = {};
      const expenseByAccount: Record<string, number> = {};
      (txs || []).forEach(tx => {
        if (tx.is_visible === false) return;
        const id = tx.bank_account_id!;
        if (tx.type === "income") incomeByAccount[id] = (incomeByAccount[id] || 0) + (tx.amount || 0);
        else expenseByAccount[id] = (expenseByAccount[id] || 0) + (tx.amount || 0);
      });

      setCardOptions((cards || []).map(c => ({ name: c.name, brand: c.brand, emoji: c.emoji, color: c.color })));
      setBankAccounts((accs || []).map(a => ({
        id: a.id,
        name: a.name,
        icon: a.icon,
        color: a.color,
        balance: (a.balance || 0) + (incomeByAccount[a.id] || 0) - (expenseByAccount[a.id] || 0)
      })));
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error("Erro ao carregar dados: " + getFriendlyErrorMessage(error).message);
    }
  }, []);

  // Build a memory map from transactions
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
          map.set(cleanName, { icon: tx.icon, category: tx.category });
        }
      });
      setTxHistory(map);
    }
  }, []);

  const isFirstRender = useRef(true);

  const PREFS_KEY = "quickadd:card-installment-prefs:v1";
  type Prefs = {
    enabled: boolean;
    mode: "divide" | "fixed";
    count: number;
    amount: number;
  };
  const readPrefs = (): Prefs | null => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(PREFS_KEY) : null;
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (typeof p !== "object" || p === null) return null;
      return {
        enabled: !!p.enabled,
        mode: p.mode === "fixed" ? "fixed" : "divide",
        count: Number.isFinite(p.count) && p.count >= 1 ? Math.floor(p.count) : 2,
        amount: Number.isFinite(p.amount) ? p.amount : 0,
      };
    } catch {
      return null;
    }
  };
  const writePrefs = (p: Prefs) => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(p));
        setHasSavedPrefs(true);
      }
    } catch {
      // ignore quota / privacy-mode errors
    }
  };
  const clearPrefs = () => {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(PREFS_KEY);
    } catch {
      // ignore
    }
    setHasSavedPrefs(false);
  };
  const [hasSavedPrefs, setHasSavedPrefs] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(PREFS_KEY) !== null;
    } catch {
      return false;
    }
  });

  // Reset state every time the dialog opens with the requested initial type.
  useEffect(() => {
     if (!open) {
       setConfirmInstallmentDiff(false);
       isFirstRender.current = true;
       return;
     }

      if (isFirstRender.current) {
        // Não ler clipboard automaticamente — evita prompt de permissão do navegador.
        // O usuário pode colar manualmente (Ctrl/Cmd+V) no campo de nome.
        isFirstRender.current = false;
      }

    setNameInputMode("none");
    fetchData();
    fetchHistory();
    setIsTransfer(copyData ? (copyData.category === "Transferência" || copyData.category === "Transferências" || copyData.category.startsWith("Transferências >")) : initialType === "transfer");
    setTransferFromId("");
    setTransferToId("");

    // Restaurar preferências de parcelamento (modo/valor/N) da última abertura,
    // quando não estamos duplicando uma transação existente e o tipo é despesa.
    const prefs = !copyData && initialType !== "income" && initialType !== "transfer" ? readPrefs() : null;
    setInstallmentEnabled(prefs?.enabled ?? false);
    setInstallmentCount(prefs?.count ?? 2);
    setInstallmentMode(prefs?.mode ?? "divide");

    setNewTx({
      icon: copyData ? copyData.icon : (initialType === "income" ? "💰" : "🍔"),
      name: copyData ? copyData.name : "",
      category: copyData ? copyData.category : (initialType === "income" ? "Renda > Salário" : "Alimentação > Outros"),
      date: format(new Date(), "dd MMM", { locale: ptBR }),
      amount: copyData ? copyData.amount : (prefs?.amount ?? 0),
      type: copyData ? (copyData.category.startsWith("Receita") || (copyData.category !== "Transferência" && !copyData.category.startsWith("Transferências") && !copyData.category.startsWith("Alimentação") && initialType === "income") ? "income" : "expense") : (initialType === "income" ? "income" : "expense"),
      card: copyData ? copyData.card : null,
      bank_account_id: copyData ? copyData.bank_account_id : null,
    });
    
    // Fix type logic for copyData more robustly
    if (copyData) {
      const isInc = copyData.category.startsWith("Receita") || (initialType === "income" && !copyData.category.startsWith("Transferência"));
      setNewTx(prev => ({ ...prev, type: isInc ? "income" : "expense" }));
    }
  }, [open, initialType, fetchData, fetchHistory]);

  // Persistir preferências de parcelamento ao alterar.
  useEffect(() => {
    if (!open) return;
    writePrefs({
      enabled: installmentEnabled,
      mode: installmentMode,
      count: Number(installmentCount) || 1,
      amount: newTx.amount || 0,
    });
  }, [open, installmentEnabled, installmentMode, installmentCount, newTx.amount]);


  const [confirmInstallmentDiff, setConfirmInstallmentDiff] = useState(false);

  const installmentDetails = calculateInstallmentDetails(
    newTx.amount,
    Number(installmentCount) || 1,
    installmentMode,
    installmentFixedValue
  );
  const hasDiff = installmentEnabled && !isTransfer && installmentDetails.diff !== 0;

  // Prévia efetiva quando "parcela atual" > 1: só lançamos de startAt até count.
  const previewTotal = Number(installmentCount) || 1;
  const previewStart = (() => {
    const v = Number(installmentStart);
    if (!Number.isFinite(v) || v < 1) return 1;
    if (v > previewTotal) return previewTotal;
    return Math.trunc(v);
  })();
  const previewRemaining = Math.max(0, previewTotal - previewStart + 1);
  const previewRemainingTotal = installmentDetails.valorParcela * previewRemaining;
  const isPartialLaunch = previewStart > 1;

  const handleAdd = async () => {
    // Dismiss keyboard on mobile
    (document.activeElement as HTMLElement)?.blur();
    
    if (isSubmitting) return;

    if (hasDiff && !confirmInstallmentDiff) {
      toast.error("Por favor, confirme o ajuste de centavos no parcelamento.");
      return;
    }

    if (installmentEnabled && !isTransfer) {
      const validationError = validateInstallmentInputs(
        installmentMode,
        newTx.amount,
        installmentFixedValue,
        Number(installmentCount) || 1,
      );
      if (validationError) {
        toast.error(validationError);
        return;
      }
    } else if ((newTx.amount || 0) <= 0) {
      toast.error("Por favor, insira um valor total maior que zero.");
      return;
    }
      if (installmentStartError) {
        toast.error(installmentStartError);
        return;
      }
    
    setIsSubmitting(true);
    try {
      console.log("QuickAdd: Starting handleAdd", { isTransfer, transferFromId, transferToId, amount: newTx.amount });
      
      if (installmentEnabled && !isTransfer && (installmentCount === "" || Number(installmentCount) < 2)) {
        toast.error("Por favor, insira um número válido de parcelas (mínimo 2).");
        setIsSubmitting(false);
        return;
      }
      
      if (isTransfer) {
        if (!transferFromId || !transferToId || transferFromId === transferToId) {
          console.warn("QuickAdd: Transfer validation failed", { transferFromId, transferToId });
          toast.error("Selecione contas diferentes para a transferência.");
          setIsSubmitting(false);
          return;
        }

        const fromAcc = bankAccounts.find(a => a.id === transferFromId);
        if (fromAcc && (fromAcc.balance || 0) < newTx.amount) {
          toast.error(`Saldo insuficiente na conta ${fromAcc.name}. Saldo disponível: R$ ${(fromAcc.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
          setIsSubmitting(false);
          return;
        }

        const toAcc = bankAccounts.find(a => a.id === transferToId);
        const fromName = fromAcc?.name || "Conta";
        const toName = toAcc?.name || "Conta";
        const groupId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        
        console.log("QuickAdd: Inserting transfer transactions", { groupId, fromName, toName });
        
        const { error, data } = await supabase.from("transactions").insert(sanitizeTransactionWrites([
          {
            icon: "🔄", name: `Transferência → ${toName}`, category: "Transferências > Outros",
            date: newTx.date, amount: newTx.amount, type: "expense",
            card: null, bank_account_id: transferFromId, installment_group_id: groupId,
            is_visible: true
          },
          {
            icon: "🔄", name: `Transferência ← ${fromName}`, category: "Transferências > Outros",
            date: newTx.date, amount: newTx.amount, type: "income",
            card: null, bank_account_id: transferToId, installment_group_id: groupId,
            is_visible: true
          },
        ])).select();

        if (error) {
          console.error("QuickAdd: Supabase insertion error", error);
          toast.error("Erro na comunicação com o banco de dados. Tente novamente.");
          throw error;
        }
        
        console.log("QuickAdd: Transfer successful", data);
        onOpenChange(false);
        onSuccess?.();
        toast.success("Transferência realizada com sucesso!");
        return;
      }

      console.log("QuickAdd: Standard transaction validation", { bank_account_id: newTx.bank_account_id, card: newTx.card });
      if (!newTx.bank_account_id && !newTx.card) {
        setIsSubmitting(false);
        return;
      }


      // We also removed the balance check for standard transactions to maintain consistency
      // as this is a tracking app and users might want to record transactions even with insufficient app-balance.

      // Expenses may intentionally leave the selected account with a negative balance.

      const cardValue = newTx.card === "Nenhum" ? null : newTx.card;
      // Coerção de tipo: se a categoria escolhida for de Receita (ex.: "Receita > Reembolso"
      // para estornos), força type=income mesmo que o usuário tenha deixado a aba "Despesa"
      // selecionada — evita que estornos/reembolsos entrem como despesa na fatura.
      const categoryRoot = (newTx.category || "").split(">")[0].trim().toLowerCase();
      const finalType: "income" | "expense" =
        categoryRoot === "receita" || categoryRoot === "receitas" ? "income" : newTx.type;
    let baseDate: Date;
    try {
      baseDate = parse(newTx.date, "dd MMM", new Date(), { locale: ptBR });
    } catch {
      baseDate = new Date();
    }

    if (installmentEnabled && cardValue && Number(installmentCount) > 1) {
      const groupId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const rows = [];
      const count = Number(installmentCount) || 1;
      const startAt = Math.min(Math.max(1, installmentStart || 1), count);
      for (let i = startAt; i <= count; i++) {
        const installDate = new Date(baseDate);
        installDate.setMonth(installDate.getMonth() + (i - startAt));
         const { valorParcela: parcela } = calculateInstallmentDetails(
           newTx.amount,
           count,
           installmentMode,
           installmentFixedValue
         );
        rows.push({
          icon: newTx.icon, name: newTx.name, category: newTx.category,
          date: format(installDate, "dd MMM", { locale: ptBR }),
          amount: parcela, type: finalType,
          card: cardValue, bank_account_id: newTx.bank_account_id || null,
          installment_number: i,
          total_installments: count,
          installment_group_id: groupId,
          installment_mode: installmentMode,
          installment_source_amount: installmentMode === "fixed" ? parcela * count : newTx.amount,
          is_visible: true
        });
       }
       const { error } = await supabase.from("transactions").insert(sanitizeTransactionWrites(rows));
       if (error) throw error;
     } else {
       const { error } = await supabase.from("transactions").insert(sanitizeTransactionWrite({
         icon: newTx.icon, name: newTx.name, category: newTx.category,
         date: newTx.date, amount: newTx.amount, type: finalType,
         card: cardValue, bank_account_id: newTx.bank_account_id || null,
         is_visible: true
       }));
       if (error) throw error;
     }
    (document.activeElement as HTMLElement)?.blur();
    onOpenChange(false);
    onSuccess?.();
    toast.success("Transação adicionada com sucesso!");
    } catch (error: any) {
      console.error("Error adding transaction:", error);
      toast.error("Erro ao adicionar transação: " + getFriendlyErrorMessage(error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] max-w-[94vw] sm:w-[28rem] sm:max-w-[28rem] rounded-2xl bg-background max-h-[92vh] min-h-[600px] sm:min-h-[640px] overflow-y-auto p-4 gap-2 flex flex-col">
        <DialogHeader className="space-y-0 pr-6">
          <div className="flex items-center gap-1.5">
            <DialogTitle className="text-sm whitespace-nowrap shrink-0">Nova</DialogTitle>
            <div className="flex flex-1 gap-1 min-w-0">
              <button
                type="button"
                onClick={() => { setIsTransfer(false); setNewTx({ ...newTx, type: "expense", category: "Alimentação > Outros", icon: "🍔" }); }}
                className={`flex-1 min-w-0 rounded-lg py-1 text-[10px] font-medium transition-colors ${!isTransfer && newTx.type === "expense" ? "bg-destructive text-destructive-foreground" : "bg-card text-muted-foreground"}`}
              >
                Despesa
              </button>
              <button
                type="button"
                onClick={() => { setIsTransfer(false); setNewTx({ ...newTx, type: "income", category: "Receita > Salário", icon: "💰" }); }}
                className={`flex-1 min-w-0 rounded-lg py-1 text-[10px] font-medium transition-colors ${!isTransfer && newTx.type === "income" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
              >
                Receita
              </button>
              <button
                type="button"
                onClick={() => { setIsTransfer(true); }}
                className={`flex-1 min-w-0 rounded-lg py-1 text-[10px] font-medium transition-colors flex items-center justify-center gap-0.5 ${isTransfer ? "bg-blue-500 text-white" : "bg-card text-muted-foreground"}`}
              >
                <ArrowLeftRight className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">Transferir</span>
              </button>
            </div>
          </div>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">

          {isTransfer ? (
            <>
              <div className="rounded-xl bg-card/50 p-2.5 space-y-2">
                <div>
                  <label className="text-[11px] font-semibold text-foreground mb-1 block">De (origem)</label>
                  <div className="grid grid-cols-5 gap-x-1.5 gap-y-0.5">
                    {bankAccounts.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          const newId = transferFromId === a.id ? "" : a.id;
                          setTransferFromId(newId);
                        }}
                        className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition-all ${
                          transferFromId === a.id ? "bg-primary/15 ring-1 ring-primary" : "bg-card hover:bg-accent"
                        }`}
                      >
                        <BankLogo icon={a.icon} color={a.color} name={a.name} size="sm" />
                        <span className="text-[9px] text-foreground truncate w-full text-center leading-tight">{a.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-center">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/15 text-blue-500">
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-foreground mb-1 block">Para (destino)</label>
                  <div className="grid grid-cols-5 gap-x-1.5 gap-y-0.5">
                    {bankAccounts.filter(a => a.id !== transferFromId).map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          const newId = transferToId === a.id ? "" : a.id;
                          setTransferToId(newId);
                        }}
                        className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition-all ${
                          transferToId === a.id ? "bg-primary/15 ring-1 ring-primary" : "bg-card hover:bg-accent"
                        }`}
                      >
                        <BankLogo icon={a.icon} color={a.color} name={a.name} size="sm" />
                        <span className="text-[9px] text-foreground truncate w-full text-center leading-tight">{a.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {transferFromId && transferToId && transferFromId === transferToId && (
                  <p className="text-[10px] text-destructive">A origem e o destino devem ser diferentes.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-foreground mb-0.5 block">Data</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-lg bg-card border-none h-8 px-2.5 text-xs", !newTx.date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                        {newTx.date || "Data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={(() => { try { return parse(newTx.date, "dd MMM", new Date(), { locale: ptBR }); } catch { return undefined; } })()} onSelect={(date) => { if (date) setNewTx({ ...newTx, date: format(date, "dd MMM", { locale: ptBR }) }); }} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                 <div>
                   <label className="text-[11px] font-semibold text-foreground mb-0.5 block">Valor (R$)</label>
                    <CalculatorAmountInput 
                      value={newTx.amount} 
                      onChange={(v) => setNewTx({ ...newTx, amount: v })} 
                      onEnter={handleAdd}
                      autoFocus={false}
                      className="!text-black dark:!text-white !border-black dark:!border-white focus-visible:!ring-black dark:focus-visible:!ring-white"
                    />
                 </div>
              </div>
            </>
          ) : (
            <>
               <div>
                 <label className="text-[11px] font-semibold text-foreground mb-0.5 block">Nome</label>
                   <input
                     autoFocus
                     inputMode={nameInputMode}
                     id="tx-name-input"
                    value={newTx.name}
                    onChange={e => {
                      let name = e.target.value;
                      if (name.length > 0) {
                        name = name.charAt(0).toUpperCase() + name.slice(1);
                      }
                      const history = txHistory.get(name.trim().toLowerCase());
                      if (history) {
                        setNewTx({ ...newTx, name, icon: history.icon, category: history.category });
                      } else {
                        setNewTx({ ...newTx, name });
                      }
                    }}

                    onBlur={() => setNameInputMode("none")}
                    onClick={(e) => {
                      const target = e.currentTarget;
                      setNameInputMode("text");
                      setTimeout(() => target.focus(), 0);
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        // Avançar para o seletor de categoria
                        const categoryButton = document.querySelector('button[aria-label="Selecionar categoria"]') as HTMLButtonElement;
                        if (categoryButton) {
                          categoryButton.focus();
                        } else {
                          // Fallback para o valor se a categoria não for focável facilmente
                          const amountButton = document.querySelector('button[aria-label^="Valor:"]') as HTMLButtonElement;
                          if (amountButton) amountButton.focus();
                        }
                      }
                    }}
                    placeholder="Ex: Supermercado"
                    className="w-full rounded-lg bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
              <CategoryPicker
                value={newTx.category}
                onChange={(val, icon) => setNewTx({ ...newTx, category: val, icon })}
                defaultExpanded={true}
                type={newTx.type}
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-foreground mb-0.5 block">Data</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-lg bg-card border-none h-8 px-2.5 text-xs", !newTx.date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                        {newTx.date || "Data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[60]" align="start" sideOffset={4}>

                      <Calendar mode="single" selected={(() => { try { return parse(newTx.date, "dd MMM", new Date(), { locale: ptBR }); } catch { return undefined; } })()} onSelect={(date) => { if (date) setNewTx({ ...newTx, date: format(date, "dd MMM", { locale: ptBR }) }); }} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                  <div>
                    <label className="text-[11px] font-semibold text-foreground mb-0.5 block">Valor (R$)</label>
                    <CalculatorAmountInput 
                      value={newTx.amount} 
                      onChange={(v) => {
                        setNewTx({ ...newTx, amount: v });
                      }} 
                      onEnter={handleAdd}
                      className={newTx.type === "expense" ? "!text-red-500 !border-red-500 focus-visible:!ring-red-500" : "!text-green-600 dark:!text-green-500 !border-green-600 dark:!border-green-500 focus-visible:!ring-green-600 dark:focus-visible:!ring-green-500"}
                    />
                  </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-foreground mb-1 flex items-center gap-1">
                  <Landmark className="h-3 w-3" />
                  Conta Débito/Pix
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setNewTx({ ...newTx, bank_account_id: null });
                    }}
                    className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition-all ${
                      !newTx.bank_account_id ? "bg-primary/15 ring-1 ring-primary" : "bg-card hover:bg-accent"
                    }`}
                  >
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-[10px]">
                      —
                    </div>
                    <span className="text-[9px] text-muted-foreground truncate w-full text-center leading-tight">Nenhuma</span>
                  </button>
                  {bankAccounts.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        const nextId = newTx.bank_account_id === a.id ? null : a.id;
                        setNewTx({ ...newTx, bank_account_id: nextId });
                        if (nextId) {
                          setNewTx(prev => ({ ...prev, card: null }));
                          setInstallmentEnabled(false);
                          if (newTx.amount > 0 && newTx.name.trim()) handleAdd();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const nextId = newTx.bank_account_id === a.id ? null : a.id;
                          setNewTx({ ...newTx, bank_account_id: nextId });
                          if (nextId) {
                            setNewTx(prev => ({ ...prev, card: null }));
                            setInstallmentEnabled(false);
                            if (newTx.amount > 0 && newTx.name.trim()) handleAdd();
                          }
                        }
                      }}
                      className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition-all ${
                        newTx.bank_account_id === a.id ? "bg-primary/15 ring-1 ring-primary" : "bg-card hover:bg-accent"
                      }`}
                    >
                      <BankLogo icon={a.icon} color={a.color} name={a.name} size="sm" />
                      <span className="text-[9px] text-foreground truncate w-full text-center leading-tight">{a.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-foreground mb-1 flex items-center gap-1">
                  <CreditCard className="h-3 w-3" />
                  Cartão de crédito
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setNewTx({ ...newTx, card: null });
                      setInstallmentEnabled(false);
                    }}
                    className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition-all ${
                      !newTx.card ? "bg-primary/15 ring-1 ring-primary" : "bg-card hover:bg-accent"
                    }`}
                  >
                    <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center text-muted-foreground text-[10px]">
                      —
                    </div>
                    <span className="text-[9px] text-muted-foreground truncate w-full text-center leading-tight">Nenhum</span>
                  </button>
                  {cardOptions.map(c => {
                    const selected = newTx.card === c.name;
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => {
                          if (newTx.card === c.name) {
                            setNewTx({ ...newTx, card: null });
                            setInstallmentEnabled(false);
                          } else {
                            const newCard = c.name;
                            setNewTx({ ...newTx, card: newCard, bank_account_id: null });
                            if (newTx.amount > 0 && newTx.name.trim()) handleAdd();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (newTx.card === c.name) {
                              setNewTx({ ...newTx, card: null });
                              setInstallmentEnabled(false);
                            } else {
                              const newCard = c.name;
                              setNewTx({ ...newTx, card: newCard, bank_account_id: null });
                              if (newTx.amount > 0 && newTx.name.trim()) handleAdd();
                            }
                          }
                        }}
                        className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition-all ${
                          selected ? "bg-primary/15 ring-1 ring-primary" : "bg-card hover:bg-accent"
                        }`}
                      >
                        <div
                          className={`h-7 w-10 rounded-[4px] flex items-end justify-start p-0.5 shadow-sm relative overflow-hidden bg-gradient-to-br ${c.color || "from-gray-600 to-gray-800"}`}
                        >
                          <div className="absolute top-1 left-1 h-1 w-1.5 rounded-[1px] bg-white/40" />
                          <span className="text-[6px] font-bold text-white leading-none truncate max-w-full tracking-tight relative">
                            {c.name}
                          </span>
                        </div>
                        <span className="text-[9px] text-foreground truncate w-full text-center leading-tight">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {newTx.card && newTx.card !== "Nenhum" && (
                <div className="space-y-2 rounded-lg bg-card/50 p-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-foreground">Parcelar</label>
                    <div className="flex items-center gap-2">
                      {hasSavedPrefs && (
                        <button
                          type="button"
                          onClick={() => {
                            clearPrefs();
                            setInstallmentEnabled(false);
                            setInstallmentMode("divide");
                            setInstallmentCount(2);
                            toast.success("Preferências de parcelamento redefinidas");
                          }}
                          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Redefinir preferências de parcelamento"
                          title="Redefinir preferências salvas"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Redefinir
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setInstallmentEnabled(!installmentEnabled)}
                        className={`relative h-4 w-8 rounded-full transition-colors ${installmentEnabled ? "bg-primary" : "bg-muted"}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform ${installmentEnabled ? "translate-x-4" : ""}`} />
                      </button>
                    </div>
                  </div>
                  {installmentEnabled && (
                    <>
                      <p className="text-[10px] text-muted-foreground -mt-1">
                        O valor informado acima é…
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (installmentMode === "fixed") {
                              // fixed → divide: total = parcela × N, para manter consistência
                              const count = Math.max(1, Number(installmentCount) || 1);
                              const newTotal = Math.round((installmentFixedValue || 0) * count * 100) / 100;
                              setNewTx(prev => ({ ...prev, amount: newTotal }));
                            }
                            setInstallmentMode("divide");
                          }}
                          className={`flex-1 rounded-lg py-1.5 px-2 text-[10px] font-medium transition-colors leading-tight ${installmentMode === "divide" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground border border-border"}`}
                        >
                          Valor total da compra
                          <span className="block text-[8px] opacity-80">(será dividido em Nx)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // Ao selecionar "Valor por parcela", reutiliza o valor
                            // já digitado no campo "Valor R$" — sem redigitar nem dividir.
                            setInstallmentFixedValue(newTx.amount || installmentFixedValue);
                            setInstallmentMode("fixed");
                          }}
                          className={`flex-1 rounded-lg py-1.5 px-2 text-[10px] font-medium transition-colors leading-tight ${installmentMode === "fixed" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground border border-border"}`}
                        >
                          Valor de cada parcela
                          <span className="block text-[8px] opacity-80">(total = parcela × Nx)</span>
                        </button>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <label className="text-[11px] font-semibold text-foreground mb-1 block">Total de parcelas</label>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => {
                                  if (installmentMode === "divide") {
                                    // If dividing, we want to keep the total amount typed before selecting installments
                                    setInstallmentCount(n);
                                  } else {
                                    setInstallmentCount(n);
                                  }
                                }}

                                className={cn(
                                  "px-2 py-1 rounded text-[10px] font-medium transition-colors border",
                                  installmentCount === n 
                                    ? "bg-primary text-primary-foreground border-primary" 
                                    : "bg-card text-muted-foreground border-border hover:border-primary/50"
                                )}
                              >
                                {n}x
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2 items-end">
                            <div className="flex-1">
                              <label className="text-[9px] text-muted-foreground mb-0.5 block italic">Ou digite outro valor</label>
                              <input 
                                type="number" 
                                min={1} 
                                max={48} 
                                value={installmentCount} 
                                onChange={e => { 
                                  const val = e.target.value; 
                                  setInstallmentCount(val === "" ? "" : Math.max(1, parseInt(val) || 1)); 
                                }} 
                                className="w-full rounded-lg bg-card px-2.5 py-1.5 text-xs text-foreground outline-none border border-border focus:border-primary/50" 
                                placeholder="Ex: 15"
                              />
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-foreground mb-1 block">
                            Parcela atual <span className="text-muted-foreground font-normal">(lançar a partir de)</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={Number(installmentCount) || 1}
                              value={installmentStart}
                              aria-invalid={!!installmentStartError}
                              aria-describedby={installmentStartError ? "installment-start-error" : undefined}
                              onChange={e => {
                                const raw = e.target.value;
                                if (raw === "") {
                                  setInstallmentStart("");
                                  return;
                                }
                                const v = parseInt(raw, 10);
                                setInstallmentStart(Number.isFinite(v) ? v : "");
                              }}
                              onBlur={() => {
                                // Ao sair do campo, se estiver vazio, volta para 1 (default seguro).
                                if (installmentStart === "") setInstallmentStart(1);
                              }}
                              className={`w-16 rounded-lg bg-card px-2.5 py-1.5 text-xs text-foreground outline-none border ${installmentStartError ? "border-destructive focus:border-destructive" : "border-border focus:border-primary/50"}`}
                            />
                            {(() => {
                              const total = Number(installmentCount) || 1;
                              const startNum = Number(installmentStart);
                              const validStart = Number.isFinite(startNum) && startNum >= 1 && startNum <= total;
                              if (!validStart) {
                                return (
                                  <span className="text-[11px] text-muted-foreground">
                                    de {total}
                                  </span>
                                );
                              }
                              const remaining = total - startNum + 1;
                              return (
                                <span className="text-[11px] text-muted-foreground">
                                   de {total} — serão lançadas 
                                  <span className="font-semibold text-foreground">{remaining}</span> 
                                  parcela(s) ({startNum}/{total} → {total}/{total})
                                </span>
                              );
                            })()}
                          </div>
                          {installmentStartError && (
                            <p
                              id="installment-start-error"
                              role="alert"
                              className="mt-1 text-[11px] text-destructive"
                            >
                              {installmentStartError}
                            </p>
                          )}
                        </div>
                      </div>
                        <div className="space-y-1.5 rounded-md bg-primary/5 border border-primary/20 p-2">
                          <p className="text-[11px] text-foreground font-medium">
                            {installmentMode === "fixed" ? (
                              <>
                                {installmentDetails.count}x de <span className="font-bold text-primary">R$ {installmentDetails.valorParcela.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                                <span className="block text-[10px] text-muted-foreground mt-0.5">
                                  Total da compra: R$ {installmentDetails.totalCalculado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </span>
                                {isPartialLaunch && (
                                  <span className="block text-[10px] text-primary mt-0.5">
                                    A lançar: {previewRemaining}x ({previewStart}/{previewTotal} → {previewTotal}/{previewTotal}) = R$ {previewRemainingTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                {installmentDetails.count}x de <span className="font-bold text-primary">R$ {installmentDetails.valorParcela.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                                <span className="block text-[10px] text-muted-foreground mt-0.5">
                                  Total dividido: R$ {installmentDetails.totalCalculado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}{installmentDetails.aviso}
                                </span>
                                {isPartialLaunch && (
                                  <span className="block text-[10px] text-primary mt-0.5">
                                    A lançar: {previewRemaining}x ({previewStart}/{previewTotal} → {previewTotal}/{previewTotal}) = R$ {previewRemainingTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </span>
                                )}
                              </>
                            )}
                          </p>
                          {hasDiff && (
                            <label className="flex items-center gap-2 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={confirmInstallmentDiff}
                                onChange={(e) => setConfirmInstallmentDiff(e.target.checked)}
                                className="h-3 w-3 rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <span className="text-[10px] text-destructive font-medium group-hover:text-destructive/80 transition-colors">
                                Estou ciente do ajuste de R$ {installmentDetails.diff.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                            </label>
                          )}
                        </div>

                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter className="mt-2 flex-row gap-2 sm:gap-2">
          <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => { (document.activeElement as HTMLElement)?.blur(); onOpenChange(false); }}>Cancelar</Button>
          <Button

            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={handleAdd}
            disabled={
              isSubmitting || !!installmentStartError || (isTransfer
                ? !transferFromId || !transferToId || transferFromId === transferToId || !newTx.amount
                : !newTx.name || !newTx.amount)
            }
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              isTransfer ? "Transferir" : "Adicionar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
