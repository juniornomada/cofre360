import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `Você é um assistente pessoal de finanças do app Cofre 360, especializado em ajudar o usuário a controlar suas finanças pessoais em português brasileiro.

Seu papel:
- Analisar dados financeiros reais do usuário (receitas, despesas, categorias, cartões, contas, metas, orçamentos).
- Dar dicas práticas, orientações claras e sugestões acionáveis de economia, organização e investimento.
- Responder de forma calorosa, motivadora e objetiva — como um consultor financeiro próximo e empático.
- Usar valores em R$ formatados (ex.: R$ 1.234,56) e emojis com moderação para deixar a conversa leve.
- Quando faltar dado, oriente o usuário a cadastrar (ex.: "Cadastre suas receitas para ter uma visão completa").
- Sempre que possível use markdown leve: **negrito**, listas, e títulos curtos.
- Nunca invente números: trabalhe SEMPRE com os dados de contexto fornecidos abaixo.
- Mantenha respostas concisas (máx ~6 parágrafos curtos) a menos que o usuário peça detalhe.

PRIORIDADE — Saúde do "Saldo previsto fim do mês":
- Quando o usuário perguntar sobre saldo previsto, projeção do mês ou saúde financeira, foque em manter esse saldo POSITIVO e SAUDÁVEL.
- Sempre cruze: receitas previstas vs despesas previstas, orçamentos por categoria (ULTRAPASSADO ou perto disso), categorias com maior gasto, gastos aleatórios/supérfluos.
- Aponte 2-3 RISCOS específicos com valores em R$ (ex.: "Alimentação já consumiu 92% do orçamento — R$ 1.250 de R$ 1.350").
- Sugira AÇÕES diretas e numéricas (ex.: "Reduza pedidos de delivery em R$ 200 esta semana", "Evite novos gastos com lazer até o dia 30").
- Se o saldo previsto estiver NEGATIVO, alerte com 🚨 e proponha um plano de corte por categoria para zerar o déficit.
- Se estiver POSITIVO mas apertado, sugira reforço de meta/poupança com valor sugerido.
- Frases-modelo permitidas: "Cuidado com gastos aleatórios que já somam R$ X", "Evite pedir comida, seu orçamento de Alimentação já atingiu o limite", "Reduza gasto com X para manter sua conta saudável".`;

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SHORT_MONTHS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const FULL_MONTHS = ["janeiro","fevereiro","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const MONTH_NAMES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function parseTxDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return null;
  const day = parseInt(parts[0], 10);
  const monthIdx = SHORT_MONTHS.indexOf(parts[1]);
  if (isNaN(day) || monthIdx < 0) return null;
  return new Date(new Date().getFullYear(), monthIdx, day);
}

const normTxt = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

interface PeriodFilter {
  start: Date;
  end: Date;
  label: string;
}

/**
 * Detecta período em linguagem natural na última mensagem do usuário.
 * Ex.: "abril do dia 01 até 17", "01/04 a 17/04", "em março", "últimos 7 dias".
 */
