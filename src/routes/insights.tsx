import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, ShieldCheck, FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AITestHistory } from "@/components/AITestHistory";
import { supabase } from "@/integrations/supabase/client";
import { FinancialChat } from "@/components/FinancialChat";

export const Route = createFileRoute("/insights")({
  component: AIInsightsChat,
});

const SUGGESTED_QUESTIONS = [
  "Como estão minhas finanças este mês?",
  "Qual foi o gasto total deste mês?",
  "Quais categorias tiveram mais gastos neste mês?",
  "Como os gastos de Alimentação estão divididos por subcategoria neste mês?",
  "Quais parcelas de compras antigas foram cobradas neste mês?",
  "Qual foi o total de receitas deste mês?",
  "Compare as compras realizadas neste mês com o mês passado.",
  "Qual a diferença entre gasto econômico e movimentação financeira?",
];

function AIInsightsChat() {
  const [canAudit, setCanAudit] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled || error) return;
      const meta = data.user?.app_metadata;
      setCanAudit(meta?.role === "admin" || meta?.run_ai_tests === true);
    });
    return () => { cancelled = true; };
  }, []);
  return (
    <div className="animate-page-enter flex flex-col gap-6 px-4 pt-6 pb-24 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          AI Insights
          <ShieldCheck className="h-6 w-6 text-primary" />
        </h1>
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Converse com a IA sobre suas finanças
        </p>
      </div>

      {canAudit && (
        <Button variant="outline" className="self-start" onClick={() => setShowAudit((open) => !open)}>
          <FlaskConical className="mr-2 h-4 w-4" />{showAudit ? "Fechar auditoria" : "Auditoria do consultor"}
        </Button>
      )}
      {canAudit && showAudit ? <AITestHistory /> : <FinancialChat suggestions={SUGGESTED_QUESTIONS} />}
    </div>
  );
}
