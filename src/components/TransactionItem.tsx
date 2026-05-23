import { cn } from "@/lib/utils";
import { getCategoryDisplay, getCategoryIcon } from "@/lib/categories";
import { restoreAccents } from "@/lib/restore-accents";
import { CreditCard, Landmark, ArrowLeftRight, Layers, Pencil, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const MONTHS_PT_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function formatTxDate(date: string): string {
  // Match YYYY-MM-DD (ISO) — convert to "DD mmm" in pt-BR
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const day = parseInt(iso[3], 10);
    const month = parseInt(iso[2], 10) - 1;
    if (month >= 0 && month < 12) return `${day} ${MONTHS_PT_ABBR[month]}`;
  }
  // Match DD/MM or DD/MM/YYYY
  const br = date.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (br) {
    const day = parseInt(br[1], 10);
    const month = parseInt(br[2], 10) - 1;
    if (month >= 0 && month < 12) return `${day} ${MONTHS_PT_ABBR[month]}`;
  }
  return date;
}

interface TransactionItemProps {
  icon: string;
  name: string;
  category: string;
  date: string;
  amount: number;
  type: "income" | "expense";
  card?: string;
  cardBrand?: string;
  bank_account_id?: string | null;
  isTransferPair?: boolean;
  transferFromName?: string;
  transferToName?: string;
  installment_number?: number;
  total_installments?: number;
  style?: React.CSSProperties;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function TransactionItem({ icon, name, category, date, amount, type, card, cardBrand, bank_account_id, isTransferPair, transferFromName, transferToName, installment_number, total_installments, style, onEdit, onDelete }: TransactionItemProps) {
  const isInstallment = !!total_installments && total_installments > 1 && !!installment_number;
  // Strip the trailing "(n/m)" from the displayed name since we'll show it as a badge.
  const displayName = isInstallment
    ? name.replace(/\s*\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)\s*$/, "").trim()
    : name;
  const displayIcon = getCategoryIcon(category) || icon;
  const isCard = !!card;
  const isTransfer = category === "Transferência" || isTransferPair;
  const isBank = !card && !!bank_account_id && !isTransfer;

  return (
    <div
      onClick={onEdit}
      className="interactive-card flex items-center gap-3 rounded-xl p-3 cursor-pointer bg-card border border-border/30 transition-all group/item relative overflow-hidden active:scale-[0.98] sm:pr-3 pr-[48px]"
      style={style}
    >
      { onDelete && (
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
              <div className="flex h-full w-full items-center justify-center rounded-xl bg-accent text-lg transition-transform duration-200 group-active:scale-90 overflow-hidden content-visibility-auto">
                <span role="img" aria-label="Transferência">🔄</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Transferência de {transferFromName} para {transferToName}
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
          <p className="text-sm font-semibold text-foreground truncate">
            {isTransferPair && transferFromName && transferToName ? (
              <span className="transition-colors hover:text-primary">
                {transferFromName} → {transferToName}
              </span>
            ) : (
              <>
                {restoreAccents(displayName)}
                {isInstallment && (
                  <span 
                    className="ml-1 text-[10px] font-normal text-muted-foreground whitespace-nowrap"
                    aria-label={`Parcela ${installment_number} de ${total_installments}`}
                    tabIndex={0}
                  >
                    ({installment_number}/{total_installments})
                  </span>
                )}
              </>
            )}
          </p>
          <span className={cn(
            "text-sm font-bold tabular-nums shrink-0",
            isTransferPair ? "text-muted-foreground" : type === "income" ? "text-primary" : "text-foreground"
          )}>
            {isTransferPair ? "" : type === "expense" ? "- " : "+ "}R$ {Math.abs(amount).toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded truncate max-w-[120px]">
              {getCategoryDisplay(category)}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium shrink-0">
              {formatTxDate(date)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
