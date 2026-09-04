import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PROD_ORIGIN = "https://cofre360.vercel.app";
const ALLOWED_ORIGINS = new Set([
  PROD_ORIGIN,
  "https://cofre360.lovable.app",
  "https://id-preview--8755cbe4-fc00-44b3-810a-824346dac2f8.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function buildCors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : PROD_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, x-client-info, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Expose-Headers": "content-type",
    "Vary": "Origin",
  };
}

type ChatMessage = { role: "user" | "assistant"; content: string };
type Transaction = {
  id?: string;
  name?: string | null;
  category?: string | null;
  date?: string | null;
  purchase_date?: string | null;
  amount?: number | null;
  type?: string | null;
  card?: string | null;
  bank_account_id?: string | null;
  installment_group_id?: string | null;
  installment_number?: number | null;
  total_installments?: number | null;
  installment_source_amount?: number | null;
  is_visible?: boolean | null;
  created_at?: string | null;
};

type EconomicExpense = {
  name: string;
  category: string;
  amount: number;
  date: Date;
};

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_FULL = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTHS_LABEL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const norm = (value: string | null | undefined) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

function formatBRL(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function brNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

function parseTxDate(value: string | null | undefined, createdAt?: string | null): Date | null {
  if (!value) return null;
  const text = value.trim().toLowerCase();

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmy = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
  }

  const parts = text.split(/\s+/);
  if (parts.length >= 2) {
    const day = Number(parts[0]);
    const month = MONTHS_SHORT.indexOf(parts[1].slice(0, 3));
    if (Number.isFinite(day) && month >= 0) {
      const refYear = createdAt ? new Date(createdAt).getFullYear() : brNow().getFullYear();
      const year = parts[2] && /^\d{4}$/.test(parts[2]) ? Number(parts[2]) : refYear;
      return new Date(year, month, day);
    }
  }

  return null;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function rootCategory(category: string | null | undefined) {
  return String(category || "Outros").split(">")[0]?.trim() || "Outros";
}

function isTransferOrCardPayment(category: string | null | undefined) {
  const root = norm(rootCategory(category));
  return root === "transferencia" ||
    root === "transferencias" ||
    root === "pagamento de cartao" ||
    root === "pagamento do cartao" ||
    root === "pagamento cartao";
}

function shiftMonths(date: Date, delta: number) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setMonth(result.getMonth() + delta);
  return result;
}

function collapseEconomicExpenses(rows: Transaction[]): EconomicExpense[] {
  const visibleExpenses = rows.filter((tx) =>
    tx.is_visible !== false && tx.type === "expense" && !isTransferOrCardPayment(tx.category),
  );

  const output: EconomicExpense[] = [];
  const groups = new Map<string, Transaction[]>();

  for (const tx of visibleExpenses) {
    const total = Number(tx.total_installments || 1);
    if (tx.card && tx.installment_group_id && total > 1) {
      const group = groups.get(tx.installment_group_id) || [];
      group.push(tx);
      groups.set(tx.installment_group_id, group);
      continue;
    }

    const date = parseTxDate(tx.purchase_date || tx.date, tx.created_at);
    if (!date) continue;
    output.push({
      name: String(tx.name || "Transação"),
      category: String(tx.category || "Outros"),
      amount: Number(tx.amount || 0),
      date,
    });
  }

  for (const group of groups.values()) {
    const ordered = [...group].sort(
      (a, b) => Number(a.installment_number || 1) - Number(b.installment_number || 1),
    );
    const first = ordered[0];
    const sourceAmount = ordered.find((tx) => Number(tx.installment_source_amount || 0) > 0)?.installment_source_amount;
    const totalInstallments = Math.max(1, Number(first.total_installments || ordered.length || 1));
    const loadedSum = ordered.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const amount = Number(sourceAmount || 0) > 0
      ? Number(sourceAmount)
      : ordered.length >= totalInstallments
        ? loadedSum
        : Number(first.amount || 0) * totalInstallments;

    let date = ordered
      .map((tx) => parseTxDate(tx.purchase_date, tx.created_at))
      .find((d): d is Date => !!d) || null;

    if (!date) {
      const installmentDate = parseTxDate(first.date, first.created_at);
      if (installmentDate) {
        date = shiftMonths(installmentDate, -(Math.max(1, Number(first.installment_number || 1)) - 1));
      }
    }
    if (!date) continue;

    output.push({
      name: String(first.name || "Transação parcelada"),
      category: String(first.category || "Outros"),
      amount,
      date,
    });
  }

  return output;
}

