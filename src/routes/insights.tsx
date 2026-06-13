import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, ShieldCheck } from "lucide-react";
import { FinancialChat } from "@/components/FinancialChat";

export const Route = createFileRoute("/insights")({
  component: AIInsightsChat,
});

const SUGGESTED_QUESTIONS = [
  "Quanto gastei esse mês com alimentação?",
  "Quanto gastei esse mês com compras online?",
  "O que posso fazer para reduzir os gastos com alimentação?",
  "Qual a minha projeção de saldo para o fim do mês?",
  "Quanto gastei com Mercado Pago em maio?",
  "Meus gastos aumentaram ou diminuíram em relação ao mês passado?",
  "Quanto gastei com alimentação no mês anterior e qual o comparativo com esse mês?",
];

function AIInsightsChat() {
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

      <FinancialChat suggestions={SUGGESTED_QUESTIONS} />
    </div>
  );
}
