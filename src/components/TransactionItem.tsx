import { cn } from "@/lib/utils";
import { getCategoryDisplay, getCategoryIcon } from "@/lib/categories";
import { restoreAccents } from "@/lib/restore-accents";
import { CreditCard, Landmark, ArrowLeftRight, Layers, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
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
  
  is_visible?: boolean;
  amountVisible?: boolean;
}

export function TransactionItem({ 
  icon, name, category, date, amount, type, card, cardBrand, 
  bank_account_id, isTransferPair, transferFromName, transferToName, 
  installment_number, total_installments, style, onEdit, onDelete, amountVisible = true
}: TransactionItemProps) {
  const isInstallment = !!total_installments && total_installments > 1 && !!installment_number;
  // Strip the trailing "(n/m)" from the displayed name since we'll show it as a badge.
  const displayName = isInstallment
    ? name.replace(/\s*\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)\s*$/, "").trim()
    : name;
  const displayIcon = getCategoryIcon(category) || icon;
  const isCard = !!card;
  const isTransfer = category === "Transferência" || category === "Transferências" || category.startsWith("Transferências >") || isTransferPair;
  const isBank = !card && !!bank_account_id && !isTransfer;

  return (
    <div
      onClick={onEdit}
      className={cn(
        "interactive-card flex items-center gap-4 rounded-[2.5rem] p-4 cursor-pointer bg-card/10 hover:bg-card/30 border border-white/[0.03] transition-all duration-500 group/item relative overflow-hidden active:scale-[0.98] sm:pr-4 pr-12 shadow-sm hover:shadow-xl hover:border-white/[0.08]"
      )}
      style={style}
    >
      {onDelete && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 sm:opacity-0 group-hover/item:opacity-100 focus-within:opacity-100 transition-all duration-300 sm:translate-x-4 group-hover/item:translate-x-0 z-10">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2.5 rounded-2xl bg-destructive/10 text-destructive hover:bg-destructive transition-all hover:text-white shadow-lg"
            aria-label="Excluir"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="relative h-12 w-12 shrink-0">
        <div className="flex h-full w-full items-center justify-center rounded-[1.25rem] bg-card/40 text-xl transition-all duration-500 group-hover/item:scale-110 group-hover/item:rotate-3 shadow-inner border border-white/[0.05]">
          {isTransferPair ? (
            <span role="img" aria-hidden="true" className="filter grayscale group-hover/item:grayscale-0 transition-all duration-500">🔄</span>
          ) : (
            <span role="img" aria-label={category}>{displayIcon}</span>
          )}
        </div>
        
        {isCard && (
          <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background shadow-lg">
            <CreditCard className="h-2.5 w-2.5" strokeWidth={3} />
          </div>
        )}
        {isBank && (
          <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-black ring-4 ring-background shadow-lg">
            <Landmark className="h-2.5 w-2.5" strokeWidth={3} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <p className="text-xs font-black text-foreground truncate tracking-tight uppercase group-hover/item:text-primary transition-colors">
              {isTransferPair && transferFromName && transferToName ? (
                `${transferFromName} → ${transferToName}`
              ) : (
                restoreAccents(displayName)
              )}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                {getCategoryDisplay(category)}
              </span>
              <span className="h-1 w-1 rounded-full bg-white/10" />
              <span className="text-[9px] text-muted-foreground/60 font-bold">
                {formatTxDate(date)}
              </span>
            </div>
          </div>

          <div className="text-right shrink-0 flex flex-col items-end">
            <span className={cn(
              "text-sm font-black tabular-nums tracking-tighter transition-all duration-500",
              isTransferPair ? "text-muted-foreground" : type === "income" ? "text-primary" : "text-foreground"
            )}>
              {isTransferPair ? "" : type === "expense" ? "-" : "+"}
              {amountVisible ? `R$ ${Math.abs(amount).toFixed(2)}` : "R$ ••••"}
            </span>
            {isInstallment && (
              <span className="text-[8px] font-black text-muted-foreground uppercase tracking-wider mt-1 bg-white/5 px-2 py-0.5 rounded-full border border-white/[0.03]">
                Parcela {installment_number}/{total_installments}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
