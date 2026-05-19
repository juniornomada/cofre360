import { createFileRoute } from "@tanstack/react-router";
import { Send, Bot, Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat — Cofre 360" },
      { name: "description", content: "Converse com seu assistente financeiro" },
    ],
  }),
  component: ChatPage,
});

interface Message {
  id: number;
  text: string;
  sender: "user" | "ai";
}

const suggestions = [
  "Quanto gastei esse mês?",
  "Como posso economizar?",
  "Analise meus gastos",
  "Quais são minhas metas?",
];

function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Olá! 👋 Sou seu assistente financeiro. Como posso te ajudar hoje?",
      sender: "ai",
    },
  ]);
  const [input, setInput] = useState("");

  const handleSend = (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim()) return;

    const userMsg: Message = { id: Date.now(), text: messageText, sender: "user" };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Simulated AI response
    setTimeout(() => {
      const aiMsg: Message = {
        id: Date.now() + 1,
        text: getAIResponse(messageText),
        sender: "ai",
      };
      setMessages((prev) => [...prev, aiMsg]);
    }, 1000);
  };

  return (
    <div className="animate-page-enter flex h-[calc(100vh-5rem)] flex-col px-4 pt-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-bold text-foreground">Assistente IA</h1>
          <p className="text-xs text-primary">● Online</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
              msg.sender === "ai"
                ? "bg-card text-foreground self-start"
                : "bg-primary text-primary-foreground self-end ml-auto"
            )}
          >
            {msg.text}
          </div>
        ))}

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              Sugestões
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="interactive-button rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors duration-200 hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 py-3">
        <div className="flex flex-1 items-center rounded-xl bg-card px-3 py-2.5">
          <input
            type="text"
            placeholder="Digite sua pergunta..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
        <button
          onClick={() => handleSend()}
          className="interactive-button flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function getAIResponse(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("gast")) {
    return "Este mês você gastou R$ 2.683,30. Suas maiores categorias foram Moradia (R$ 1.800) e Alimentação (R$ 458,40). Quer ver um detalhamento completo?";
  }
  if (lower.includes("econom")) {
    return "Com base nos seus gastos, identifiquei 3 oportunidades: 1) Reduzir delivery em 30% (economia de ~R$ 130), 2) Revisar assinaturas de streaming (R$ 40/mês), 3) Optar por transporte público 2x/semana (R$ 90/mês).";
  }
  if (lower.includes("analis")) {
    return "📊 Análise do mês: Você está usando 36% da sua renda em despesas. Isso é ótimo! A recomendação é manter abaixo de 50%. Seu maior gasto é moradia (67% das despesas).";
  }
  if (lower.includes("meta")) {
    return "Você tem 2 metas ativas: 1) Reserva de emergência — 65% concluída (R$ 9.750 / R$ 15.000), 2) Viagem — 30% concluída (R$ 1.500 / R$ 5.000). Continue assim! 🎯";
  }
  return "Entendi! Posso te ajudar a analisar seus gastos, criar metas financeiras, ou dar dicas de economia. O que prefere?";
}
