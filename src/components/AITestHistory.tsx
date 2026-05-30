import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Play, RefreshCw, History as HistoryIcon, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TestResultDetail {
  testId: string;
  name: string;
  category: string;
  status: "passed" | "failed";
  accuracy: number;
  consistency: number;
  duration: number;
  response?: string;
  findings: string[];
}

interface TestRun {
  id: string;
  run_at: string;
  trigger: string;
  total_tests: number;
  passed: number;
  failed: number;
  avg_accuracy: number;
  avg_consistency: number;
  avg_duration_ms: number;
  results: TestResultDetail[];
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-ai-tests`;

export function AITestHistory() {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_test_runs")
      .select("*")
      .order("run_at", { ascending: false })
      .limit(30);
    if (error) {
      toast.error("Erro ao carregar histórico: " + error.message);
    } else {
      setRuns((data ?? []) as TestRun[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runNow = async () => {
    setRunning(true);
    try {
      const resp = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ trigger: "manual-server" }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      toast.success("Execução concluída e salva no histórico");
      await load();
    } catch (e: any) {
      toast.error("Falha: " + (e?.message ?? "desconhecido"));
    } finally {
      setRunning(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const todayRun = runs.find((r) => r.run_at.slice(0, 10) === today);

  const fmtDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <HistoryIcon className="h-5 w-5 text-primary" />
            Histórico Agendado
          </h2>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Calendar className="h-3 w-3" />
            Execução automática diária às 09:00 UTC (06:00 BRT)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Atualizar
          </Button>
          <Button size="sm" onClick={runNow} disabled={running}>
            <Play className={cn("h-4 w-4 mr-2", running && "animate-pulse")} />
            {running ? "Executando..." : "Rodar agora"}
          </Button>
        </div>
      </div>

      {/* Daily report banner */}
      <Card className={cn(
        "border-l-4",
        todayRun ? (todayRun.passed === todayRun.total_tests ? "border-l-emerald-500" : "border-l-amber-500") : "border-l-muted"
      )}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Relatório de hoje</CardTitle>
          <CardDescription>
            {todayRun
              ? `Última execução: ${fmtDate(todayRun.run_at)} (${todayRun.trigger})`
              : "Nenhuma execução registrada hoje ainda."}
          </CardDescription>
        </CardHeader>
        {todayRun && (
          <CardContent className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
            <Metric label="Aprovados" value={`${todayRun.passed}/${todayRun.total_tests}`} accent="emerald" />
            <Metric label="Falharam" value={String(todayRun.failed)} accent={todayRun.failed > 0 ? "red" : "muted"} />
            <Metric label="Acurácia" value={`${todayRun.avg_accuracy}%`} accent="blue" />
            <Metric label="Consistência" value={`${todayRun.avg_consistency}%`} accent="violet" />
            <Metric label="Tempo médio" value={`${(todayRun.avg_duration_ms / 1000).toFixed(1)}s`} accent="muted" />
          </CardContent>
        )}
      </Card>

      {/* Run list */}
      <div className="space-y-2">
        {loading && runs.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Carregando histórico...</p>
        )}
        {!loading && runs.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma execução registrada ainda.</p>
        )}
        {runs.map((r) => {
          const isOpen = expandedId === r.id;
          const allPassed = r.passed === r.total_tests;
          return (
            <Card key={r.id} className="overflow-hidden">
              <button
                onClick={() => setExpandedId(isOpen ? null : r.id)}
                className="w-full p-3 flex items-center justify-between hover:bg-accent/40 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {allPassed ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2">
                      {fmtDate(r.run_at)}
                      <Badge variant={r.trigger === "scheduled" ? "default" : "secondary"} className="text-[10px]">
                        {r.trigger}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                      <span>{r.passed}/{r.total_tests} ok</span>
                      <span>Ac: {r.avg_accuracy}%</span>
                      <span>Co: {r.avg_consistency}%</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{(r.avg_duration_ms / 1000).toFixed(1)}s</span>
                    </div>
                  </div>
                </div>
              </button>
              {isOpen && (
                <CardContent className="border-t bg-accent/10 pt-3 space-y-2">
                  {r.results.map((res) => (
                    <div key={res.testId} className="p-2 rounded border bg-background text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{res.name}</span>
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full",
                          res.status === "passed" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                        )}>
                          {res.status} · {res.accuracy}%/{res.consistency}%
                        </span>
                      </div>
                      {res.findings && res.findings.length > 0 && (
                        <ul className="mt-1 text-muted-foreground space-y-0.5">
                          {res.findings.slice(0, 4).map((f, i) => <li key={i}>{f}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  const map: Record<string, string> = {
    emerald: "text-emerald-500",
    red: "text-red-500",
    blue: "text-blue-500",
    violet: "text-violet-500",
    muted: "text-foreground",
  };
  return (
    <div>
      <div className={cn("text-lg font-bold", map[accent])}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
