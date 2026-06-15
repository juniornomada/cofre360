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
  query: string;
  expectedKeywords: string[];
  category: string;
}

const TEST_SUITE: TestCase[] = [
  { id: "1", name: "Resumo Geral de Abril", query: "Qual foi meu resumo financeiro de abril?", expectedKeywords: ["abril", "receitas", "despesas", "saldo"], category: "Resumo" },
  { id: "2", name: "Gasto com Alimentação (Abril)", query: "Quanto eu gastei com alimentação em abril?", expectedKeywords: ["alimentação", "abril", "R$"], category: "Categorias" },
  { id: "3", name: "Comparação Mês Atual vs Anterior", query: "Meus gastos aumentaram ou diminuíram em relação ao mês passado?", expectedKeywords: ["comparação", "mês passado", "%"], category: "Comparação" },
  { id: "4", name: "Busca por Nome Específico", query: "Quanto gastei com Mercado Pago em março?", expectedKeywords: ["mercado pago", "março"], category: "Filtros" },
  { id: "5", name: "Projeção de Saldo", query: "Qual minha projeção de saldo para o fim do mês?", expectedKeywords: ["projeção", "saldo", "previsto"], category: "Resumo" },
];

async function runOne(test: TestCase, chatUrl: string, authKey: string) {
  const start = Date.now();
  const findings: string[] = [];
  try {
    const resp = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authKey}`,
        apikey: authKey,
      },
      body: JSON.stringify({ messages: [{ role: "user", content: test.query }] }),
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
      results.push(await runOne(t, chatUrl, token));
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
