import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkFinancialAmounts, moneyBR, type MoneyCheck } from "./accuracy.ts";

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
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}


interface TestCase {
  id: string;
  name: string;
  query?: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  expectedKeywords: string[];
  forbiddenKeywords?: string[];
  category: string;
}

const TEST_SUITE: TestCase[] = [
  { id: "1", name: "Resumo financeiro atual", query: "Como estão minhas finanças este mês?", expectedKeywords: ["receitas", "despesas", "resultado", "R$"], category: "Resumo" },
  { id: "2", name: "Gasto total atual", query: "Qual foi o gasto total deste mês?", expectedKeywords: ["despesas", "total", "R$"], category: "Resumo" },
  { id: "3", name: "Categorias atuais", query: "Quais categorias tiveram mais gastos neste mês?", expectedKeywords: ["gastos por categoria", "compras realizadas", "R$"], category: "Categorias" },
  { id: "4", name: "Subcategorias de alimentação", query: "Como os gastos de Alimentação estão divididos por subcategoria neste mês?", expectedKeywords: ["alimentação", "subcategoria", "total", "R$"], category: "Categorias" },
  { id: "5", name: "Parcelas antigas exatas", query: "Quais parcelas de compras antigas foram cobradas neste mês?", expectedKeywords: ["parcelas de compras antigas", "total", "compra", "R$"], forbiddenKeywords: ["representa principalmente", "sugere parcelas", "calculado pela diferença"], category: "Parcelas" },
  { id: "6", name: "Receitas atuais", query: "Qual foi o total de receitas deste mês?", expectedKeywords: ["receitas", "total", "R$"], category: "Resumo" },
  { id: "7", name: "Comparação econômica", query: "Compare as compras realizadas neste mês com o mês passado.", expectedKeywords: ["comparativo", "compras realizadas", "diferença", "R$"], category: "Comparação" },
  { id: "8", name: "Conceito econômico x caixa", query: "Qual a diferença entre gasto econômico e movimentação financeira?", expectedKeywords: ["movimentação", "transferências", "pagamentos", "R$"], category: "Conceito" },
  { id: "9", name: "Follow-up contextual de alimentação", messages: [{ role: "user", content: "Quanto gastei com alimentação?" }, { role: "assistant", content: "Total de Alimentação informado." }, { role: "user", content: "Em quais categorias?" }], expectedKeywords: ["alimentação", "subcategoria", "total", "R$"], category: "Contexto" },
  { id: "10", name: "Follow-up detalhe de parcelas antigas", messages: [{ role: "user", content: "Quais categorias foram responsáveis pelas parcelas de compras antigas?" }, { role: "assistant", content: "Resumo das categorias informado." }, { role: "user", content: "detalhe" }], expectedKeywords: ["detalhe", "parcelas de compras antigas", "compra", "R$"], forbiddenKeywords: ["representa principalmente", "sugere parcelas"], category: "Contexto" },
  { id: "11", name: "Composição sem subtração indevida", query: "Quais foram as despesas que não entraram nos gastos por categoria?", expectedKeywords: ["composição", "parcelas de compras antigas", "importante", "R$"], forbiddenKeywords: ["provavelmente parcelas", "sugere parcelas"], category: "Reconciliação" },
];

