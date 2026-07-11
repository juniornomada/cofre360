import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listRules,
  upsertRule,
  deleteRule,
  runNow,
  listRuns,
  listOpenDivergences,
  markInvestigated,
  exportRunCsv,
} from "@/lib/reconciliation/reconciliation.functions";
import type { ReconciliationRule, CheckType, RuleKind, ToleranceKind } from "@/lib/reconciliation/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Play, Plus, Trash2, Download, CheckCircle2, AlertTriangle, ArrowLeft, CalendarIcon } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { formatSignedBRL } from "@/lib/format-brl";
import { SmartLink as Link } from "@/components/SmartLink";
import { cn } from "@/lib/utils";
import { mapServerError } from "@/lib/map-server-error";

const CHECK_LABEL: Record<CheckType, string> = {
  bank_account: "Conta",
  card: "Cartão",
  invoice: "Fatura",
  budget: "Orçamento",
};

function fmtDate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

const PRESETS = () => {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  return [
    { label: "Hoje", start: fmtDate(today), end: fmtDate(today) },
    { label: "Ontem", start: fmtDate(subDays(today, 1)), end: fmtDate(subDays(today, 1)) },
    { label: "Últimos 7 dias", start: fmtDate(subDays(today, 6)), end: fmtDate(today) },
    { label: "Mês atual", start: fmtDate(startOfMonth(today)), end: fmtDate(endOfMonth(today)) },
    { label: "Mês anterior", start: fmtDate(startOfMonth(subMonths(today, 1))), end: fmtDate(endOfMonth(subMonths(today, 1))) },
    { label: "Ano atual", start: fmtDate(startOfYear(today)), end: fmtDate(endOfYear(today)) },
    { label: "Ano anterior", start: fmtDate(startOfYear(subYears(today, 1))), end: fmtDate(endOfYear(subYears(today, 1))) },
  ];
};

