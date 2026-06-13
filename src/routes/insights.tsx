import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useMemo } from "react";
import { 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Search, 
  FileText, 
  BarChart3, 
  MessageSquare,
  ShieldCheck,
  Zap,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { AITestHistory } from "@/components/AITestHistory";

export const Route = createFileRoute("/insights")({
  component: AIInsightsDashboard,
});

interface TestCase {
  id: string;
  name: string;
  query: string;
  expectedKeywords: string[];
  expectedValues?: {
    type: "total" | "category" | "balance";
    key?: string;
    value: number;
    tolerance: number;
  }[];
  category: "Resumo" | "Categorias" | "Filtros" | "Comparação";
}

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const now = new Date();
const currentMonth = MONTH_NAMES[now.getMonth()];
const previousMonth = MONTH_NAMES[(now.getMonth() + 11) % 12];
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const TEST_SUITE: TestCase[] = [
  {
    id: "1",
    name: `Resumo Geral de ${capitalize(currentMonth)}`,
    query: `Qual foi meu resumo financeiro de ${currentMonth}?`,
    expectedKeywords: [currentMonth, "receitas", "despesas", "saldo"],
    category: "Resumo",
  },
  {
    id: "2",
    name: `Gasto com Alimentação (${capitalize(currentMonth)})`,
    query: `Quanto eu gastei com alimentação em ${currentMonth}?`,
    expectedKeywords: ["alimentação", currentMonth, "R$"],
    category: "Categorias",
  },
  {
    id: "3",
    name: "Comparação Mês Atual vs Anterior",
    query: "Meus gastos aumentaram ou diminuíram em relação ao mês passado?",
    expectedKeywords: ["comparação", "mês passado", "%"],
    category: "Comparação",
  },
  {
    id: "4",
    name: "Busca por Nome Específico",
    query: `Quanto gastei com Mercado Pago em ${previousMonth}?`,
    expectedKeywords: ["mercado pago", previousMonth],
    category: "Filtros",
  },
  {
    id: "5",
    name: "Projeção de Saldo",
    query: "Qual minha projeção de saldo para o fim do mês?",
    expectedKeywords: ["projeção", "saldo", "previsto"],
    category: "Resumo",
  }
];

interface TestResult {
  testId: string;
  status: "pending" | "running" | "passed" | "failed";
  accuracy: number; // 0-100
  consistency: number; // 0-100
  response: string;
  duration: number;
  error?: string;
  findings: string[];
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/financial-chat`;

function AIInsightsDashboard() {
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const runTest = useCallback(async (test: TestCase) => {
    setResults(prev => ({
      ...prev,
      [test.id]: {
        testId: test.id,
        status: "running",
        accuracy: 0,
        consistency: 0,
        response: "",
        duration: 0,
        findings: []
      }
    }));

    const startTime = Date.now();
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ 
          messages: [{ role: "user", content: test.query }] 
        }),
      });

      if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
      
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) fullText += content;
              } catch (e) {}
            }
          }
        }
      }

      const duration = Date.now() - startTime;
      
      // Avaliação de Acurácia Simples (Palavras-chave)
      const findings: string[] = [];
      let matchCount = 0;
      const lowerResponse = fullText.toLowerCase();
      
      test.expectedKeywords.forEach(kw => {
        if (lowerResponse.includes(kw.toLowerCase())) {
          matchCount++;
          findings.push(`✅ Encontrou palavra-chave: "${kw}"`);
        } else {
          findings.push(`❌ Faltou palavra-chave: "${kw}"`);
        }
      });

      const accuracy = Math.round((matchCount / test.expectedKeywords.length) * 100);
      
      // Simulação de Consistência (Baseado em estrutura e tom)
      let consistency = 100;
      if (!fullText.includes("R$")) {
        consistency -= 20;
        findings.push("⚠️ Falta de formatação monetária (R$)");
      }
      if (fullText.length < 50) {
        consistency -= 30;
        findings.push("⚠️ Resposta excessivamente curta");
      }
      if (!fullText.match(/[**]/)) {
        consistency -= 10;
        findings.push("⚠️ Falta de uso de negrito para destaque");
      }

      const status = accuracy >= 70 && consistency >= 70 ? "passed" : "failed";

      setResults(prev => ({
        ...prev,
        [test.id]: {
          testId: test.id,
          status,
          accuracy,
          consistency,
          response: fullText,
          duration,
          findings
        }
      }));

    } catch (error: any) {
      setResults(prev => ({
        ...prev,
        [test.id]: {
          ...prev[test.id],
          status: "failed",
          error: error.message,
          findings: ["❌ Falha na execução da Edge Function"]
        }
      }));
    }
  }, []);

  const runAllTests = async () => {
    setIsBatchRunning(true);
    for (const test of TEST_SUITE) {
      await runTest(test);
    }
    setIsBatchRunning(false);
    toast.success("Bateria de testes concluída!");
  };

  const stats = useMemo(() => {
    const executed = Object.values(results).filter(r => r.status !== "pending");
    if (executed.length === 0) return { avgAcc: 0, avgCons: 0, passRate: 0 };
    
    const avgAcc = Math.round(executed.reduce((acc, curr) => acc + curr.accuracy, 0) / executed.length);
    const avgCons = Math.round(executed.reduce((acc, curr) => acc + curr.consistency, 0) / executed.length);
    const passRate = Math.round((executed.filter(r => r.status === "passed").length / executed.length) * 100);
    
    return { avgAcc, avgCons, passRate };
  }, [results]);

  return (
    <div className="animate-page-enter flex flex-col gap-6 px-4 pt-6 pb-24 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            AI Insights Benchmark
            <ShieldCheck className="h-6 w-6 text-primary" />
          </h1>
          <p className="text-muted-foreground">Avaliação de acurácia, consistência e performance da IA</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setResults({})}
            disabled={isBatchRunning}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Limpar
          </Button>
          <Button 
            onClick={runAllTests} 
            disabled={isBatchRunning}
            className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
          >
            <Play className="mr-2 h-4 w-4" />
            Executar Suite Completa
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Acurácia Média
              <Zap className="h-4 w-4 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{stats.avgAcc}%</div>
            <Progress value={stats.avgAcc} className="h-2 mt-2 bg-emerald-500/20" />
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Consistência
              <BarChart3 className="h-4 w-4 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{stats.avgCons}%</div>
            <Progress value={stats.avgCons} className="h-2 mt-2 bg-blue-500/20" />
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-violet-500/10 to-transparent border-violet-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Pass Rate
              <CheckCircle2 className="h-4 w-4 text-violet-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-500">{stats.passRate}%</div>
            <Progress value={stats.passRate} className="h-2 mt-2 bg-violet-500/20" />
          </CardContent>
        </Card>
      </div>

      {/* Test List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Casos de Teste ({TEST_SUITE.length})</h2>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Search className="h-3 w-3" />
            Monitoramento em tempo real
          </span>
        </div>

        {TEST_SUITE.map((test) => {
          const result = results[test.id];
          const isExpanded = expandedId === test.id;
          
          return (
            <Card key={test.id} className={cn(
              "overflow-hidden transition-all duration-200 border-l-4",
              !result ? "border-l-muted" : 
              result.status === "running" ? "border-l-blue-500 animate-pulse" :
              result.status === "passed" ? "border-l-emerald-500" : "border-l-red-500"
            )}>
              <div 
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : test.id)}
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className={cn(
                    "p-2 rounded-full",
                    !result ? "bg-muted text-muted-foreground" :
                    result.status === "running" ? "bg-blue-500/10 text-blue-500" :
                    result.status === "passed" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                  )}>
                    {!result ? <FileText className="h-5 w-5" /> : 
                     result.status === "running" ? <RefreshCw className="h-5 w-5 animate-spin" /> :
                     result.status === "passed" ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{test.category}</span>
                      <h3 className="font-semibold">{test.name}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground italic">"{test.query}"</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {result && result.status !== "running" && (
                    <div className="hidden md:flex items-center gap-4 text-xs">
                      <div className="text-center">
                        <div className="font-bold">{result.accuracy}%</div>
                        <div className="text-muted-foreground">Acurácia</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold">{(result.duration / 1000).toFixed(1)}s</div>
                        <div className="text-muted-foreground">Tempo</div>
                      </div>
                    </div>
                  )}
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    onClick={(e) => {
                      e.stopPropagation();
                      runTest(test);
                    }}
                    disabled={isBatchRunning || (result && result.status === "running")}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>

              {isExpanded && (
                <CardContent className="border-t bg-accent/20 p-6 space-y-6">
                  {result ? (
                    <>
                      <div className="flex flex-col gap-6">
                        <div className="space-y-3">
                          <h4 className="text-sm font-bold flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            Observações do Validador
                          </h4>
                          <div className="text-xs p-3 rounded bg-background border border-border space-y-2 text-justify">
                            {(() => {
                              const foundKeywords = result.findings
                                .map((f) => f.match(/^✅ Encontrou palavra-chave: "(.+)"$/)?.[1])
                                .filter(Boolean);
                              const missingKeywords = result.findings
                                .map((f) => f.match(/^❌ Faltou palavra-chave: "(.+)"$/)?.[1])
                                .filter(Boolean);
                              const otherFindings = result.findings.filter(
                                (f) => !f.includes('palavra-chave:')
                              );

                              return (
                                <>
                                  {foundKeywords.length > 0 && (
                                    <p className="leading-relaxed">
                                      ✅ Foram encontradas: {foundKeywords.join(', ')}
                                    </p>
                                  )}
                                  {missingKeywords.length > 0 && (
                                    <p className="leading-relaxed">
                                      ❌ Faltaram: {missingKeywords.join(', ')}
                                    </p>
                                  )}
                                  {otherFindings.map((f, i) => (
                                    <p key={i} className="leading-relaxed">{f}</p>
                                  ))}
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="text-sm font-bold flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Resposta da IA
                          </h4>
                          <div className="text-xs p-4 rounded-xl bg-background border border-border prose prose-sm prose-invert max-w-none">
                            <ReactMarkdown>
                              {result.response || (result.status === "running" ? "Processando resposta em tempo real..." : "Nenhuma resposta recebida")}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                      {result.error && (
                        <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
                          Error: {result.error}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>Execute este teste para ver os resultados detalhados</p>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <AITestHistory />
    </div>
  );
}