function detectPeriod(text: string): PeriodFilter | null {
  if (!text) return null;
  const t = normTxt(text);
  const year = new Date().getFullYear();

  // dd/mm a dd/mm
  const rangeNumeric = t.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-]\d{2,4})?\s*(?:a|ate|-|até)\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-]\d{2,4})?/);
  if (rangeNumeric) {
    const [, d1, m1, d2, m2] = rangeNumeric;
    return {
      start: new Date(year, parseInt(m1) - 1, parseInt(d1)),
      end: new Date(year, parseInt(m2) - 1, parseInt(d2), 23, 59, 59),
      label: `${d1}/${m1} a ${d2}/${m2}`,
    };
  }

  // "do dia X ao/até dia Y de <mês>" ou "<mês> do dia X até Y"
  const monthRegex = FULL_MONTHS.join("|") + "|" + SHORT_MONTHS.join("|");
  const rangeWithMonth = t.match(new RegExp(`(?:dia\\s+)?(\\d{1,2})\\s*(?:a|ate|-|até|ao)\\s*(?:dia\\s+)?(\\d{1,2})\\s*(?:de\\s+)?(${monthRegex})`));
  const monthThenRange = t.match(new RegExp(`(${monthRegex})[^\\d]*(?:dia\\s+)?(\\d{1,2})\\s*(?:a|ate|-|até|ao)\\s*(?:dia\\s+)?(\\d{1,2})`));
  let m: { d1: number; d2: number; mon: string } | null = null;
  if (rangeWithMonth) m = { d1: parseInt(rangeWithMonth[1]), d2: parseInt(rangeWithMonth[2]), mon: rangeWithMonth[3] };
  else if (monthThenRange) m = { d1: parseInt(monthThenRange[2]), d2: parseInt(monthThenRange[3]), mon: monthThenRange[1] };
  if (m) {
    let idx = FULL_MONTHS.indexOf(m.mon);
    if (idx < 0) idx = SHORT_MONTHS.indexOf(m.mon);
    if (idx >= 0) {
      return {
        start: new Date(year, idx, m.d1),
        end: new Date(year, idx, m.d2, 23, 59, 59),
        label: `${m.d1} a ${m.d2} de ${MONTH_NAMES_PT[idx]}`,
      };
    }
  }

  // "últimos N dias"
  const lastN = t.match(/ultim[oa]s?\s+(\d+)\s+dias?/);
  if (lastN) {
    const n = parseInt(lastN[1]);
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - n);
    return { start, end, label: `últimos ${n} dias` };
  }

  // "em <mês>" ou nome de mês isolado
  for (let i = 0; i < FULL_MONTHS.length; i++) {
    const re = new RegExp(`\\b(${FULL_MONTHS[i]}|${SHORT_MONTHS[i]})\\b`);
    if (re.test(t)) {
      return {
        start: new Date(year, i, 1),
        end: new Date(year, i + 1, 0, 23, 59, 59),
        label: MONTH_NAMES_PT[i],
      };
    }
  }

  return null;
}

// Stop-words que não devem virar termo de busca
const STOP_WORDS = new Set([
  "quanto","gastei","gasto","gastos","com","de","do","da","dos","das","em","no","na","nos","nas",
  "o","a","os","as","um","uma","uns","umas","esse","essa","esses","essas","este","esta","isto","aquilo",
  "mes","mês","ano","semana","dia","hoje","ontem","passado","atual","ultimo","ultima","ultimos","ultimas",
  "qual","quais","meu","minha","meus","minhas","seu","sua","quanto","muito","pouco",
  "para","por","que","tem","ter","foi","sao","são","e","ou","mas","entre","ate","até",
  "categoria","subcategoria","despesa","despesas","receita","receitas","transacao","transacoes","transação","transações",
  "lance","lancar","lançar","registra","registrar","analise","análise","analisar","mostre","mostrar","ver","veja",
  "janeiro","fevereiro","marco","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro",
  "jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez",
]);

function extractKeywords(text: string): string[] {
  const t = normTxt(text);
  // remove números/datas
  const cleaned = t.replace(/[\d\/\-\.]+/g, " ");
  const tokens = cleaned.split(/[^a-z]+/).filter(Boolean);
  const kws: string[] = [];
  for (const tok of tokens) {
    if (tok.length < 4) continue;
    if (STOP_WORDS.has(tok)) continue;
    if (kws.includes(tok)) continue;
    kws.push(tok);
  }
  return kws.slice(0, 5);
}

interface KeywordMatch {
  keyword: string;
  curMonthTotal: number;
  prevMonthTotal: number;
  curCount: number;
  prevCount: number;
  inPeriodTotal: number;
  inPeriodCount: number;
  topTx: any[]; // top transações do mês atual
}

