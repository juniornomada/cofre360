import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Calendar, 
  Clock, 
  Play, 
  RefreshCw, 
  History as HistoryIcon, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Settings2,
  Bell
} from "lucide-react";
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
  const [accuracyThreshold, setAccuracyThreshold] = useState(80);
  const [consistencyThreshold, setConsistencyThreshold] = useState(80);
  const [showSettings, setShowSettings] = useState(false);

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

  useEffect(() => {
    load();
    // Load local thresholds
    const savedAcc = localStorage.getItem("ai_test_acc_threshold");
    const savedCons = localStorage.getItem("ai_test_cons_threshold");
    if (savedAcc) setAccuracyThreshold(Number(savedAcc));
    if (savedCons) setConsistencyThreshold(Number(savedCons));
  }, [load]);

  const saveThresholds = () => {
    localStorage.setItem("ai_test_acc_threshold", String(accuracyThreshold));
    localStorage.setItem("ai_test_cons_threshold", String(consistencyThreshold));
    setShowSettings(false);
    toast.success("Limiares de alerta salvos localmente");
  };

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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <HistoryIcon className="h-5 w-5 text-primary" />
            Insights AI: Acurácia e Consistência
          </h2>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Calendar className="h-3 w-3" />
            Execução automática diária às 09:00 UTC (06:00 BRT)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Configurar Alertas
          </Button>
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

      {showSettings && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Configurações de Alerta
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="acc-threshold" className="text-xs">Mínimo de Acurácia (%)</Label>
                <Input 
                  id="acc-threshold" 
                  type="number" 
                  value={accuracyThreshold} 
                  onChange={(e) => setAccuracyThreshold(Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cons-threshold" className="text-xs">Mínimo de Consistência (%)</Label>
                <Input 
                  id="cons-threshold" 
                  type="number" 
                  value={consistencyThreshold} 
                  onChange={(e) => setConsistencyThreshold(Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowSettings(false)}>Cancelar</Button>
              <Button size="sm" onClick={saveThresholds}>Salvar Limiares</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily report banner */}
      {todayRun && (
        <Card className={cn(
          "border-l-4",
          todayRun.avg_accuracy < accuracyThreshold || todayRun.avg_consistency < consistencyThreshold 
            ? "border-l-red-500 bg-red-50/50" 
            : (todayRun.passed === todayRun.total_tests ? "border-l-emerald-500" : "border-l-amber-500")
        )}>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Relatório de hoje
                {(todayRun.avg_accuracy < accuracyThreshold || todayRun.avg_consistency < consistencyThreshold) && (
                  <Badge variant="destructive" className="animate-pulse">ALERTA DE PERFORMANCE</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Última execução: {fmtDate(todayRun.run_at)} ({todayRun.trigger})
              </CardDescription>
            </div>
            {(todayRun.avg_accuracy < accuracyThreshold || todayRun.avg_consistency < consistencyThreshold) && (
              <AlertTriangle className="h-8 w-8 text-red-500" />
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
              <Metric label="Aprovados" value={`${todayRun.passed}/${todayRun.total_tests}`} accent="emerald" />
              <Metric label="Falharam" value={String(todayRun.failed)} accent={todayRun.failed > 0 ? "red" : "muted"} />
              <Metric 
                label="Acurácia" 
                value={`${todayRun.avg_accuracy}%`} 
                accent={todayRun.avg_accuracy < accuracyThreshold ? "red" : "blue"} 
              />
              <Metric 
                label="Consistência" 
                value={`${todayRun.avg_consistency}%`} 
                accent={todayRun.avg_consistency < consistencyThreshold ? "red" : "violet"} 
              />
              <Metric label="Tempo médio" value={`${(todayRun.avg_duration_ms / 1000).toFixed(1)}s`} accent="muted" />
            </div>

            {(todayRun.avg_accuracy < accuracyThreshold || todayRun.avg_consistency < consistencyThreshold) && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-md text-sm text-red-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Desempenho abaixo do esperado:</p>
                  <ul className="list-disc list-inside mt-1 text-xs space-y-1">
                    {todayRun.avg_accuracy < accuracyThreshold && (
                      <li>Acurácia ({todayRun.avg_accuracy}%) está abaixo do limiar de {accuracyThreshold}%</li>
                    )}
                    {todayRun.avg_consistency < consistencyThreshold && (
                      <li>Consistência ({todayRun.avg_consistency}%) está abaixo do limiar de {consistencyThreshold}%</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!todayRun && !loading && (
        <Card className="border-dashed border-2">
          <CardHeader>
            <CardTitle className="text-sm">Status de Hoje</CardTitle>
            <CardDescription>Nenhuma execução registrada hoje ainda.</CardDescription>
          </CardHeader>
        </Card>
      )}

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
          const isBelowThreshold = r.avg_accuracy < accuracyThreshold || r.avg_consistency < consistencyThreshold;
          
          return (
            <Card key={r.id} className={cn("overflow-hidden", isBelowThreshold && "border-red-200")}>
              <button
                onClick={() => setExpandedId(isOpen ? null : r.id)}
                className={cn(
                  "w-full p-3 flex items-center justify-between hover:bg-accent/40 transition-colors text-left",
                  isBelowThreshold && "bg-red-50/30"
                )}
              >
                <div className="flex items-center gap-3">
                  {isBelowThreshold ? (
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  ) : allPassed ? (
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
                      {isBelowThreshold && (
                        <Badge variant="destructive" className="text-[9px] h-4">ALERTA</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                      <span>{r.passed}/{r.total_tests} ok</span>
                      <span className={cn(r.avg_accuracy < accuracyThreshold && "text-red-500 font-bold")}>
                        Ac: {r.avg_accuracy}%
                      </span>
                      <span className={cn(r.avg_consistency < consistencyThreshold && "text-red-500 font-bold")}>
                        Co: {r.avg_consistency}%
                      </span>
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
