import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = new Set([
  "https://cofre360.lovable.app",
  "https://id-preview--8755cbe4-fc00-44b3-810a-824346dac2f8.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
]);
function buildCors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://cofre360.lovable.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
const corsHeaders = buildCors(null);

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

async function runOne(test: TestCase, chatUrl: string, authKey: string, anonKey: string) {
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
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const reader = resp.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              const c = parsed.choices?.[0]?.delta?.content;
              if (c) fullText += c;
            } catch (_) {}
          }
        }
      }
    }

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

    const status = accuracy >= 70 && consistency >= 70 ? "passed" : "failed";
    return {
      testId: test.id, name: test.name, category: test.category,
      status, accuracy, consistency, duration,
      response: fullText.slice(0, 2000), findings,
    };
  } catch (e: any) {
    return {
      testId: test.id, name: test.name, category: test.category,
      status: "failed", accuracy: 0, consistency: 0,
      duration: Date.now() - start, response: "",
      findings: [`❌ erro: ${e?.message ?? "desconhecido"}`],
      error: e?.message,
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Require service-role (internal/cron) or an authenticated user.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const isServiceRole = !!token && token === SERVICE_KEY;
    if (!isServiceRole) {
      if (!token) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let trigger = "scheduled";
    try {
      const body = await req.json();
      if (body?.trigger) trigger = String(body.trigger).slice(0, 64);
    } catch (_) {}

    const chatUrl = `${SUPABASE_URL}/functions/v1/financial-chat`;
    const results = [];
    for (const t of TEST_SUITE) {
      // Forward the caller token so financial-chat's auth check passes.
      results.push(await runOne(t, chatUrl, token, ANON_KEY));
    }

    const total = results.length;
    const passed = results.filter((r) => r.status === "passed").length;
    const failed = total - passed;
    const avgAcc = Math.round(results.reduce((s, r) => s + r.accuracy, 0) / total);
    const avgCons = Math.round(results.reduce((s, r) => s + r.consistency, 0) / total);
    const avgDur = Math.round(results.reduce((s, r) => s + r.duration, 0) / total);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await supabase.from("ai_test_runs").insert({
      trigger,
      total_tests: total,
      passed,
      failed,
      avg_accuracy: avgAcc,
      avg_consistency: avgCons,
      avg_duration_ms: avgDur,
      results,
    }).select().single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, run: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("run-ai-tests error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