async function runOne(test: TestCase, chatUrl: string, authKey: string, anonKey: string, expected: MoneyCheck[] = []) {
  const start = Date.now();
  const findings: string[] = [];
  try {
    const resp = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ messages: test.messages || [{ role: "user", content: test.query || "" }] }),
      signal: AbortSignal.timeout(18_000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const reader = resp.body?.getReader();
    if (!reader) throw new Error("Resposta sem conteúdo");
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";
    let finished = false;
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 150_000) throw new Error("Resposta maior que o limite");
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);
        if (!line.startsWith("data: ")) continue;
        const chunk = line.slice(6).trim();
        if (chunk === "[DONE]") { finished = true; break; }
        try {
          const parsed = JSON.parse(chunk);
          const content = parsed.choices?.[0]?.delta?.content;
          if (typeof content === "string") fullText += content;
        } catch {
          throw new Error("Evento SSE malformado");
        }
      }
    }
    if (!fullText.trim()) throw new Error("Resposta vazia do consultor");

    const duration = Date.now() - start;
    const lower = fullText.toLowerCase();
    let matches = 0;
    for (const kw of test.expectedKeywords) {
      if (lower.includes(kw.toLowerCase())) {
        matches++;
        findings.push(`✅ keyword: ${kw}`);
      } else {
        findings.push(`❌ faltou: ${kw}`);
      }
    }
    for (const kw of test.forbiddenKeywords || []) {
      if (lower.includes(kw.toLowerCase())) {
        findings.push(`❌ conteúdo proibido: ${kw}`);
        matches = Math.max(0, matches - 1);
      }
    }
    const accuracy = Math.round((matches / test.expectedKeywords.length) * 100);

    let consistency = 100;
    if (!fullText.includes("R$")) { consistency -= 20; findings.push("⚠️ sem R$"); }
    if (fullText.length < 50) { consistency -= 30; findings.push("⚠️ resposta curta"); }
    if (!fullText.match(/\*\*/)) { consistency -= 10; findings.push("⚠️ sem negrito"); }

    const numeric = checkFinancialAmounts(fullText, expected);
    findings.push(...numeric.findings);
    const numericOk = numeric.passed === numeric.total;
    if (!numericOk) accuracy = Math.min(accuracy, 69);
    const status = accuracy >= 70 && consistency >= 70 && numericOk ? "passed" : "failed";
    return {
      testId: test.id, name: test.name, category: test.category,
      status, accuracy, consistency, duration,
      numericPassed: numeric.passed, numericTotal: numeric.total,
      response: fullText.slice(0, 2000), findings,
    };
  } catch (e: any) {
    return {
      testId: test.id, name: test.name, category: test.category,
      status: "failed", accuracy: 0, consistency: 0,
      numericPassed: 0, numericTotal: expected.length,
      duration: Date.now() - start, response: "",
      findings: [`❌ erro: ${e?.message ?? "desconhecido"}`],
      error: e?.message,
    };
  }
}

function monthFirstDayInBrazil(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((item) => item.type === "year")?.value;
  const month = parts.find((item) => item.type === "month")?.value;
  if (!year || !month) throw new Error("Período indisponível");
  return `${year}-${month}-01`;
}

type Facts = {
  income?: number | string;
  expense?: number | string;
  result?: number | string;
  oldInstallments?: { amount?: number | string };
};

async function manualMoneyExpectations(userClient: any): Promise<Record<string, MoneyCheck[]>> {
  // The same per-user canonical RPC powers the Home and the deterministic AI
  // answers. Missing facts must fail closed: never publish a fake 100% score.
  const { data, error } = await userClient.rpc("financial_month_facts", {
    p_month: monthFirstDayInBrazil(),
  });
  if (error || !data) throw new Error("Valores canônicos indisponíveis para auditoria");
  const facts = data as Facts;
  const finite = (value: unknown) => {
    if (value === undefined || value === null || value === "") {
      throw new Error("Valor canônico ausente");
    }
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("Valor canônico inválido");
    return Math.round((number + Number.EPSILON) * 100) / 100;
  };
  const income = finite(facts.income);
  const expense = finite(facts.expense);
  const result = finite(facts.result);
  const oldInstallments = finite(facts.oldInstallments?.amount);
  return {
    "1": [
      { label: "Receitas", amount: income },
      { label: "Despesas", amount: expense },
      { label: "Resultado", amount: result },
    ],
    "2": [{ label: "Total", amount: expense }],
    "5": [{ label: "Total cobrado no mês vindo de compras anteriores", amount: oldInstallments }],
    "6": [{ label: "Total", amount: income }],
  };
}

function smokeCase(id: string, name: string, passed: boolean, finding: string, duration = 0) {
  return {
    testId: id, name, category: "Integridade", status: passed ? "passed" : "failed",
    accuracy: passed ? 100 : 0, consistency: passed ? 100 : 0,
    duration, numericPassed: passed ? 1 : 0, numericTotal: 1,
    response: "", findings: [finding],
  };
}

