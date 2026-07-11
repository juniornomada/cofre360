import { useId } from "react";
import { Inbox, Plus, ChevronLeft, Receipt } from "lucide-react";

export interface InvoiceEmptyStateProps {
  startDate: Date;
  endDate: Date;
  cardName?: string;
  canGoPrev: boolean;
  onAdd: () => void;
  onPrev: () => void;
  /**
   * Distinct variant used when the period has NO transactions but DOES have
   * one or more payments. Shows a softer note ("Somente pagamentos neste
   * período") instead of the generic empty state.
   */
  paymentsCount?: number;
}

export function InvoiceEmptyState({
  startDate,
  endDate,
  cardName,
  canGoPrev,
  onAdd,
  onPrev,
  paymentsCount = 0,
}: InvoiceEmptyStateProps) {
  const titleId = useId();
  const descId = useId();

  const fmt = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  const isPaymentsOnly = paymentsCount > 0;
  const title = isPaymentsOnly
    ? "Somente pagamentos neste período"
    : "Nenhuma transação neste período";
  const Icon = isPaymentsOnly ? Receipt : Inbox;
  const suffix = cardName ? ` para ${cardName}` : "";
  const description = isPaymentsOnly
    ? `Existem ${paymentsCount} pagamento${paymentsCount === 1 ? "" : "s"} registrado${paymentsCount === 1 ? "" : "s"}${suffix}, mas nenhuma despesa foi lançada entre ${fmt(startDate)} e ${fmt(endDate)}.`
    : `Não há lançamentos entre ${fmt(startDate)} e ${fmt(endDate)}${suffix}.`;

  return (
    <section
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-variant={isPaymentsOnly ? "payments-only" : "empty"}
      className="flex flex-col items-center justify-center text-center py-10 px-4 rounded-xl border border-dashed border-border bg-muted/20"
    >
      <div
        className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3"
        aria-hidden="true"
      >
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <p id={titleId} className="text-sm font-semibold text-foreground">
        {title}
      </p>
      <p id={descId} className="mt-1 text-xs text-muted-foreground max-w-[16rem]">
        {description}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="interactive-button focus-ring-safe inline-flex items-center gap-1.5 px-3 min-h-11 min-w-11 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Adicionar transação</span>
        </button>
        <button
          type="button"
          onClick={onPrev}
          disabled={!canGoPrev}
          aria-disabled={!canGoPrev}
          className="interactive-button focus-ring-safe inline-flex items-center gap-1.5 px-3 min-h-11 min-w-11 rounded-lg bg-accent text-foreground text-xs font-medium hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Ver fatura anterior</span>
        </button>
      </div>
    </section>
  );
}
