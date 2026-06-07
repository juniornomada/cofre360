import { cn } from "@/lib/utils";
import { CreditCard, Eye, EyeOff, MoreVertical, Pencil, Trash2, Check, X, Wallet, Receipt, FileUp } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { CalculatorAmountInput } from "@/components/CalculatorAmountInput";
import { CardBrand, brandPresets } from "@/components/CardBrand";

export type CardData = {
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

interface CreditCardComponentProps {
  card: CardData;
  isEditing: boolean;
  editName: string;
  editBrand: string;
  editLimit: string;
  editClosing: string;
  editDue: string;
  deleteConfirm: string | null;
  outstandingBalance: number;
  invoiceRemaining: number;
  totalPaid: number;
  pct: number;
  activeInvoiceLabel: string;
  formattedClosingDate: string;
  formattedDueDate: string;
  onStartEdit: (card: CardData) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onSetDeleteConfirm: (id: string | null) => void;
  onToggleVisibility: (id: string, current: boolean | null) => void;
  onSetEditName: (v: string) => void;
  onSetEditBrand: (v: string) => void;
  onSetEditLimit: (v: string) => void;
  onSetEditClosing: (v: string) => void;
  onSetEditDue: (v: string) => void;
  onOpenPayDialog: (card: CardData) => void;
  onOpenInvoiceDialog: (card: CardData) => void;
  onOpenPdfImport: (card: CardData) => void;
}

export function CreditCardComponent({
  card,
  isEditing,
  editName,
  editBrand,
  editLimit,
  editClosing,
  editDue,
  deleteConfirm,
  outstandingBalance,
  invoiceRemaining,
  totalPaid,
  pct,
  activeInvoiceLabel,
  formattedClosingDate,
  formattedDueDate,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onSetDeleteConfirm,
  onToggleVisibility,
  onSetEditName,
  onSetEditBrand,
  onSetEditLimit,
  onSetEditClosing,
  onSetEditDue,
  onOpenPayDialog,
  onOpenInvoiceDialog,
  onOpenPdfImport,
}: CreditCardComponentProps) {
  return (
    <article 
      className="card group overflow-hidden border border-border/40 bg-card rounded-2xl shadow-sm transition-all duration-300 hover:shadow-md focus-within:ring-2 focus-within:ring-primary/20"
      tabIndex={0}
      aria-labelledby={`card-title-${card.id}`}
    >
      <header className={cn("relative p-4 text-white bg-gradient-to-br", card.color || "from-gray-700 to-gray-900")}>
        <div className="absolute -top-10 -right-10 h-28 w-28 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        
        <div className="flex items-center justify-between gap-2 relative z-10 mb-6">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input
                value={editName}
                onChange={(e) => onSetEditName(e.target.value)}
                className="h-8 w-full max-w-[200px] rounded-lg bg-white/20 border-white/30 text-white text-sm font-bold placeholder:text-white/50 focus:bg-white/30"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") onSaveEdit(card.id); if (e.key === "Escape") onCancelEdit(); }}
                aria-label="Nome do cartão"
              />
            ) : (
              <div className="flex items-center gap-2 group/name" id={`card-title-${card.id}`}>
                <h3 className="text-sm font-bold truncate leading-tight">{card.name}</h3>
                <button 
                  onClick={() => onStartEdit(card)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/20 rounded"
                  aria-label="Editar nome"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] font-mono tabular-nums text-white/85" aria-label={`Final do cartão ${card.last_four}`}>•••• {card.last_four}</span>
              <CardBrand brand={isEditing ? editBrand : card.brand} size="sm" />
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 relative z-20">
            {isEditing ? (
              <div className="flex items-center gap-1 bg-white/20 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-sm">
                <button 
                  onClick={() => onSaveEdit(card.id)} 
                  className="p-1.5 rounded-full hover:bg-green-500/40 text-white transition-colors" 
                  title="Salvar"
                  aria-label="Salvar alterações"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button 
                  onClick={onCancelEdit} 
                  className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors" 
                  title="Cancelar"
                  aria-label="Cancelar edição"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                {deleteConfirm === card.id ? (
                  <div className="flex items-center gap-1 bg-destructive/80 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-sm animate-in zoom-in-95 duration-200">
                    <button 
                      onClick={() => onDelete(card.id)} 
                      className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors"
                      aria-label="Confirmar exclusão"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button 
                      onClick={() => onSetDeleteConfirm(null)} 
                      className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors"
                      aria-label="Cancelar exclusão"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleVisibility(card.id, card.is_visible);
                      }}
                      className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/10 shadow-sm"
                      title={card.is_visible ? "Ocultar do Início" : "Mostrar no Início"}
                      aria-label={card.is_visible ? "Ocultar cartão" : "Mostrar cartão"}
                    >
                      {card.is_visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-white/60" />}
                    </button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button 
                          className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/10 shadow-sm"
                          aria-label="Mais opções"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl">
                        <DropdownMenuItem onClick={() => onStartEdit(card)} className="cursor-pointer">
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar cartão
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onSetDeleteConfirm(card.id)} className="cursor-pointer text-destructive focus:text-destructive">
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

        {isEditing && (
          <div className="flex flex-col gap-3 p-3 bg-black/20 rounded-xl border border-white/10 animate-in fade-in slide-in-from-top-2 duration-300 mb-2">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-white/70">Bandeira</label>
              <div className="flex gap-1 flex-wrap">
                {brandPresets.map((bp) => (
                  <button
                    key={bp.id}
                    onClick={() => onSetEditBrand(bp.id)}
                    className={cn(
                      "px-2 py-1 rounded-md text-[10px] font-bold transition-all",
                      editBrand.toLowerCase() === bp.id.toLowerCase() 
                        ? "bg-white text-black scale-105 shadow-sm" 
                        : "bg-white/10 text-white hover:bg-white/20"
                    )}
                  >
                    {bp.label}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/70">Limite (R$)</label>
                <CalculatorAmountInput
                  value={parseFloat(editLimit) || 0}
                  onChange={(v) => onSetEditLimit(v.toString())}
                  className="h-8 bg-white/20 border-white/30 text-white text-xs font-bold focus:bg-white/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-white/70">Fecha</label>
                  <Input
                    type="number"
                    value={editClosing}
                    onChange={(e) => onSetEditClosing(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    className="h-8 rounded-lg bg-white/20 border-white/30 text-white text-xs font-bold focus:bg-white/30 px-2"
                    min={1} max={31}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-white/70">Vence</label>
                  <Input
                    type="number"
                    value={editDue}
                    onChange={(e) => onSetEditDue(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    className="h-8 rounded-lg bg-white/20 border-white/30 text-white text-xs font-bold focus:bg-white/30 px-2"
                    min={1} max={31}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="card-body p-4 space-y-4">
        <div className="flex justify-between items-end">
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fatura {activeInvoiceLabel.split(" (")[0]}</p>
            <p className="text-xl font-black text-foreground tabular-nums">
              R$ {invoiceRemaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-accent text-[9px] font-bold text-accent-foreground border border-border/50">
                F: {formattedClosingDate}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-[9px] font-bold text-primary border border-primary/20">
                V: {formattedDueDate}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[10px] font-bold">
            <span className={cn(
              pct >= 90 ? "text-destructive" : pct >= 70 ? "text-orange-500" : "text-primary"
            )}>
              {pct}% utilizado
            </span>
            <span className="text-muted-foreground">
              Limite R$ {card.card_limit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-accent/50 overflow-hidden border border-border/30">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700 ease-out",
                pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-orange-500" : "bg-primary"
              )}
              style={{ width: `${Math.min(pct, 100)}%` }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <div className="flex justify-between items-center text-[10px]">
             {totalPaid > 0 ? (
               <p className="text-emerald-600 font-bold flex items-center gap-1">
                 <Check className="h-3 w-3" />
                 R$ {totalPaid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} pagos
               </p>
             ) : (
               <p className="text-muted-foreground">Nenhum pagamento registrado</p>
             )}
             <p className="font-medium text-foreground">
               Disponível: <span className="font-bold">R$ {Math.max(0, card.card_limit - outstandingBalance).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
             </p>
          </div>
        </div>

        <footer className="card-footer pt-2 flex gap-2">
          {(invoiceRemaining > 0 || card.used > 0) && (
            <button
              onClick={() => onOpenPayDialog(card)}
              className="interactive-button flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95"
            >
              <Wallet className="h-3.5 w-3.5" />
              Pagar
            </button>
          )}
          <button
            onClick={() => onOpenInvoiceDialog(card)}
            className="interactive-button flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-secondary py-2.5 text-xs font-bold text-secondary-foreground hover:bg-accent transition-all active:scale-95"
          >
            <Receipt className="h-3.5 w-3.5" />
            Detalhes
          </button>
          <button
            onClick={() => onOpenPdfImport(card)}
            className="interactive-button w-10 flex items-center justify-center rounded-xl bg-accent py-2.5 text-foreground hover:bg-accent/80 transition-all active:scale-95 border border-border/50"
            title="Importar PDF"
            aria-label="Importar fatura em PDF"
          >
            <FileUp className="h-3.5 w-3.5" />
          </button>
        </footer>
      </div>
    </article>
  );
}