function categoryTotals(rows: EconomicExpense[], key: string) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (monthKey(row.date) !== key) continue;
    const category = rootCategory(row.category);
    totals.set(category, (totals.get(category) || 0) + row.amount);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

const STOP_WORDS = new Set([
  "quanto", "gastei", "gasto", "gastos", "com", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
  "esse", "essa", "este", "esta", "mes", "ano", "semana", "dia", "hoje", "ontem", "passado", "atual", "ultimo", "ultima",
  "qual", "quais", "meu", "minha", "meus", "minhas", "para", "por", "que", "tem", "ter", "foi", "sao", "entre", "ate",
  "categoria", "subcategoria", "despesa", "despesas", "receita", "receitas", "transacao", "transacoes", "comparativo", "comparar",
  ...MONTHS_FULL, ...MONTHS_SHORT,
]);

function extractKeywords(question: string) {
  return norm(question)
    .replace(/[\d/\-.]+/g, " ")
    .split(/[^a-z]+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
    .filter((token, index, arr) => arr.indexOf(token) === index)
    .slice(0, 5);
}

function keywordSection(expenses: EconomicExpense[], question: string, currentKey: string, previousKey: string) {
  const keywords = extractKeywords(question);
  if (!keywords.length) return "";

  const lines: string[] = [];
  for (const keyword of keywords) {
    const matches = expenses.filter((row) =>
      norm(row.name).includes(keyword) || norm(row.category).includes(keyword),
    );
    if (!matches.length) continue;
    const current = matches
      .filter((row) => monthKey(row.date) === currentKey)
      .reduce((sum, row) => sum + row.amount, 0);
    const previous = matches
      .filter((row) => monthKey(row.date) === previousKey)
      .reduce((sum, row) => sum + row.amount, 0);
    lines.push(`- ${keyword}: mês atual R$ ${formatBRL(current)} | mês anterior R$ ${formatBRL(previous)}`);
  }
  return lines.length ? `\n### Busca específica pela pergunta\n${lines.join("\n")}` : "";
}

function requestedMonth(question: string, now: Date) {
  const text = norm(question);
  if (/mes\s+(passado|anterior)/.test(text)) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { key: monthKey(d), label: `${MONTHS_LABEL[d.getMonth()]}/${d.getFullYear()}` };
  }
  for (let i = 0; i < MONTHS_FULL.length; i++) {
    if (new RegExp(`\\b(${MONTHS_FULL[i]}|${MONTHS_SHORT[i]})\\b`).test(text)) {
      return { key: `${now.getFullYear()}-${String(i + 1).padStart(2, "0")}`, label: `${MONTHS_LABEL[i]}/${now.getFullYear()}` };
    }
  }
  return null;
}