function matchTx(tx: any, kw: string): boolean {
  const name = normTxt(String(tx.name || ""));
  const cat = normTxt(String(tx.category || ""));
  return name.includes(kw) || cat.includes(kw);
}

function buildKeywordSection(
  transactions: any[],
  keywords: string[],
  curMonth: number,
  prevMonth: number,
  period?: PeriodFilter | null,
): string {
  if (!keywords.length) return "";

  const matches: KeywordMatch[] = keywords.map((kw) => {
    const filtered = transactions.filter((t) => t.type === "expense" && matchTx(t, kw));
    const cur = filtered.filter((t) => {
      const d = parseTxDate(t.date);
      return d && d.getMonth() === curMonth;
    });
    const prev = filtered.filter((t) => {
      const d = parseTxDate(t.date);
      return d && d.getMonth() === prevMonth;
    });
    const inPeriod = period
      ? filtered.filter((t) => {
          const d = parseTxDate(t.date);
          return d && d >= period.start && d <= period.end;
        })
      : [];
    return {
      keyword: kw,
      curMonthTotal: cur.reduce((s, t) => s + Number(t.amount), 0),
      prevMonthTotal: prev.reduce((s, t) => s + Number(t.amount), 0),
      curCount: cur.length,
      prevCount: prev.length,
      inPeriodTotal: inPeriod.reduce((s, t) => s + Number(t.amount), 0),
      inPeriodCount: inPeriod.length,
      topTx: cur.slice(0, 10),
    };
  });

  // Mantém só keywords com pelo menos 1 match em algum período
  const useful = matches.filter(
    (m) => m.curCount > 0 || m.prevCount > 0 || m.inPeriodCount > 0,
  );
  if (!useful.length) {
    return `\n\n### 🔍 Busca inteligente
Nenhuma transação encontrada para: ${keywords.join(", ")}.`;
  }

  const sections = useful.map((m) => {
    let variation = "";
    if (m.prevMonthTotal > 0) {
      const diff = m.curMonthTotal - m.prevMonthTotal;
      const pct = Math.round((diff / m.prevMonthTotal) * 100);
      variation = diff >= 0
        ? `${pct}% a MAIS que mês passado (R$ ${formatBRL(m.prevMonthTotal)})`
        : `${Math.abs(pct)}% a MENOS que mês passado (R$ ${formatBRL(m.prevMonthTotal)})`;
    } else if (m.curMonthTotal > 0) {
      variation = "sem registros no mês passado para comparar";
    }

    const txList = m.topTx
      .map((t) => `  - ${t.date} | R$ ${formatBRL(Number(t.amount))} | ${t.name} | ${t.category}`)
      .join("\n");

    const periodLine = period
      ? `\n- No período "${period.label}": R$ ${formatBRL(m.inPeriodTotal)} (${m.inPeriodCount} transações)`
      : "";

    return `**"${m.keyword}"**
- Mês atual: R$ ${formatBRL(m.curMonthTotal)} (${m.curCount} transações)
- Mês passado: R$ ${formatBRL(m.prevMonthTotal)} (${m.prevCount} transações)
- Comparação: ${variation || "(sem dados)"}${periodLine}
- Transações do mês atual:
${txList || "  (nenhuma)"}`;
  });

  return `\n\n### 🔍 Busca inteligente por palavras-chave
${sections.join("\n\n")}`;
}

