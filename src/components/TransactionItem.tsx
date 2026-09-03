import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getCategoryDisplay, getCategoryIcon } from "@/lib/categories";
import { restoreAccents } from "@/lib/restore-accents";
import { formatBRL } from "@/lib/format-brl";
import { CreditCard, Landmark, ArrowLeftRight, CalendarDays, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AutoFitText } from "@/components/AutoFitText";
import { normalizeCardPaymentLabel } from "@/lib/card-payment-label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MONTHS_PT_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function formatTxDate(date: string, _refIso?: string): string {
  const trimmed = date.trim().toLowerCase();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const month = Number(iso[2]) - 1;
    if (month >= 0 && month < 12) return `${iso[3]} ${MONTHS_PT_ABBR[month].toUpperCase()}`;
  }

  const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{4}))?$/);
  if (dmy) {
    const month = Number(dmy[2]) - 1;
    if (month >= 0 && month < 12) return `${dmy[1].padStart(2, "0")} ${MONTHS_PT_ABBR[month].toUpperCase()}`;
  }

  const compact = trimmed.match(/^(\d{1,2})\s+([a-zç]{3})(?:\s+(\d{4}))?$/i);
  if (compact) {
    const month = MONTHS_PT_ABBR.indexOf(compact[2]);
    if (month >= 0) return `${compact[1].padStart(2, "0")} ${MONTHS_PT_ABBR[month].toUpperCase()}`;
  }
  return date;
}

function toIsoDate(value: string | null | undefined, refIso?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;

  const compact = trimmed.match(/^(\d{1,2})\s+([a-zç]{3})(?:\s+(\d{4}))?$/i);
  if (compact) {
    const month = MONTHS_PT_ABBR.indexOf(compact[2]);
    if (month >= 0) {
      const year = compact[3] || String(refIso ? new Date(refIso).getFullYear() : new Date().getFullYear());
      return `${year}-${String(month + 1).padStart(2, "0")}-${compact[1].padStart(2, "0")}`;
    }
  }
  return null;
}

interface TransactionItemProps {
  id?: string;
  icon: string;
  name: string;
  category: string;
  date: string;
  purchase_date?: string | null;
  created_at?: string;
  amount: number;
  type: "income" | "expense";
  card?: string;
  cardBrand?: string;
  bank_account_id?: string | null;
  isTransferPair?: boolean;
  transferFromName?: string;
  transferToName?: string;
  installment_group_id?: string | null;
  installment_number?: number;
  total_installments?: number;
  style?: React.CSSProperties;
  onEdit?: () => void;
  onDelete?: () => void;
  is_visible?: boolean;
  amountVisible?: boolean;
}