async function buildFinancialContext(supabase: any, question: string) {
  const [txRes, accRes, cardsRes, goalsRes, budgetsRes] = await Promise.all([
    supabase.from("transactions").select("id,name,category,date,purchase_date,amount,type,card,bank_account_id,installment_group_id,installment_number,total_installments,installment_source_amount,is_visible,created_at"),
    supabase.from("bank_accounts").select("id,name,balance,is_visible"),
    supabase.from("cards").select("name,used,card_limit,is_visible"),
    supabase.from("goals").select("name,current_amount,target_amount"),
    supabase.from("budget_categories").select("category,budget_limit"),
  ]);

  if (txRes.error) throw txRes.error;
  if (accRes.error) throw accRes.error;
  if (cardsRes.error) throw cardsRes.error;

  const transactions = (txRes.data || []) as Transaction[];
  const accounts = accRes.data || [];
  const cards = cardsRes.data || [];
  const goals = goalsRes.data || [];
  const budgets = budgetsRes.data || [];
  const expenses = collapseEconomicExpenses(transactions);

  const now = brNow();
  const currentKey = monthKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousKey = monthKey(previousDate);
  const currentCategories = categoryTotals(expenses, currentKey);
  const previousCategories = categoryTotals(expenses, previousKey);
  const currentExpense = currentCategories.reduce((sum, [, value]) => sum + value, 0);
  const previousExpense = previousCategories.reduce((sum, [, value]) => sum + value, 0);

  const rawIncomeForKey = (key: string) => transactions
    .filter((tx) => tx.is_visible !== false && tx.type === "income" && !isTransferOrCardPayment(tx.category))
    .filter((tx) => {
      const date = parseTxDate(tx.date, tx.created_at);
      return date && monthKey(date) === key;
    })
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const currentIncome = rawIncomeForKey(currentKey);
  const previousIncome = rawIncomeForKey(previousKey);

  const accountMovement = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.is_visible === false || !tx.bank_account_id || tx.card) continue;
    const signed = tx.type === "income" ? Number(tx.amount || 0) : -Number(tx.amount || 0);
    accountMovement.set(tx.bank_account_id, (accountMovement.get(tx.bank_account_id) || 0) + signed);
  }
  const accountLines = accounts
    .filter((account: any) => account.is_visible !== false)
    .map((account: any) => {
      const balance = Number(account.balance || 0) + (accountMovement.get(account.id) || 0);
      return `- ${account.name}: R$ ${formatBRL(balance)}`;
    })
    .join("\n");

  const cardLines = cards
    .filter((card: any) => card.is_visible !== false)
    .map((card: any) => `- ${card.name}: usado R$ ${formatBRL(Number(card.used || 0))} de R$ ${formatBRL(Number(card.card_limit || 0))}`)
    .join("\n");

  const budgetLines = budgets.map((budget: any) => {
    const spent = currentCategories
      .filter(([category]) => norm(category) === norm(budget.category))
      .reduce((sum, [, value]) => sum + value, 0);
    const limit = Number(budget.budget_limit || 0);
    const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    return `- ${budget.category}: R$ ${formatBRL(spent)} de R$ ${formatBRL(limit)} (${pct}%)`;
  }).join("\n");

  const goalLines = goals.map((goal: any) =>
    `- ${goal.name}: R$ ${formatBRL(Number(goal.current_amount || 0))} / R$ ${formatBRL(Number(goal.target_amount || 0))}`,
  ).join("\n");

  const currentCategoryLines = currentCategories.slice(0, 15)
    .map(([category, amount]) => `- ${category}: R$ ${formatBRL(amount)}`)
    .join("\n");
  const previousCategoryLines = previousCategories.slice(0, 15)
    .map(([category, amount]) => `- ${category}: R$ ${formatBRL(amount)}`)
    .join("\n");

  const requested = requestedMonth(question, now);
  let requestedSection = "";
  if (requested && requested.key !== currentKey && requested.key !== previousKey) {
    const requestedCategories = categoryTotals(expenses, requested.key);
    const requestedTotal = requestedCategories.reduce((sum, [, value]) => sum + value, 0);
    requestedSection = `\n### Período solicitado: ${requested.label}\n- Despesas: R$ ${formatBRL(requestedTotal)}\n${requestedCategories.slice(0, 15).map(([c, v]) => `- ${c}: R$ ${formatBRL(v)}`).join("\n") || "(sem despesas)"}`;
  }

  const recentTransactions = [...transactions]
    .filter((tx) => tx.is_visible !== false)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 80)
    .map((tx) => `- ${tx.date || "sem data"} | ${tx.type === "income" ? "+" : "-"}R$ ${formatBRL(Number(tx.amount || 0))} | ${tx.name || "Transação"} | ${tx.category || "Outros"}`)
    .join("\n");

  return `## Dados financeiros reais do usuário
Data de referência: ${now.toLocaleDateString("pt-BR")}

### Mês atual — ${MONTHS_LABEL[now.getMonth()]}/${now.getFullYear()}
- Receitas: R$ ${formatBRL(currentIncome)}
- Gastos econômicos por categoria: R$ ${formatBRL(currentExpense)}
- Saldo receitas - gastos: R$ ${formatBRL(currentIncome - currentExpense)}

#### Gastos por categoria no mês atual
${currentCategoryLines || "(sem despesas)"}

### Mês anterior — ${MONTHS_LABEL[previousDate.getMonth()]}/${previousDate.getFullYear()}
- Receitas: R$ ${formatBRL(previousIncome)}
- Gastos econômicos por categoria: R$ ${formatBRL(previousExpense)}

#### Gastos por categoria no mês anterior
${previousCategoryLines || "(sem despesas)"}

### Contas — saldo calculado
${accountLines || "(nenhuma conta)"}

### Cartões
${cardLines || "(nenhum cartão)"}

### Orçamentos do mês atual
${budgetLines || "(nenhum orçamento)"}

### Metas
${goalLines || "(nenhuma meta)"}${requestedSection}${keywordSection(expenses, question, currentKey, previousKey)}

### Transações recentes (referência; parcelas permanecem mensais aqui)
${recentTransactions || "(nenhuma transação)"}`;
}

