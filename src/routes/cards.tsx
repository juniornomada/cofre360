import { createFileRoute } from "@tanstack/react-router";
import { SmartLink as Link } from "@/components/SmartLink";
import { ArrowLeft, Plus, Loader2, Wallet, Landmark, Receipt, FileUp, GripVertical, Info } from "lucide-react";
import { useState, useCallback, useRef, lazy, Suspense } from "react";
import { useAlert } from "@/routes/__root";
import { cn } from "@/lib/utils";
import { useCards } from "@/features/cards/hooks/useCards";
import { useCardActions } from "@/features/cards/hooks/useCardActions";
import { CardItem } from "@/features/cards/components/CardItem";
import { CardData } from "@/features/cards/types";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";

// Lazy components
const PdfInvoiceImportDialog = lazy(() => import("@/components/PdfInvoiceImportDialog").then(m => ({ default: m.PdfInvoiceImportDialog })));

function SortableCardWrapper({ id, children, animationDelay }: { id: string; children: React.ReactNode; animationDelay: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    animationDelay: `${animationDelay}ms`,
    touchAction: "manipulation",
  } as React.CSSProperties;
  
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "animate-stagger-in cursor-grab active:cursor-grabbing relative select-none",
        isDragging && "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-2xl shadow-2xl scale-[1.02] transition-transform",
      )}
    >
      {children}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/30 backdrop-blur-[1px] animate-fade-in">
          <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-gray-900 shadow-lg ring-2 ring-primary">
            <GripVertical className="h-4 w-4" />
            Mover cartão
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/cards")({
  head: () => ({
    meta: [
      { title: "Cartões — Cofre 360" },
      { name: "description", content: "Gerencie seus cartões" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    action: (search.action as string) || undefined,
  }),
  component: CardsPage,
});

export function CardsPage() {
  const { showAlert } = useAlert();
  const { cards, cardTotals, cardPayments, loading, refresh, bankAccounts } = useCards();
  const { toggleVisibility, deleteCard } = useCardActions(refresh);
  
  const [pdfImportOpen, setPdfImportOpen] = useState(false);
  const [pdfImportCard, setPdfImportCard] = useState<CardData | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 1000, tolerance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 1000, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    const oldIndex = cards.findIndex((c) => c.id === active.id);
    const newIndex = cards.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    
    const reordered = arrayMove(cards, oldIndex, newIndex);
    // Logic to persist order could be moved to a service
    const updates = reordered.map((c, idx) =>
      supabase.from("cards").update({ sort_order: idx }).eq("id", c.id)
    );
    const results = await Promise.all(updates);
    if (results.some((r) => r.error)) {
      showAlert("Erro ao salvar nova ordem", "error");
    }
    refresh();
  }, [cards, refresh, showAlert]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const totalAllInvoices = cards.reduce((sum, c) => {
    const used = cardTotals[c.name] || 0;
    const paid = cardPayments[c.id] || 0;
    return sum + Math.max(0, used - paid);
  }, 0);
  const totalLimit = cards.reduce((sum, c) => sum + (c.card_limit || 0), 0);

  return (
    <div className="animate-page-enter p-4 pb-24">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="interactive-button flex h-11 w-11 items-center justify-center rounded-2xl bg-card/40 backdrop-blur-md border border-white/[0.05] text-muted-foreground shadow-sm">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Meus Cartões</h1>
            <p className="text-xs text-muted-foreground">Gerencie seus limites e faturas</p>
          </div>
        </div>
        <button 
          className="interactive-button flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/20 border border-primary/20"
          aria-label="Adicionar novo cartão"
        >
          <Plus className="h-5 w-5" />
        </button>
      </header>

      {/* Summary Widget */}
      <div className="mb-6 rounded-3xl bg-card/40 backdrop-blur-xl border border-white/[0.05] p-6 shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 blur-2xl rounded-full -mr-12 -mt-12 transition-all group-hover:bg-primary/10" />
        <div className="flex items-center gap-2 mb-3 text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Visão Geral</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total em Faturas</p>
            <p className="text-lg font-bold text-foreground tabular-nums">
              R$ {totalAllInvoices.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Limite Total</p>
            <p className="text-lg font-bold text-primary tabular-nums">
              R$ {totalLimit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {cards.map((card, idx) => (
              <SortableCardWrapper key={card.id} id={card.id} animationDelay={idx * 50}>
                <CardItem
                  card={card}
                  totalInvoice={cardTotals[card.name] || 0}
                  paidAmount={cardPayments[card.id] || 0}
                  onPay={() => {}} // TODO: Implement dialogs
                  onViewInvoice={() => {}} // TODO: Implement dialogs
                  onEdit={() => {}} // TODO: Implement dialogs
                  onDelete={deleteCard}
                  onToggleVisibility={toggleVisibility}
                  onImportPdf={(c) => {
                    setPdfImportCard(c);
                    setPdfImportOpen(true);
                  }}
                />
              </SortableCardWrapper>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {cards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/50 text-muted-foreground">
            <Wallet className="h-8 w-8" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Nenhum cartão cadastrado</h3>
          <p className="mt-1 text-xs text-muted-foreground">Adicione seu primeiro cartão para começar.</p>
        </div>
      )}

      <Suspense fallback={null}>
        {pdfImportCard && (
          <PdfInvoiceImportDialog
            open={pdfImportOpen}
            onOpenChange={setPdfImportOpen}
            cardId={pdfImportCard.id}
            cardName={pdfImportCard.name}
            onSuccess={refresh}
          />
        )}
      </Suspense>
    </div>
  );
}
