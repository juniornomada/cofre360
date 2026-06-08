import { Plus, ArrowUpRight, ArrowDownRight, ArrowLeftRight, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRef, forwardRef, useImperativeHandle } from "react";

interface EmptyStateProps {
  onAction: (type: "income" | "expense" | "transfer") => void;
  title?: string;
  description?: string;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ onAction, title, description }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => containerRef.current as HTMLDivElement);

    return (
      <div 
        ref={containerRef}
        tabIndex={-1}
        className="flex flex-col items-center justify-center py-12 px-4 text-center animate-in fade-in zoom-in duration-500 focus:outline-none"
        role="region"
        aria-labelledby="empty-state-title"
      >
         <div className="relative mb-6" role="img" aria-label="Carteira com sinal de mais">
           <div className="h-20 w-20 rounded-full bg-primary/5 flex items-center justify-center ring-1 ring-primary/10">
             <Wallet className="h-10 w-10 text-primary/40" aria-hidden="true" />
           </div>
           <div className="absolute -right-1 -bottom-1 h-8 w-8 rounded-full bg-background flex items-center justify-center shadow-sm border border-border">
             <Plus className="h-4 w-4 text-primary" aria-hidden="true" />
           </div>
         </div>
        
        <h3 id="empty-state-title" className="text-lg font-semibold text-foreground mb-2">
          {title || "Comece sua jornada financeira"}
        </h3>
        <p className="text-sm text-muted-foreground max-w-[280px] mb-8">
          {description || "Registre suas primeiras movimentações para visualizar seus gastos e ganhos de forma inteligente."}
        </p>

        <div className="grid grid-cols-1 gap-3 w-full max-w-[280px]">
           <Button
             variant="outline"
             onClick={() => onAction("expense")}
             className="justify-start gap-3 h-auto py-3 px-4 rounded-xl border-border/50 hover:border-destructive/30 hover:bg-destructive/5 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-0 focus-visible:outline-none transition-all group"
             aria-label="Registrar Despesa. Exemplo: Aluguel, mercado, lazer"
           >
             <div className="h-8 w-8 shrink-0 rounded-lg bg-destructive/10 flex items-center justify-center group-hover:bg-destructive/20 transition-colors">
               <ArrowDownRight className="h-4 w-4 text-destructive" aria-hidden="true" />
             </div>
             <div className="text-left">
               <p className="text-sm font-medium">Registrar Despesa</p>
               <p className="text-[10px] text-muted-foreground">Ex: Aluguel, mercado, lazer</p>
             </div>
           </Button>

           <Button
             variant="outline"
             onClick={() => onAction("income")}
             className="justify-start gap-3 h-auto py-3 px-4 rounded-xl border-border/50 hover:border-primary/30 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 focus-visible:outline-none transition-all group"
             aria-label="Registrar Receita. Exemplo: Salário, bônus, vendas"
           >
             <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
               <ArrowUpRight className="h-4 w-4 text-primary" aria-hidden="true" />
             </div>
             <div className="text-left">
               <p className="text-sm font-medium">Registrar Receita</p>
               <p className="text-[10px] text-muted-foreground">Ex: Salário, bônus, vendas</p>
             </div>
           </Button>

           <Button
             variant="outline"
             onClick={() => onAction("transfer")}
             className="justify-start gap-3 h-auto py-3 px-4 rounded-xl border-border/50 hover:border-foreground/20 hover:bg-accent/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:outline-none transition-all group"
             aria-label="Fazer Transferência entre suas próprias contas"
           >
             <div className="h-8 w-8 shrink-0 rounded-lg bg-accent flex items-center justify-center group-hover:bg-accent/80 transition-colors">
               <ArrowLeftRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
             </div>
             <div className="text-left">
               <p className="text-sm font-medium">Fazer Transferência</p>
               <p className="text-[10px] text-muted-foreground">Entre suas próprias contas</p>
             </div>
           </Button>
        </div>
      </div>
    );
  }
);

EmptyState.displayName = "EmptyState";