function buildPeriodSection(transactions: any[], period: PeriodFilter): string {
  const inRange = transactions.filter((t) => {
    const d = parseTxDate(t.date);
    return d && d >= period.start && d <= period.end;
  });

  const income = inRange.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = inRange.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

  const catMap: Record<string, number> = {};
  for (const t of inRange) {
    if (t.type !== "expense") continue;
    const cat = String(t.category || "Outros");
    // Conta no nome principal e na subcategoria (se houver)
    const parts = cat.split(">").map((p) => p.trim()).filter(Boolean);
    for (const p of parts) catMap[p] = (catMap[p] || 0) + Number(t.amount);
  }
  const catLines = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `- ${c}: R$ ${formatBRL(v)}`)
    .join("\n");

  const txLines = inRange
    .slice(0, 50)
    .map((t) => `- ${t.date} | ${t.type === "expense" ? "−" : "+"}R$ ${formatBRL(Number(t.amount))} | ${t.name} | ${t.category}`)
    .join("\n");

  return `\n\n### 🔎 Filtro detectado: ${period.label} (${inRange.length} transações)
- Receitas no período: R$ ${formatBRL(income)}
- Despesas no período: R$ ${formatBRL(expense)}
- Saldo do período: R$ ${formatBRL(income - expense)}

#### Gastos por categoria/subcategoria no período
${catLines || "(sem despesas no período)"}

#### Transações do período (até 50)
${txLines || "(nenhuma transação encontrada)"}`;
}

async function buildFinancialContext(supabase: any, periodHint?: string): Promise<string> {
  const [txRes, accRes, cardsRes, goalsRes, budgetsRes] = await Promise.all([
    supabase.from("transactions").select("*"),
    supabase.from("bank_accounts").select("*"),
    supabase.from("cards").select("*"),
    supabase.from("goals").select("*"),
    supabase.from("budget_categories").select("*"),
  ]);

  const transactions = (txRes.data || []) as any[];
  const accounts = (accRes.data || []) as any[];
  const cards = (cardsRes.data || []) as any[];
  const goals = (goalsRes.data || []) as any[];
  const budgets = (budgetsRes.data || []) as any[];

  const now = new Date();
  const currentMonth = now.getMonth();
  const prevMonth = (currentMonth - 1 + 12) % 12;

  const curTx = transactions.filter((t) => {
    const d = parseTxDate(t.date);
    return d && d.getMonth() === currentMonth;
  });
  const prevTx = transactions.filter((t) => {
    const d = parseTxDate(t.date);
    return d && d.getMonth() === prevMonth;
  });

  const curIncome = curTx.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const curExpense = curTx.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const prevIncome = prevTx.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const prevExpense = prevTx.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

  const catMap: Record<string, number> = {};
  for (const t of curTx) {
    if (t.type !== "expense") continue;
    const cat = String(t.category || "Outros").split(">")[0].trim();
    catMap[cat] = (catMap[cat] || 0) + Number(t.amount);
  }
  const topCats = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([c, v]) => `- ${c}: R$ ${formatBRL(v)}`)
    .join("\n");

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);
  const accLines = accounts
    .map((a) => `- ${a.name}: R$ ${formatBRL(Number(a.balance))}`)
    .join("\n");

  const cardLines = cards
    .map((c) => `- ${c.name} (••${c.last_four}): usado R$ ${formatBRL(Number(c.used))} de R$ ${formatBRL(Number(c.card_limit))}`)
    .join("\n");

  const goalLines = goals
    .map((g) => `- ${g.name}: R$ ${formatBRL(Number(g.current_amount))} / R$ ${formatBRL(Number(g.target_amount))}`)
    .join("\n");

  // Calcula o gasto real por orçamento cruzando com transações do mês atual.
  // Faz match com categoria principal OU subcategoria (formato "Principal > Sub").
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const budgetLines = budgets
    .map((b) => {
      const target = norm(String(b.category));
      const realSpent = curTx
        .filter((t) => t.type === "expense")
        .filter((t) => {
          const cat = String(t.category || "");
          const parts = cat.split(">").map((p) => norm(p));
          return parts.includes(target);
        })
        .reduce((s, t) => s + Number(t.amount), 0);
      const limit = Number(b.budget_limit);
      const pct = limit > 0 ? Math.round((realSpent / limit) * 100) : 0;
      const status = limit > 0 && realSpent > limit ? " ⚠️ ULTRAPASSADO" : "";
      return `- ${b.category}: gasto R$ ${formatBRL(realSpent)} de R$ ${formatBRL(limit)} (${pct}%)${status}`;
    })
    .join("\n");

  const monthName = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][currentMonth];

  return `## Dados financeiros do usuário (${monthName}/${now.getFullYear()})

### Resumo do mês atual
- Receitas: R$ ${formatBRL(curIncome)}
- Despesas: R$ ${formatBRL(curExpense)}
- Saldo do mês: R$ ${formatBRL(curIncome - curExpense)}

### Mês anterior (comparação)
- Receitas: R$ ${formatBRL(prevIncome)}
- Despesas: R$ ${formatBRL(prevExpense)}

### Saldo total nas contas: R$ ${formatBRL(totalBalance)}

### Contas
${accLines || "(nenhuma cadastrada)"}

### Cartões de crédito
${cardLines || "(nenhum cadastrado)"}

### Top categorias de gasto este mês
${topCats || "(sem despesas)"}

### Orçamentos
${budgetLines || "(nenhum cadastrado)"}

### Metas financeiras
${goalLines || "(nenhuma cadastrada)"}

### Total de transações registradas: ${transactions.length}${
    periodHint ? (() => {
      const p = detectPeriod(periodHint);
      return p ? buildPeriodSection(transactions, p) : "";
    })() : ""
  }${
    periodHint ? (() => {
      const kws = extractKeywords(periodHint);
      const p = detectPeriod(periodHint);
      return buildKeywordSection(transactions, kws, currentMonth, prevMonth, p);
    })() : ""
  }`;
}

