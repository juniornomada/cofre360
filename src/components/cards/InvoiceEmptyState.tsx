import { Inbox, Plus, ChevronLeft } from "lucide-react";

export interface InvoiceEmptyStateProps {
  startDate: Date;
  endDate: Date;
  cardName?: string;
  canGoPrev: boolean;
  onAdd: () => void;
  onPrev: () => void;
}

export function InvoiceEmptyState({
  startDate,
  endDate,
  cardName,
  canGoPrev,
  onAdd,
  onPrev,
}: InvoiceEmptyStateProps) {
  const fmt = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center text-center py-10 px-4 rounded-xl border border-dashed border-border bg-muted/20"
    >
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-foreground">
        Nenhuma transação neste período
      </p>
      <p className="mt-1 text-xs text-muted-foreground max-w-[16rem]">
        Não há lançamentos entre {fmt(startDate)} e {fmt(endDate)}
        {cardName ? ` para ${cardName}` : ""}.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="interactive-button inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Adicionar transação
        </button>
        <button
          type="button"
          onClick={onPrev}
          disabled={!canGoPrev}
          className="interactive-button inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-foreground text-xs font-medium hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Ver fatura anterior
        </button>
      </div>
    </div>
  );
}
