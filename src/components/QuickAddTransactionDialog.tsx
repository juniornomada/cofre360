import { useEffect, useState, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CategoryPicker } from "@/components/CategoryPicker";
import { CalendarIcon, ArrowLeftRight, ArrowRight, CreditCard, Landmark, Loader2 } from "lucide-react";
import { BankLogo } from "@/components/BankLogo";
import { CalculatorAmountInput } from "@/components/CalculatorAmountInput";
 import { format, parse } from "date-fns";
 import { calculateInstallmentDetails } from "@/lib/installment-utils";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getFriendlyErrorMessage } from "@/lib/utils";

export type QuickAddInitialType = "expense" | "income" | "transfer";

interface BankAccountOption { id: string; name: string; icon: string | null; color: string | null; balance: number }
interface CardOption { name: string; brand: string; emoji: string | null; color: string | null }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialType?: QuickAddInitialType;
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

export function QuickAddTransactionDialog({ open, onOpenChange, initialType = "expense", onSuccess, copyData }: Props) {
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
    date: todayFormatted,
    amount: 0,
    type: initialType === "income" ? "income" : "expense",
    card: null,
    bank_account_id: null,
  });

  const [installmentEnabled, setInstallmentEnabled] = useState(false);
  const [installmentCount, setInstallmentCount] = useState<number | "">(2);
  const [installmentMode, setInstallmentMode] = useState<"divide" | "fixed">("divide");
  const [nameInputMode, setNameInputMode] = useState<"none" | "text">("none");

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

  // Reset state every time the dialog opens with the requested initial type.
  useEffect(() => {
     if (!open) {
       setConfirmInstallmentDiff(false);
       isFirstRender.current = true;
       return;
     }

     if (isFirstRender.current) {
       // On initial open, handle potential clipboard paste
       navigator.clipboard.readText().then(text => {
         if (text && text.trim()) {
           setNewTx(prev => ({
             ...prev,
             name: text.trim().charAt(0).toUpperCase() + text.trim().slice(1)
           }));
           toast.success("Texto colado da área de transferência");
         }
       }).catch(() => {
         // Silently fail if clipboard access is denied
       });
       isFirstRender.current = false;
     }

    setNameInputMode("none");
    fetchData();
    fetchHistory();
    setIsTransfer(copyData ? (copyData.category === "Transferência" || copyData.category === "Transferências" || copyData.category.startsWith("Transferências >")) : initialType === "transfer");
    setTransferFromId("");
    setTransferToId("");
    setInstallmentEnabled(false);
    setInstallmentCount(2);
    setInstallmentMode("divide");

    setNewTx({
      icon: copyData ? copyData.icon : (initialType === "income" ? "💰" : "🍔"),
      name: copyData ? copyData.name : "",
      category: copyData ? copyData.category : (initialType === "income" ? "Renda > Salário" : "Alimentação > Outros"),
      date: format(new Date(), "dd MMM", { locale: ptBR }),
      amount: copyData ? copyData.amount : 0,
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

  const [confirmInstallmentDiff, setConfirmInstallmentDiff] = useState(false);

  const installmentDetails = calculateInstallmentDetails(
    newTx.amount,
    Number(installmentCount) || 1,
    installmentMode,
    installmentMode === "fixed" ? newTx.amount : 0
  );
  const hasDiff = installmentEnabled && !isTransfer && installmentMode === "divide" && installmentDetails.diff !== 0;

  const handleAdd = async () => {
    // Dismiss keyboard on mobile
    (document.activeElement as HTMLElement)?.blur();
    
    if (isSubmitting) return;

    if (hasDiff && !confirmInstallmentDiff) {
      toast.error("Por favor, confirme o ajuste de centavos no parcelamento.");
      return;
    }

    if ((newTx.amount || 0) <= 0) {
      toast.error("Por favor, insira um valor maior que zero.");
      return;
    }

    setIsSubmitting(true);
    const promise = (async () => {
      console.log("QuickAdd: Starting handleAdd", { isTransfer, transferFromId, transferToId, amount: newTx.amount });
      
      if (installmentEnabled && !isTransfer && (installmentCount === "" || Number(installmentCount) < 2)) {
        throw new Error("Por favor, insira um número válido de parcelas (mínimo 2).");
      }
      
      if (isTransfer) {
        if (!transferFromId || !transferToId || transferFromId === transferToId) {
          throw new Error("Selecione contas diferentes para a transferência.");
        }

        const fromAcc = bankAccounts.find(a => a.id === transferFromId);
        if (fromAcc && (fromAcc.balance || 0) < newTx.amount) {
          throw new Error(`Saldo insuficiente na conta ${fromAcc.name}.`);
        }

        const fromName = fromAcc?.name || "Conta";
        const toName = (bankAccounts.find(a => a.id === transferToId))?.name || "Conta";
        const groupId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        
        const { error } = await supabase.from("transactions").insert([
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
        ]);

        if (error) throw error;
      } else {
        if (!newTx.bank_account_id && !newTx.card) return;

        if (newTx.type === "expense" && newTx.bank_account_id) {
          const acc = bankAccounts.find(a => a.id === newTx.bank_account_id);
          if (acc && (acc.balance || 0) < newTx.amount) {
            throw new Error(`Saldo insuficiente na conta ${acc.name}.`);
          }
        }
        
        const cardValue = newTx.card === "Nenhum" ? null : newTx.card;
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
          for (let i = 0; i < count; i++) {
            const installDate = new Date(baseDate);
            installDate.setMonth(installDate.getMonth() + i);
            const { valorParcela: parcela } = calculateInstallmentDetails(
              newTx.amount,
              count,
              installmentMode,
              installmentMode === "fixed" ? newTx.amount : 0
            );
            rows.push({
              icon: newTx.icon, name: newTx.name, category: newTx.category,
              date: format(installDate, "dd MMM", { locale: ptBR }),
              amount: parcela, type: newTx.type,
              card: cardValue, bank_account_id: newTx.bank_account_id || null,
              installment_number: i + 1,
              total_installments: count,
              installment_group_id: groupId,
              installment_mode: installmentMode,
              installment_source_amount: newTx.amount,
              is_visible: true
            });
          }
          const { error } = await supabase.from("transactions").insert(rows);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("transactions").insert({
            icon: newTx.icon, name: newTx.name, category: newTx.category,
            date: newTx.date, amount: newTx.amount, type: newTx.type,
            card: cardValue, bank_account_id: newTx.bank_account_id || null,
            is_visible: true
          });
          if (error) throw error;
        }
      }
      
      onOpenChange(false);
      onSuccess?.();
    })();

    toast.promise(promise, {
      loading: "Salvando transação...",
      success: "Transação adicionada com sucesso!",
      error: (err: any) => err.message || "Erro ao adicionar transação",
    });

    try {
      await promise;
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
      (document.activeElement as HTMLElement)?.blur();
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
                        // Avançar para o campo de valor (que agora é um botão)
                        const amountButton = document.querySelector('button[aria-label^="Valor:"]') as HTMLButtonElement;
                        if (amountButton) {
                          amountButton.focus();
                        }
                     }
                   }}
                   placeholder="Ex: Supermercado"
                   className="w-full rounded-lg bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none"
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
                    <button
                      type="button"
                      onClick={() => setInstallmentEnabled(!installmentEnabled)}
                      className={`relative h-4 w-8 rounded-full transition-colors ${installmentEnabled ? "bg-primary" : "bg-muted"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform ${installmentEnabled ? "translate-x-4" : ""}`} />
                    </button>
                  </div>
                  {installmentEnabled && (
                    <>
                      <div className="flex gap-1.5">
                        <button 
                          type="button" 
                          onClick={() => setInstallmentMode("divide")} 
                          className={`flex-1 rounded-lg py-1 text-[10px] font-medium transition-colors ${installmentMode === "divide" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                        >
                          Dividir total
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            setInstallmentMode("fixed");
                          }}  
                          className={`flex-1 rounded-lg py-1 text-[10px] font-medium transition-colors ${installmentMode === "fixed" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                        >
                          Valor fixo
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
                      </div>
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-muted-foreground">
                            {installmentDetails.formattedSummary}
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
              isSubmitting || (isTransfer
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
