import { Children, isValidElement, useState, useRef, useEffect, type ReactNode } from "react";
import { Send, Bot, Sparkles, Loader2, History, MessageSquarePlus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };
type ConversationSummary = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

const SUGGESTIONS = [
  "Como estão minhas finanças este mês?",
  "Qual foi o gasto total deste mês?",
  "Quais categorias tiveram mais gastos neste mês?",
  "Quais parcelas de compras antigas foram cobradas neste mês?",
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/financial-chat`;
const MAX_CONTEXT_MESSAGES = 20;
const MAX_HISTORY_MESSAGES = 200;
const MAX_VISIBLE_ASSISTANT_ITEMS = 5;

const conversationTitleFrom = (value: string) => {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= 64) return clean;
  return `${clean.slice(0, 61).trimEnd()}...`;
};

const formatConversationDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const assistantNodeText = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(assistantNodeText).join(" ");
  if (isValidElement(node)) {
    return assistantNodeText((node.props as { children?: ReactNode }).children);
  }
  return "";
};

const assistantListTone = (value: string) => {
  const text = value.toLocaleLowerCase("pt-BR");

  // Paleta semântica de alto contraste. Cada categoria usa uma família de cor
  // diferente e combinações específicas para light/dark theme.
  if (text.includes("transporte") || text.includes("🚗")) {
    return "border-cyan-500/60 bg-cyan-50 text-cyan-950 dark:border-cyan-400/50 dark:bg-cyan-400/10 dark:text-cyan-100";
  }
  if (text.includes("compras") || text.includes("🛍️")) {
    return "border-lime-500/70 bg-lime-50 text-lime-950 dark:border-lime-300/60 dark:bg-lime-300/10 dark:text-lime-100";
  }
  if (text.includes("saúde") || text.includes("saude") || text.includes("💊")) {
    return "border-rose-500/60 bg-rose-50 text-rose-950 dark:border-rose-400/50 dark:bg-rose-400/10 dark:text-rose-100";
  }
  if (text.includes("alimentação") || text.includes("alimentacao") || text.includes("🍴")) {
    return "border-amber-500/65 bg-amber-50 text-amber-950 dark:border-amber-300/55 dark:bg-amber-300/10 dark:text-amber-100";
  }
  if (text.includes("moradia") || text.includes("🏠")) {
    return "border-blue-500/60 bg-blue-50 text-blue-950 dark:border-blue-400/50 dark:bg-blue-400/10 dark:text-blue-100";
  }
  if (text.includes("impostos") || text.includes("taxas") || text.includes("🧾")) {
    return "border-orange-500/65 bg-orange-50 text-orange-950 dark:border-orange-400/55 dark:bg-orange-400/10 dark:text-orange-100";
  }
  if (text.includes("educação") || text.includes("educacao") || text.includes("🎓")) {
    return "border-indigo-500/60 bg-indigo-50 text-indigo-950 dark:border-indigo-400/50 dark:bg-indigo-400/10 dark:text-indigo-100";
  }
  if (text.includes("lazer") || text.includes("🎮")) {
    return "border-fuchsia-500/60 bg-fuchsia-50 text-fuchsia-950 dark:border-fuchsia-400/50 dark:bg-fuchsia-400/10 dark:text-fuchsia-100";
  }
  if (text.includes("pets") || text.includes("pet ") || text.includes("🐾")) {
    return "border-teal-500/60 bg-teal-50 text-teal-950 dark:border-teal-400/50 dark:bg-teal-400/10 dark:text-teal-100";
  }
  if (text.includes("receita") || text.includes("💰")) {
    return "border-emerald-500/60 bg-emerald-50 text-emerald-950 dark:border-emerald-400/50 dark:bg-emerald-400/10 dark:text-emerald-100";
  }
  if (text.includes("outros") || text.includes("📦")) {
    return "border-slate-400/60 bg-slate-50 text-slate-950 dark:border-slate-400/45 dark:bg-slate-400/10 dark:text-slate-100";
  }
  return "border-border/60 bg-background/45 text-foreground";
};

function CompactAssistantList({ children, ordered = false }: { children?: ReactNode; ordered?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const canCollapse = items.length > MAX_VISIBLE_ASSISTANT_ITEMS;
  const visibleItems = canCollapse && !expanded ? items.slice(0, MAX_VISIBLE_ASSISTANT_ITEMS) : items;
  const ListTag = ordered ? "ol" : "ul";

  return (
    <div className="my-2.5">
      <ListTag className="space-y-1.5">{visibleItems}</ListTag>
      {canCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 inline-flex items-center rounded-full border border-primary/25 bg-primary/[0.07] px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15"
        >
          {expanded ? "Mostrar menos" : `Ver todos (${items.length})`}
        </button>
      )}
    </div>
  );
}

export function FinancialChat({ initialPrompt, suggestions }: { initialPrompt?: string; suggestions?: string[] } = {}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [loadingFollowUps, setLoadingFollowUps] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const activeSuggestions = suggestions ?? SUGGESTIONS;
  const db = supabase as any;

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.access_token) {
      throw new Error("Sessão expirada");
    }
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    };
  };

  const loadConversationMessages = async (id: string) => {
    const { data, error } = await db
      .from("ai_chat_messages")
      .select("role,content,created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(MAX_HISTORY_MESSAGES);

    if (error) throw error;
    const restored = (data || [])
      .filter((row: any) => row.role === "user" || row.role === "assistant")
      .map((row: any) => ({ role: row.role, content: String(row.content || "") })) as Msg[];

    setConversationId(id);
    setMessages(restored);
    setFollowUps([]);
    setShowHistory(false);
  };

  const restoreHistory = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data, error } = await db
        .from("ai_chat_conversations")
        .select("id,title,created_at,updated_at")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false })
        .limit(12);

      if (error) throw error;
      const items = (data || []) as ConversationSummary[];
      setConversations(items);

      if (items.length > 0) {
        await loadConversationMessages(items[0].id);
      }
    } catch (error) {
      console.error("financial chat history restore error:", error);
      toast.error("Não foi possível carregar o histórico do Insights IA.");
    } finally {
      setHistoryReady(true);
    }
  };

  const ensureConversation = async (firstMessage: string): Promise<string | null> => {
    const title = conversationTitleFrom(firstMessage);

    if (conversationId) {
      const current = conversations.find((item) => item.id === conversationId);
      if (current && !current.title) {
        const updatedAt = new Date().toISOString();
        const { error } = await db
          .from("ai_chat_conversations")
          .update({ title, updated_at: updatedAt })
          .eq("id", conversationId);
        if (!error) {
          setConversations((prev) => prev.map((item) =>
            item.id === conversationId ? { ...item, title, updated_at: updatedAt } : item,
          ));
        }
      }
      return conversationId;
    }

    const { data, error } = await db
      .from("ai_chat_conversations")
      .insert({ title })
      .select("id,title,created_at,updated_at")
      .single();

    if (error) throw error;
    const created = data as ConversationSummary;
    setConversationId(created.id);
    setConversations((prev) => [created, ...prev.filter((item) => item.id !== created.id)].slice(0, 12));
    return created.id;
  };

  const persistMessage = async (id: string | null, message: Msg) => {
    if (!id || !message.content.trim()) return;
    const { error } = await db
      .from("ai_chat_messages")
      .insert({ conversation_id: id, role: message.role, content: message.content });
    if (error) throw error;
  };

  const touchConversation = async (id: string | null) => {
    if (!id) return;
    const updatedAt = new Date().toISOString();
    const { error } = await db
      .from("ai_chat_conversations")
      .update({ updated_at: updatedAt })
      .eq("id", id);
    if (error) throw error;
    setConversations((prev) => {
      const current = prev.find((item) => item.id === id);
      if (!current) return prev;
      const updated = { ...current, updated_at: updatedAt };
      return [updated, ...prev.filter((item) => item.id !== id)].slice(0, 12);
    });
  };

  const startNewConversation = async () => {
    if (isLoading) return;
    try {
      const { data, error } = await db
        .from("ai_chat_conversations")
        .insert({ title: null })
        .select("id,title,created_at,updated_at")
        .single();
      if (error) throw error;

      const created = data as ConversationSummary;
      setConversationId(created.id);
      setConversations((prev) => [created, ...prev.filter((item) => item.id !== created.id)].slice(0, 12));
      setMessages([]);
      setInput("");
      setFollowUps([]);
      setShowHistory(false);
      autoSentRef.current = null;
      toast.success("Nova conversa iniciada");
    } catch (error) {
      console.error("financial chat new conversation error:", error);
      toast.error("Não foi possível iniciar uma nova conversa.");
    }
  };

  const openConversation = async (id: string) => {
    if (isLoading || id === conversationId) {
      setShowHistory(false);
      return;
    }
    try {
      await loadConversationMessages(id);
    } catch (error) {
      console.error("financial chat load conversation error:", error);
      toast.error("Não foi possível abrir essa conversa.");
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void restoreHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, followUps]);

  // Auto-envia prompt inicial vindo via query string (ex.: card "Previsto fim do mês")
  // Só dispara depois que o histórico foi restaurado, evitando sobrescrever a conversa salva.
  useEffect(() => {
    if (!mounted || !historyReady) return;
    if (!initialPrompt) return;
    if (autoSentRef.current === initialPrompt) return;
    autoSentRef.current = initialPrompt;
    send(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, mounted, historyReady]);

  const fetchFollowUps = async (convo: Msg[]) => {
    setLoadingFollowUps(true);
    try {
      const authHeaders = await getAuthHeaders();
      const resp = await fetch(`${CHAT_URL}?mode=suggestions`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ messages: convo.slice(-6) }),
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
    if (!messageText || isLoading || !historyReady) return;

    const userMsg: Msg = { role: "user", content: messageText };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setFollowUps([]);

    let activeConversationId = conversationId;
    try {
      activeConversationId = await ensureConversation(messageText);
      await persistMessage(activeConversationId, userMsg);
      await touchConversation(activeConversationId);
    } catch (error) {
      console.error("financial chat history save error:", error);
      toast.error("A conversa continua, mas não consegui salvar esta mensagem no histórico.");
    }

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
      const authHeaders = await getAuthHeaders();
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ messages: newMessages.slice(-MAX_CONTEXT_MESSAGES) }),
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

    if (assistantSoFar.trim()) {
      const assistantMsg: Msg = { role: "assistant", content: assistantSoFar };
      try {
        await persistMessage(activeConversationId, assistantMsg);
        await touchConversation(activeConversationId);
      } catch (error) {
        console.error("financial chat assistant history save error:", error);
      }

      const finalConvo: Msg[] = [...newMessages, assistantMsg];
      void fetchFollowUps(finalConvo);
    }
  };

  return (
    <div className="rounded-2xl bg-card border border-border/50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/50 bg-gradient-to-r from-primary/10 via-violet-500/5 to-transparent">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500 shadow-lg shadow-primary/20">
          <Bot className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            Assistente Financeiro
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </h2>
          <p className="text-[10px] text-emerald-400 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Online — histórico salvo automaticamente
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            disabled={!historyReady || isLoading}
            aria-label="Abrir histórico de conversas"
            title="Histórico"
            className={cn(
              "interactive-button flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40",
              showHistory && "bg-accent text-foreground",
            )}
          >
            <History className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void startNewConversation()}
            disabled={!historyReady || isLoading}
            aria-label="Iniciar nova conversa"
            title="Nova conversa"
            className="interactive-button flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="border-b border-border/50 bg-background/60 p-3 animate-fade-in">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-foreground">Conversas recentes</span>
            <span className="text-[10px] text-muted-foreground">salvas na sua conta</span>
          </div>
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma conversa salva ainda.</p>
          ) : (
            <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
              {conversations.map((conversation) => (
                <button
                  type="button"
                  key={conversation.id}
                  onClick={() => void openConversation(conversation.id)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                    conversation.id === conversationId
                      ? "border-primary/40 bg-primary/10"
                      : "border-border/60 bg-card hover:bg-accent/50",
                  )}
                >
                  <div className="truncate text-xs font-medium text-foreground">
                    {conversation.title || "Nova conversa"}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {formatConversationDate(conversation.updated_at)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 max-h-[520px] min-h-[300px]">
        {!historyReady && (
          <div className="flex min-h-[220px] items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando sua conversa...
          </div>
        )}

        {historyReady && messages.length === 0 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-accent/60 to-accent/25 px-4 py-3 max-w-[96%]">
              <p className="text-sm leading-6 text-foreground">
                Olá! 👋 Sou seu assistente financeiro. Posso analisar seus gastos, sugerir economias e te ajudar a alcançar suas metas. Como posso ajudar hoje?
              </p>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                Sugestões rápidas
              </div>
              <div className="flex flex-wrap gap-2">
                {activeSuggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={isLoading}
                    className="interactive-button rounded-xl border border-border bg-card px-3 py-2 text-left text-xs leading-4 text-foreground transition-colors duration-200 hover:bg-accent disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {historyReady && messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "rounded-2xl text-sm animate-fade-in",
              msg.role === "assistant"
                ? "max-w-[97%] self-start border border-border/50 bg-gradient-to-br from-accent/65 via-accent/45 to-background/40 px-4 py-3 text-foreground shadow-sm"
                : "max-w-[88%] self-end ml-auto bg-primary px-4 py-2.5 text-primary-foreground",
            )}
          >
            {msg.role === "assistant" ? (
              <div className="max-w-none text-sm leading-6">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className="mb-2 mt-1 text-base font-bold text-primary">{children}</h1>,
                    h2: ({ children }) => <h2 className="mb-2 mt-3 text-[15px] font-bold text-primary first:mt-0">{children}</h2>,
                    h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold text-emerald-400 first:mt-0">{children}</h3>,
                    p: ({ children }) => <p className="my-2 leading-6 first:mt-0 last:mb-0">{children}</p>,
                    ul: ({ children }) => <CompactAssistantList>{children}</CompactAssistantList>,
                    ol: ({ children }) => <CompactAssistantList ordered>{children}</CompactAssistantList>,
                    li: ({ children }) => (
                      <li className={cn(
                        "list-none rounded-xl border px-2.5 py-2 text-[13px] leading-5",
                        assistantListTone(assistantNodeText(children)),
                      )}>
                        {children}
                      </li>
                    ),
                    strong: ({ children }) => {
                      const value = assistantNodeText(children).trim();
                      const isStandaloneAmount = /^(?:total[^:]{0,40}:\s*)?[-+]?R\$/i.test(value);
                      return (
                        <strong className={cn("font-semibold", isStandaloneAmount ? "text-primary" : "text-inherit")}>
                          {children}
                        </strong>
                      );
                    },
                    code: ({ children }) => (
                      <code className="mx-0.5 inline-flex rounded-md border border-border/60 bg-background/65 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {children}
                      </code>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="my-3 rounded-r-xl border-l-2 border-amber-400 bg-amber-400/10 px-3 py-2 text-foreground">
                        {children}
                      </blockquote>
                    ),
                    hr: () => <hr className="my-3 border-border/70" />,
                  }}
                >
                  {msg.content || "..."}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="leading-5">{msg.content}</p>
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
              <div className="flex flex-wrap gap-2">
                <div className="h-7 w-28 rounded-full bg-accent/40 animate-pulse" />
                <div className="h-7 w-32 rounded-full bg-accent/40 animate-pulse" />
                <div className="h-7 w-24 rounded-full bg-accent/40 animate-pulse" />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {followUps.map((s, i) => (
                  <button
                    key={`${i}-${s}`}
                    onClick={() => send(s)}
                    className="interactive-button rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs leading-4 text-foreground transition-colors duration-200 hover:bg-primary/10 hover:border-primary/50"
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
          disabled={isLoading || !historyReady}
          className="flex-1 rounded-xl bg-accent/40 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        <button
          onClick={() => send()}
          disabled={isLoading || !historyReady || !input.trim()}
          className="interactive-button flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