const SYSTEM_PROMPT = `Você é o Assistente Financeiro do Cofre360. Responda em português brasileiro, de forma objetiva e útil.

Regras obrigatórias:
- Use SOMENTE os dados financeiros fornecidos no contexto; nunca invente valores.
- Para perguntas de gasto por categoria, use os valores pré-calculados em "Gastos por categoria" ou "Busca específica pela pergunta".
- Gastos parcelados de cartão são consolidados economicamente no mês da compra nas seções de categoria; não some parcelas futuras de novo como novo gasto da categoria.
- Transferências entre contas e pagamentos de cartão não são novos gastos por categoria e foram excluídos desses totais.
- Diferencie gasto econômico de movimentação de caixa/fatura quando isso for relevante.
- Formate dinheiro em R$ e datas em dd/mm/aaaa quando citar datas.
- Se não houver dado suficiente, diga isso claramente.
- Mantenha a resposta concisa, normalmente até 6 parágrafos curtos.`;

async function generateSuggestions(apiKey: string, messages: ChatMessage[]) {
  const recent = messages.slice(-4).map((message) =>
    `${message.role === "user" ? "Usuário" : "Assistente"}: ${message.content.slice(0, 500)}`,
  ).join("\n");

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: `Gere exatamente 3 perguntas curtas de continuação, em português brasileiro, com base nesta conversa financeira. Responda somente JSON no formato {"suggestions":["...","...","..."]}.\n\n${recent}`,
        }],
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((item: unknown) => typeof item === "string").slice(0, 3)
      : [];
  } catch (error) {
    console.error("financial-chat suggestions error:", error);
    return [];
  }
}

serve(async (req) => {
  const corsHeaders = buildCors(req.headers.get("Origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("financial-chat missing server configuration");
      return new Response(JSON.stringify({ error: "Assistente indisponível por configuração do servidor" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      console.error("financial-chat invalid user session", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? body.messages as ChatMessage[] : [];
    if (!messages.length) {
      return new Response(JSON.stringify({ error: "Nenhuma mensagem enviada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    if (url.searchParams.get("mode") === "suggestions") {
      const suggestions = await generateSuggestions(LOVABLE_API_KEY, messages);
      return new Response(JSON.stringify({ suggestions }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const question = [...messages].reverse().find((message) => message.role === "user")?.content || "";
    const context = await buildFinancialContext(supabase, question);
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\n\n${context}` },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const gatewayBody = await response.text();
      console.error("financial-chat AI gateway error", response.status, gatewayBody);
      const status = response.status === 429 || response.status === 402 ? response.status : 502;
      const error = response.status === 429
        ? "Muitas requisições. Aguarde alguns segundos."
        : response.status === 402
          ? "Créditos do assistente esgotados."
          : "Erro no provedor de IA";
      return new Response(JSON.stringify({ error }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("financial-chat error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Erro desconhecido",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