export const Route = createFileRoute("/reconciliation")({
  head: () => ({
    meta: [
      { title: "Reconciliação Financeira — Cofre 360" },
      { name: "description", content: "Valide a consistência das contas, cartões, faturas e orçamentos com regras configuráveis." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || "dashboard",
  }),
  component: ReconciliationPage,
});

function ReconciliationPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const setTab = (t: string) => navigate({ to: "/reconciliation", search: { tab: t } as any });

  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-md px-4 py-3 flex items-center gap-3">
          <Link to="/" search={{} as any} className="rounded-lg p-1 hover:bg-muted" aria-label="Voltar para início">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold">Reconciliação</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="run">Executar</TabsTrigger>
            <TabsTrigger value="rules">Regras</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="mt-4"><DashboardTab /></TabsContent>
          <TabsContent value="run" className="mt-4"><RunTab /></TabsContent>
          <TabsContent value="rules" className="mt-4"><RulesTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ------------------------- Dashboard -------------------------
function DashboardTab() {
  const listRunsFn = useServerFn(listRuns);
  const openFn = useServerFn(listOpenDivergences);
  const markFn = useServerFn(markInvestigated);
  const [runs, setRuns] = useState<any[]>([]);
  const [open, setOpen] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, o] = await Promise.all([listRunsFn(), openFn()]);
      setRuns(r as any);
      setOpen(o as any);
    } catch (e) {
      toast.error(mapServerError(e));
    } finally {
      setLoading(false);
    }
  }, [listRunsFn, openFn]);

  useEffect(() => { load(); }, [load]);

  const handleUpdate = async (id: string, patch: { status?: string; note?: string }) => {
    try {
      await markFn({ data: { id, ...patch } });
      toast.success("Divergência atualizada");
      load();
    } catch (e) {
      toast.error(mapServerError(e));
    }
  };


  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6" /></div>;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Divergências abertas</p>
            <p className="text-2xl font-bold text-destructive">{open.length}</p>
          </div>
          {open.length === 0 ? (
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          ) : (
            <AlertTriangle className="h-8 w-8 text-destructive" />
          )}
        </div>
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-2">Execuções recentes</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma execução ainda. Vá em "Executar".</p>
        ) : (
          <div className="space-y-2">
            {runs.slice(0, 10).map((r) => (
              <Card key={r.id} className="p-3">
                <div className="flex justify-between items-start text-sm">
                  <div>
                    <p className="font-medium">{r.period_start} → {r.period_end}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.triggered_by === "scheduled" ? "Agendada" : "Manual"} · {format(new Date(r.started_at), "dd/MM HH:mm")}
                    </p>
                  </div>
                  <div className="text-right">
                    {r.status === "completed" ? (
                      r.divergences_count > 0 ? (
                        <Badge variant="destructive">{r.divergences_count} divergência{r.divergences_count > 1 ? "s" : ""}</Badge>
                      ) : (
                        <Badge className="bg-green-500 text-white hover:bg-green-500">OK</Badge>
                      )
                    ) : r.status === "failed" ? (
                      <Badge variant="destructive">Falhou</Badge>
                    ) : (
                      <Badge variant="secondary">…</Badge>
                    )}
                    {r.total_divergence_amount > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">{formatSignedBRL(-Math.abs(Number(r.total_divergence_amount)))}</p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {open.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">Divergências abertas</h2>
          <div className="space-y-2">
            {open.slice(0, 20).map((d) => (
              <Card key={d.id} className="p-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{CHECK_LABEL[d.check_type as CheckType]}</Badge>
                      <p className="text-sm font-medium truncate">{d.entity_label}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      esperado: {formatSignedBRL(Number(d.expected))} · real: {formatSignedBRL(Number(d.actual))}
                    </p>
                    <p className="text-sm font-semibold text-destructive mt-1">
                      Δ {formatSignedBRL(Number(d.delta))}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleInvestigate(d.id)}>Investigada</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------- Executar -------------------------
function RunTab() {
  const runFn = useServerFn(runNow);
  const listRunsFn = useServerFn(listRuns);
  const exportFn = useServerFn(exportRunCsv);
  const today = fmtDate(new Date());
  const [start, setStart] = useState<string>(fmtDate(startOfMonth(new Date())));
  const [end, setEnd] = useState<string>(today);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<any>(null);

  const handleRun = async () => {
    if (start > end) { toast.error("Data inicial > final"); return; }
    setRunning(true);
    try {
      const res = await runFn({ data: { periodStart: start, periodEnd: end } });
      setLastRun(res);
      const n = (res as any).result.divergences.length;
      if (n === 0) toast.success("Nenhuma divergência detectada ✓");
      else toast.warning(`${n} divergência${n > 1 ? "s" : ""} detectada${n > 1 ? "s" : ""}`);
    } catch (e) {
      toast.error(mapServerError(e));
    } finally {
      setRunning(false);
    }
  };

  const handleExport = async () => {
    if (!lastRun?.run?.id) return;
    try {
      const { csv } = await exportFn({ data: { runId: lastRun.run.id } });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reconciliacao-${lastRun.run.period_start}-${lastRun.run.period_end}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(mapServerError(e));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <p className="text-sm font-semibold">Período</p>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS().map((p) => (
            <Button
              key={p.label}
              variant="outline"
              size="sm"
              onClick={() => { setStart(p.start); setEnd(p.end); }}
              className={cn(start === p.start && end === p.end && "border-primary")}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Início</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Fim</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <Button onClick={handleRun} disabled={running} className="w-full" aria-label="Validar agora">
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          Validar agora
        </Button>
      </Card>

      {lastRun && (
        <Card className="p-4">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-semibold">Resultado</p>
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
          {lastRun.result.divergences.length === 0 ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" /> Tudo consistente
            </div>
          ) : (
            <div className="space-y-2">
              {lastRun.result.divergences.map((d: any, i: number) => (
                <div key={i} className="border-l-2 border-destructive pl-3 py-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{CHECK_LABEL[d.check_type as CheckType]}</Badge>
                    <p className="text-sm font-medium">{d.entity_label}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    esperado {formatSignedBRL(d.expected)} · real {formatSignedBRL(d.actual)} · Δ <span className="text-destructive font-semibold">{formatSignedBRL(d.delta)}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ------------------------- Regras -------------------------
function RulesTab() {
  const listFn = useServerFn(listRules);
  const upsertFn = useServerFn(upsertRule);
  const deleteFn = useServerFn(deleteRule);
  const [rules, setRules] = useState<ReconciliationRule[]>([]);
  const [editing, setEditing] = useState<Partial<ReconciliationRule> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRules((await listFn()) as ReconciliationRule[]);
    } catch (e) { toast.error(mapServerError(e)); }
    finally { setLoading(false); }
  }, [listFn]);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!editing) return;
    try {
      await upsertFn({ data: editing });
      toast.success("Regra salva");
      setEditing(null);
      load();
    } catch (e) { toast.error(mapServerError(e)); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFn({ data: { id } });
      toast.success("Regra excluída");
      load();
    } catch (e) { toast.error(mapServerError(e)); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6" /></div>;

  return (
    <div className="space-y-3">
      <Button onClick={() => setEditing({
        name: "",
        check_type: "card",
        rule_kind: "zero",
        tolerance_kind: "abs",
        tolerance_value: 0,
        target_ids: [],
        enabled: true,
      })} className="w-full">
        <Plus className="h-4 w-4 mr-2" /> Nova regra
      </Button>

      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma regra. Crie a primeira acima.</p>
      ) : rules.map((r) => (
        <Card key={r.id} className="p-3">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <p className="font-medium">{r.name}</p>
              <div className="flex gap-1 mt-1 flex-wrap">
                <Badge variant="outline" className="text-xs">{CHECK_LABEL[r.check_type]}</Badge>
                <Badge variant="outline" className="text-xs">{r.rule_kind}</Badge>
                <Badge variant="outline" className="text-xs">
                  ±{r.tolerance_value}{r.tolerance_kind === "pct" ? "%" : ""}
                </Badge>
                {!r.enabled && <Badge variant="secondary" className="text-xs">desativada</Badge>}
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => setEditing(r)} aria-label="Editar regra">
                <Plus className="h-4 w-4 rotate-45" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label="Excluir regra"><Trash2 className="h-4 w-4" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir regra?</AlertDialogTitle>
                    <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(r.id)}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </Card>
      ))}

      {editing && (
        <Card className="p-4 space-y-3 border-primary">
          <p className="font-semibold">{editing.id ? "Editar" : "Nova"} regra</p>
          <div>
            <Label>Nome</Label>
            <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tipo de checagem</Label>
              <Select value={editing.check_type} onValueChange={(v) => setEditing({ ...editing, check_type: v as CheckType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_account">Conta bancária</SelectItem>
                  <SelectItem value="card">Cartão</SelectItem>
                  <SelectItem value="invoice">Fatura</SelectItem>
                  <SelectItem value="budget">Orçamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Regra</Label>
              <Select value={editing.rule_kind} onValueChange={(v) => setEditing({ ...editing, rule_kind: v as RuleKind })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zero">Deve ser zero</SelectItem>
                  <SelectItem value="equality">Igualdade (derivado)</SelectItem>
                  <SelectItem value="sum">Soma</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tolerância</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editing.tolerance_value ?? 0}
                onChange={(e) => setEditing({ ...editing, tolerance_value: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={editing.tolerance_kind} onValueChange={(v) => setEditing({ ...editing, tolerance_kind: v as ToleranceKind })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="abs">R$ absoluto</SelectItem>
                  <SelectItem value="pct">Percentual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Deixe alvos vazios para aplicar a todas as entidades do tipo escolhido.
          </p>
          <div className="flex gap-2">
            <Button onClick={handleSave} className="flex-1">Salvar</Button>
            <Button onClick={() => setEditing(null)} variant="outline" className="flex-1">Cancelar</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