export function TransactionItem({
  id, icon, name, category, date, purchase_date, created_at, amount, type, card, cardBrand,
  bank_account_id, isTransferPair, transferFromName, transferToName,
  installment_group_id, installment_number, total_installments, style, onEdit, onDelete, amountVisible = true
}: TransactionItemProps) {
  const isInstallment = !!total_installments && total_installments > 1 && !!installment_number;
  const explicitPurchaseDate = toIsoDate(purchase_date, created_at) || "";
  const [purchaseDate, setPurchaseDate] = useState<string>(explicitPurchaseDate);
  const [purchaseDateDraft, setPurchaseDateDraft] = useState<string>(explicitPurchaseDate);
  const [purchaseDateOpen, setPurchaseDateOpen] = useState(false);
  const [savingPurchaseDate, setSavingPurchaseDate] = useState(false);

  useEffect(() => {
    const next = toIsoDate(purchase_date, created_at) || "";
    setPurchaseDate(next);
    setPurchaseDateDraft(next);
  }, [purchase_date, created_at]);

  const savePurchaseDate = async () => {
    if (!purchaseDateDraft || (!installment_group_id && !id)) return;
    setSavingPurchaseDate(true);
    try {
      let query = supabase
        .from("transactions")
        .update({ purchase_date: purchaseDateDraft } as any);

      query = installment_group_id
        ? query.eq("installment_group_id", installment_group_id)
        : query.eq("id", id as string);

      const { error } = await query;
      if (error) throw error;
      setPurchaseDate(purchaseDateDraft);
      setPurchaseDateOpen(false);
      toast.success("Data da compra atualizada sem alterar as parcelas");
    } catch (error) {
      console.error("Erro ao atualizar data da compra:", error);
      toast.error("Erro ao atualizar data da compra");
    } finally {
      setSavingPurchaseDate(false);
    }
  };

  const normalizedName = normalizeCardPaymentLabel(name);
  const displayName = isInstallment
    ? normalizedName.replace(/\s*\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)\s*$/, "").trim()
    : normalizedName;
  const displayIcon = getCategoryIcon(category) || icon;
  const isCard = !!card;
  const isTransfer = category === "Transferência" || category === "Transferências" || category.startsWith("Transferências >") || isTransferPair;
  const isBank = !card && !!bank_account_id && !isTransfer;

  return (
    <div
      onClick={onEdit}
      className={cn(
        "interactive-card flex items-center gap-2.5 rounded-xl p-2.5 cursor-pointer bg-card border border-border/30 transition-all group/item relative overflow-hidden active:scale-[0.98] sm:pr-2.5 pr-[44px]"
      )}
      style={style}
    >
      {onDelete && (
        <div className="absolute right-2 sm:right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 sm:opacity-0 group-hover/item:opacity-100 focus-within:opacity-100 transition-all duration-200 sm:translate-x-2 group-hover/item:translate-x-0 focus-within:translate-x-0 z-10 pointer-events-auto sm:pointer-events-none sm:group-hover/item:pointer-events-auto sm:focus-within:pointer-events-auto">
          <div
            className="flex items-center gap-1 bg-card/90 sm:bg-card/80 backdrop-blur-sm p-1 rounded-full border border-border/50 shadow-sm sm:shadow-none"
            role="group"
            aria-label="Ações da transação"
          >
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive focus-visible:ring-offset-1"
              aria-label="Excluir"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <div className="relative h-10 w-10 shrink-0">
        {isTransferPair ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="flex h-full w-full items-center justify-center rounded-xl bg-accent text-lg transition-transform duration-200 group-active:scale-90 overflow-hidden content-visibility-auto cursor-help focus:outline-none focus:ring-2 focus:ring-primary"
                tabIndex={0}
                aria-label="Transferência"
              >
                <span role="img" aria-hidden="true">🔄</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col items-center">
                <span>Transferência</span>
                <span className="text-[10px] opacity-70">Transferência de {transferFromName} para {transferToName}</span>
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-xl bg-accent text-lg transition-transform duration-200 group-active:scale-90 overflow-hidden content-visibility-auto">
            <span role="img" aria-label={category}>{displayIcon}</span>
          </div>
        )}

        {isCard && (
          <div
            className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card shadow-sm"
            title="Cartão de crédito"
          >
            <CreditCard className="h-2.5 w-2.5" strokeWidth={2.5} />
          </div>
        )}
        {isBank && (
          <div
            className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background ring-2 ring-card shadow-sm"
            title="Conta bancária"
          >
            <Landmark className="h-2.5 w-2.5" strokeWidth={2.5} />
          </div>
        )}
        {isTransferPair && (
          <div
            className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background ring-2 ring-card shadow-sm"
            title="Transferência entre contas"
          >
            <ArrowLeftRight className="h-2.5 w-2.5" strokeWidth={2.5} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground min-w-0">
            {isTransferPair && transferFromName && transferToName ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <AutoFitText className="transition-colors hover:text-primary">
                    {transferFromName} → {transferToName}
                  </AutoFitText>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex flex-col items-center">
                    <span>Transferência</span>
                    <span className="text-[10px] opacity-70">Transferência de {transferFromName} para {transferToName}</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <AutoFitText titleFallback={restoreAccents(displayName)}>
                {restoreAccents(displayName)}
              </AutoFitText>
            )}
          </p>
          <span className={cn(
            "text-sm font-bold tabular-nums shrink-0",
            isTransferPair ? "text-foreground" : type === "income" ? "text-primary" : "text-destructive"
          )}>
            {isTransferPair ? "" : type === "expense" ? "- " : "+ "}
            {amountVisible ? `R$ ${formatBRL(Math.abs(amount))}` : "R$ ••••"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded truncate max-w-[120px]">
              {getCategoryDisplay(category)}
            </span>
            {isInstallment && (
              <span
                className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30 shrink-0 tabular-nums"
                aria-label={`Parcela ${installment_number} de ${total_installments}`}
                tabIndex={0}
              >
                {installment_number}/{total_installments}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground font-medium shrink-0 tabular-nums text-right w-[72px]">
            {formatTxDate(date, created_at)}
          </span>
        </div>

        {isInstallment && (installment_group_id || id) && (
          <div className="mt-1 flex justify-end">
            <Popover open={purchaseDateOpen} onOpenChange={setPurchaseDateOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Data original da compra. Não altera o calendário das parcelas."
                >
                  <CalendarDays className="h-3 w-3" />
                  Compra: {purchaseDate ? formatTxDate(purchaseDate) : "definir"}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-64 p-3"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-xs font-semibold text-foreground">Data da compra</p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  Usada para gastos por categoria. A data da parcela ({formatTxDate(date, created_at)}) não será alterada.
                </p>
                <input
                  type="date"
                  value={purchaseDateDraft}
                  onChange={(e) => setPurchaseDateDraft(e.target.value)}
                  className="mt-2 h-9 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary/60"
                />
                <button
                  type="button"
                  disabled={!purchaseDateDraft || savingPurchaseDate}
                  onClick={(e) => { e.stopPropagation(); void savePurchaseDate(); }}
                  className="mt-2 h-9 w-full rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {savingPurchaseDate ? "Salvando..." : "Salvar data da compra"}
                </button>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
    </div>
  );
}