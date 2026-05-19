import { useState, useRef, useEffect } from "react";
import { Send, Bot, Sparkles, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Como estão minhas finanças este mês?",
  "Onde posso economizar?",
  "Análise meus gastos por categoria",
  "Dicas para alcançar minhas metas",
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/financial-chat`;

export function FinancialChat({ initialPrompt }: { initialPrompt?: string } = {}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [loadingFollowUps, setLoadingFollowUps] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, followUps]);

  // Auto-envia prompt inicial vindo via query string (ex.: card "Previsto fim do mês")
  // Só dispara depois que o componente montou no client, evitando hydration mismatch.
  useEffect(() => {
    if (!mounted) return;
    if (!initialPrompt) return;
    if (autoSentRef.current === initialPrompt) return;
    autoSentRef.current = initialPrompt;
    send(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, mounted]);

  const fetchFollowUps = async (convo: Msg[]) => {
    setLoadingFollowUps(true);
    try {
      const resp = await fetch(`${CHAT_URL}?mode=suggestions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: convo }),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (Array.isArray(data.suggestions)) setFollowUps(data.suggestions);
    } catch (e) {
      console.error("follow-ups error:", e);
    } finally {
      setLoadingFollowUps(false);
    }
  };

  const send = async (text?: string) => {
    const messageText = (text ?? input).trim();
    if (!messageText || isLoading) return;

    const userMsg: Msg = { role: "user", content: messageText };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setFollowUps([]);

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) {
          toast.error("Muitas requisições. Aguarde alguns segundos.");
        } else if (resp.status === 402) {
          toast.error("Créditos esgotados. Adicione fundos ao workspace.");
        } else {
          toast.error("Não consegui responder agora. Tente novamente.");
        }
        setIsLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {}
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao conectar com o assistente.");
    } finally {
      setIsLoading(false);
    }

    // Buscar perguntas de follow-up baseadas no contexto da conversa
    if (assistantSoFar.trim()) {
      const finalConvo: Msg[] = [...newMessages, { role: "assistant", content: assistantSoFar }];
      fetchFollowUps(finalConvo);
    }
  };

  return (
    <div className="rounded-2xl bg-card border border-border/50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/50 bg-gradient-to-r from-primary/10 via-violet-500/5 to-transparent">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500 shadow-lg shadow-primary/20">
          <Bot className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            Assistente Financeiro
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </h2>
          <p className="text-[10px] text-emerald-400 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Online — analisando seus dados em tempo real
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[420px] min-h-[280px]">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-accent/40 px-4 py-3 max-w-[85%]">
              <p className="text-sm text-foreground">
                Olá! 👋 Sou seu assistente financeiro. Posso analisar seus gastos, sugerir economias e te ajudar a alcançar suas metas. Como posso ajudar hoje?
              </p>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                Sugestões rápidas
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={isLoading}
                    className="interactive-button rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors duration-200 hover:bg-accent disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm animate-fade-in",
              msg.role === "assistant"
                ? "bg-accent/40 text-foreground self-start"
                : "bg-primary text-primary-foreground self-end ml-auto",
            )}
          >
            {msg.role === "assistant" ? (
              <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-strong:text-foreground">
                <ReactMarkdown>{msg.content || "..."}</ReactMarkdown>
              </div>
            ) : (
              <p>{msg.content}</p>
            )}
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground animate-fade-in">
            <Loader2 className="h-3 w-3 animate-spin" />
            Pensando...
          </div>
        )}

        {/* Sugestões de follow-up dinâmicas */}
        {!isLoading && (followUps.length > 0 || loadingFollowUps) && messages.length > 0 && (
          <div className="pt-1 animate-fade-in">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              {loadingFollowUps ? "Gerando sugestões..." : "Continue a conversa"}
            </div>
            {loadingFollowUps ? (
              <div className="flex gap-2">
                <div className="h-7 w-32 rounded-full bg-accent/40 animate-pulse" />
                <div className="h-7 w-40 rounded-full bg-accent/40 animate-pulse" />
                <div className="h-7 w-28 rounded-full bg-accent/40 animate-pulse" />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {followUps.map((s, i) => (
                  <button
                    key={`${i}-${s}`}
                    onClick={() => send(s)}
                    className="interactive-button rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-foreground transition-colors duration-200 hover:bg-primary/10 hover:border-primary/50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 p-3 border-t border-border/50 bg-card">
        <input
          type="text"
          placeholder="Pergunte algo sobre suas finanças..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={isLoading}
          className="flex-1 rounded-xl bg-accent/40 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        <button
          onClick={() => send()}
          disabled={isLoading || !input.trim()}
          className="interactive-button flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
