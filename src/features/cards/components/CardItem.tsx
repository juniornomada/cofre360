import { CardBrand } from "@/components/CardBrand";
import { BankLogo } from "@/components/BankLogo";
import { CreditCard, MoreVertical, Wallet, Pencil, Trash2, Eye, EyeOff, Copy, Receipt, FileUp } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { CardData } from "../types";
import { cn } from "@/lib/utils";

interface CardItemProps {
  card: CardData;
  totalInvoice: number;
  paidAmount: number;
  onPay: (card: CardData) => void;
  onViewInvoice: (card: CardData) => void;
  onEdit: (card: CardData) => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string, current: boolean | null) => void;
  onImportPdf: (card: CardData) => void;
}

export function CardItem({ 
  card, totalInvoice, paidAmount, onPay, onViewInvoice, 
  onEdit, onDelete, onToggleVisibility, onImportPdf 
}: CardItemProps) {
  const remaining = Math.max(0, totalInvoice - paidAmount);
  const pct = card.card_limit > 0 ? Math.round((totalInvoice / card.card_limit) * 100) : 0;

  return (
    <div className={cn(
      "group relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg transition-all active:scale-[0.98]",
      card.color || "from-gray-700 to-gray-900",
      !card.is_visible && "opacity-60 grayscale-[0.5]"
    )}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-md">
            <CardBrand brand={card.brand} size="sm" className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-sm truncate max-w-[120px]">{card.name}</h3>
            <p className="text-[10px] text-white/70">Final {card.last_four || "****"}</p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl">
            <DropdownMenuItem onClick={() => onEdit(card)} className="gap-2">
              <Pencil className="h-4 w-4" /> Editar cartão
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleVisibility(card.id, card.is_visible)} className="gap-2">
              {card.is_visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {card.is_visible ? "Ocultar do início" : "Mostrar no início"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onImportPdf(card)} className="gap-2">
              <FileUp className="h-4 w-4" /> Importar PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onDelete(card.id)} className="gap-2 text-destructive">
              <Trash2 className="h-4 w-4" /> Excluir cartão
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-[10px] text-white/60 uppercase tracking-wider font-semibold">Fatura Atual</p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums">
              R$ {totalInvoice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
          <div>
            <p className="text-[10px] text-white/50">Disponível</p>
            <p className="text-xs font-semibold tabular-nums">
              R$ {(card.card_limit - totalInvoice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-white/50">Limite</p>
            <p className="text-xs font-semibold tabular-nums">
              R$ {card.card_limit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button 
          onClick={() => onViewInvoice(card)}
          className="flex-1 bg-white/10 hover:bg-white/20 py-2 rounded-xl text-xs font-semibold backdrop-blur-md transition-colors flex items-center justify-center gap-1.5"
        >
          <Receipt className="h-3.5 w-3.5" /> Fatura
        </button>
        <button 
          onClick={() => onPay(card)}
          disabled={remaining <= 0}
          className="flex-1 bg-white text-gray-900 hover:bg-white/90 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 disabled:bg-white/50 flex items-center justify-center gap-1.5"
        >
          <Wallet className="h-3.5 w-3.5" /> Pagar
        </button>
      </div>
    </div>
  );
}