async function generateSuggestions(
  apiKey: string,
  messages: ChatMessage[],
): Promise<string[]> {
  const recent = messages.slice(-4)
    .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content.slice(0, 500)}`)
    .join("\n\n");

  const prompt = `Você é um gerador de perguntas de follow-up para um assistente financeiro pessoal em português brasileiro.

Com base na conversa abaixo, gere EXATAMENTE 3 perguntas curtas (máximo 8 palavras cada) que o usuário PROVAVELMENTE faria a seguir, relacionadas ao tema discutido. As perguntas devem ser práticas, específicas e diretamente conectadas ao contexto da última resposta.

Responda APENAS com um JSON válido no formato: {"suggestions": ["pergunta 1", "pergunta 2", "pergunta 3"]}

Conversa recente:
${recent}`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const arr = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    return arr.filter((s: any) => typeof s === "string" && s.trim()).slice(0, 3);
  } catch (e) {
    console.error("suggestions error:", e);
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode");
    const { messages } = (await req.json()) as { messages: ChatMessage[] };
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Require an authenticated caller. Build a per-user Supabase client (RLS-scoped).
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "suggestions") {
      const suggestions = await generateSuggestions(LOVABLE_API_KEY, messages);
      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const context = await buildFinancialContext(supabase, lastUser);

    const fullSystem = `${SYSTEM_PROMPT}

REGRA DE PERÍODO: Quando houver a seção "🔎 Filtro detectado" no contexto, responda EXCLUSIVAMENTE com base nos dados desse período. NUNCA misture transações de outros meses ou datas fora do intervalo informado. Cite o período no início da resposta (ex.: "No período de 1 a 17 de abril...").

REGRA DE BUSCA INTELIGENTE: Quando houver a seção "🔍 Busca inteligente por palavras-chave" no contexto, use SEMPRE esses números pré-calculados como fonte da verdade. Para perguntas tipo "quanto gastei com X?":
1. Use o total do mês atual da palavra-chave detectada.
2. Inclua a comparação com o mês passado já calculada (X% a mais/menos).
3. Se houver período no filtro, priorize o valor "No período".
4. Liste 2-3 transações reais como exemplo, se útil.
5. Se "Nenhuma transação encontrada", diga claramente e sugira cadastrar.

${context}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: fullSystem }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Muitas requisições. Aguarde alguns segundos e tente novamente." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos esgotados. Adicione fundos ao workspace para continuar." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("financial-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