async function scheduledHealthChecks(chatUrl: string) {
  const cases = [];
  const valid = checkFinancialAmounts("**Receitas: R$ 1.209,63**", [{ label: "Receitas", amount: 1209.63 }]);
  cases.push(smokeCase("smoke-1", "Precisão monetária em centavos", valid.passed === 1, "Conferência de 1.209,63"));
  const invalid = checkFinancialAmounts("**Receitas: R$ 100,00**", [{ label: "Receitas", amount: 100.01 }]);
  cases.push(smokeCase("smoke-2", "Rejeitar valor incorreto", invalid.passed === 0, "Detectar divergência de R$ 0,01"));
  cases.push(smokeCase("smoke-3", "Resultado financeiro negativo", moneyBR(-32.5) === "-R$ 32,50", "Sinal negativo e formato brasileiro"));
  const started = Date.now();
  try {
    // Verify that the live financial-chat edge function rejects unauthenticated
    // requests. This check sends no financial data and consumes no AI tokens.
    const response = await fetch(chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "healthcheck" }] }),
      signal: AbortSignal.timeout(8_000),
    });
    cases.push(smokeCase("smoke-4", "Chat bloqueia requisição sem sessão", response.status === 401, `HTTP ${response.status}; esperado 401`, Date.now() - started));
  } catch (error: any) {
    cases.push(smokeCase("smoke-4", "Chat bloqueia requisição sem sessão", false, error?.message || "Falha de conectividade", Date.now() - started));
  }
  return cases;
}

serve(async (req) => {
  const corsHeaders = buildCors(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) return json({ error: "Serviço indisponível" }, 503);

    const suppliedToken = (req.headers.get("Authorization") || "").replace(/^Bearer\\s+/i, "").trim();
    if (!suppliedToken) return json({ error: "Unauthorized" }, 401);
    const service = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${suppliedToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    const isUser = !userError && !!userData?.user;
    const appMetadata = userData?.user?.app_metadata || {};
    const authorizedAdmin = isUser && (appMetadata.run_ai_tests === true || appMetadata.role === "admin");
    let internalCron = false;
    if (!isUser && req.method === "POST" && /^[a-f0-9]{64}$/i.test(suppliedToken)) {
      const { data: authorized, error } = await service.rpc("verify_ai_tests_cron_secret", { p_token: suppliedToken });
      internalCron = !error && authorized === true;
    }
    if (!authorizedAdmin && !internalCron) {
      return json({ error: isUser ? "Somente administrador pode executar auditorias" : "Unauthorized" }, isUser ? 403 : 401);
    }
    if (req.method === "GET") {
      if (!authorizedAdmin) return json({ error: "Forbidden" }, 403);
      const { data, error } = await service.from("ai_test_runs").select("*")
        .order("run_at", { ascending: false }).limit(30);
      if (error) throw error;
      return json({ runs: data || [] });
    }

    const chatUrl = `${SUPABASE_URL}/functions/v1/financial-chat`;
    let trigger: "manual-server" | "scheduled-smoke";
    let results: any[];
    if (internalCron) {
      trigger = "scheduled-smoke";
      results = await scheduledHealthChecks(chatUrl);
    } else {
      trigger = "manual-server";
      let expectations: Record<string, MoneyCheck[]>;
      try {
        expectations = await manualMoneyExpectations(userClient);
      } catch (error) {
        console.error("run-ai-tests canonical check unavailable", error);
        return json({ error: "Não foi possível conferir os valores canônicos. Nenhum resultado foi registrado." }, 503);
      }
      results = [];
      for (const test of TEST_SUITE) {
        results.push(await runOne(test, chatUrl, suppliedToken, ANON_KEY, expectations[test.id] || []));
      }
    }

    const total = results.length;
    const passed = results.filter((result) => result.status === "passed").length;
    const failed = total - passed;
    const avg = (field: "accuracy" | "consistency" | "duration") =>
      Math.round(results.reduce((sum, result) => sum + Number(result[field] || 0), 0) / total);
    const { data, error } = await service.from("ai_test_runs").insert({
      trigger, total_tests: total, passed, failed,
      avg_accuracy: avg("accuracy"), avg_consistency: avg("consistency"),
      avg_duration_ms: avg("duration"), results,
    }).select().single();
    if (error) throw error;
    return json({ ok: true, run: data });
  } catch (error) {
    console.error("run-ai-tests failed", error);
    return json({ error: "Internal server error" }, 500);
  }
});
