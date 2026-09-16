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
import type {
  ReconciliationRule,
  CheckType,
  RuleKind,
  ToleranceKind,
} from "@/lib/reconciliation/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Play,
  Plus,
  Trash2,
  Download,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
} from "date-fns";
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
  transfer: "Transferência",
  installment: "Parcelamento",
  data_quality: "Dados",
  refund: "Reembolso",
  system: "Sistema",
};

const RULE_KIND_LABEL: Record<RuleKind, string> = {
  zero: "Deve zerar",
  equality: "Conferir valor",
  sum: "Conferir valor",
};

const CHECK_HELP: Partial<Record<CheckType, string>> = {
  card: "Confere se o saldo do cartão bate com as movimentações registradas.",
  invoice: "Confere se compras, reembolsos e pagamentos fecham a fatura.",
  budget: "Compara os gastos da categoria com o orçamento definido.",
};

function fmtDate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

const PRESETS = () => {
  const today = new Date();
  return [
    { label: "Mês atual", start: fmtDate(startOfMonth(today)), end: fmtDate(today) },
    {
      label: "Mês anterior",
      start: fmtDate(startOfMonth(subMonths(today, 1))),
      end: fmtDate(endOfMonth(subMonths(today, 1))),
    },
    { label: "Últimos 7 dias", start: fmtDate(subDays(today, 6)), end: fmtDate(today) },
    { label: "Hoje", start: fmtDate(today), end: fmtDate(today) },
  ];
};

export const Route = createFileRoute("/reconciliation")({
  head: () => ({
    meta: [
      { title: "Reconciliação Financeira — Cofre 360" },
      {
        name: "description",
        content: "Confira automaticamente a consistência dos dados financeiros do Cofre 360.",
      },
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
  const setTab = (t: string) =>
    navigate({ to: "/reconciliation", search: { tab: t } as any });

  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <Link
            to="/"
            search={{} as any}
            className="rounded-lg p-1 hover:bg-muted"
            aria-label="Voltar para início"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold">Reconciliação</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dashboard">Resumo</TabsTrigger>
            <TabsTrigger value="run">Verificar</TabsTrigger>
            <TabsTrigger value="rules">Alertas</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="mt-4">
            <DashboardTab />
          </TabsContent>
          <TabsContent value="run" className="mt-4">
            <RunTab />
          </TabsContent>
          <TabsContent value="rules" className="mt-4">
            <RulesTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  open: { label: "Aberta", className: "bg-destructive text-destructive-foreground" },
  investigating: { label: "Em análise", className: "bg-amber-500 text-white" },
  resolved: { label: "Resolvida", className: "bg-green-500 text-white" },
};

function DivergenceCard({
  d,
  onUpdate,
}: {
  d: any;
  onUpdate: (id: string, patch: { status?: string; note?: string }) => void | Promise<void>;
}) {
  const [note, setNote] = useState<string>(d.note ?? "");
  const status = (d.status ?? "open") as keyof typeof STATUS_LABEL;
  const meta = STATUS_LABEL[status] ?? STATUS_LABEL.open;

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {CHECK_LABEL[d.check_type as CheckType] ?? "Verificação"}
            </Badge>
            <Badge className={cn("text-xs", meta.className)}>{meta.label}</Badge>
          </div>
          <p className="mt-2 text-sm font-medium">{d.entity_label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Esperado: {formatSignedBRL(Number(d.expected))} · Encontrado:{" "}
            {formatSignedBRL(Number(d.actual))}
          </p>
          <p className="mt-1 text-sm font-semibold text-destructive">
            Diferença: {formatSignedBRL(Number(d.delta))}
          </p>
        </div>
        <Select value={status} onValueChange={(v) => onUpdate(d.id, { status: v })}>
          <SelectTrigger className="h-8 w-[122px] text-xs" aria-label="Status da divergência">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Aberta</SelectItem>
            <SelectItem value="investigating">Em análise</SelectItem>
            <SelectItem value="resolved">Resolvida</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-2">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anotação sobre esta divergência…"
          className="min-h-[52px] text-xs"
          maxLength={1000}
        />
        {note !== (d.note ?? "") && (
          <div className="mt-1 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setNote(d.note ?? "")}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => onUpdate(d.id, { note })}>
              Salvar nota
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

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

  useEffect(() => {
    load();
  }, [load]);

  const handleUpdate = async (id: string, patch: { status?: string; note?: string }) => {
    try {
      await markFn({ data: { id, ...patch } });
      toast.success("Divergência atualizada");
      load();
    } catch (e) {
      toast.error(mapServerError(e));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Pendências encontradas</p>
            <p className={cn("text-3xl font-bold", open.length > 0 ? "text-destructive" : "text-green-600")}>
              {open.length}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {open.length === 0
                ? "Nenhuma divergência aberta."
                : "Revise as divergências abaixo."}
            </p>
          </div>
          {open.length === 0 ? (
            <CheckCircle2 className="h-9 w-9 text-green-500" />
          ) : (
            <AlertTriangle className="h-9 w-9 text-destructive" />
          )}
        </div>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Histórico de verificações</h2>
        {runs.length === 0 ? (
          <Card className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma verificação ainda. Abra a aba “Verificar” para começar.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {runs.slice(0, 10).map((r) => (
              <Card key={r.id} className="p-3">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {r.period_start} → {r.period_end}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.triggered_by === "scheduled" ? "Automática" : "Manual"} ·{" "}
                      {format(new Date(r.started_at), "dd/MM HH:mm")}
                    </p>
                  </div>
                  <div className="text-right">
                    {r.status === "completed" ? (
                      r.divergences_count > 0 ? (
                        <Badge variant="destructive">
                          {r.divergences_count} problema{r.divergences_count > 1 ? "s" : ""}
                        </Badge>
                      ) : (
                        <Badge className="bg-green-500 text-white hover:bg-green-500">OK</Badge>
                      )
                    ) : r.status === "failed" ? (
                      <Badge variant="destructive">Falhou</Badge>
                    ) : (
                      <Badge variant="secondary">Em andamento</Badge>
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
          <h2 className="mb-2 text-sm font-semibold">Pendências</h2>
          <div className="space-y-2">
            {open.slice(0, 20).map((d) => (
              <DivergenceCard key={d.id} d={d} onUpdate={handleUpdate} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RunTab() {
  const runFn = useServerFn(runNow);
  const exportFn = useServerFn(exportRunCsv);
  const today = fmtDate(new Date());
  const [start, setStart] = useState<string>(fmtDate(startOfMonth(new Date())));
  const [end, setEnd] = useState<string>(today);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<any>(null);

  const handleRun = async () => {
    if (start > end) {
      toast.error("A data inicial não pode ser depois da data final");
      return;
    }

    setRunning(true);
    try {
      const res = await runFn({ data: { periodStart: start, periodEnd: end } });
      setLastRun(res);
      const n = (res as any).result.divergences.length;
      if (n === 0) toast.success("Tudo consistente ✓");
      else toast.warning(`${n} problema${n > 1 ? "s" : ""} encontrado${n > 1 ? "s" : ""}`);
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
      <Card className="border-dashed bg-muted/25 p-4">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <div>
            <p className="text-sm font-semibold">Verificação automática</p>
            <p className="mt-1 text-sm text-muted-foreground">
              O Cofre360 confere dados, transferências, parcelas, reembolsos e se os totais das telas estão consistentes.
            </p>
          </div>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Qual período deseja conferir?</p>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS().map((p) => (
            <Button
              key={p.label}
              variant="outline"
              size="sm"
              onClick={() => {
                setStart(p.start);
                setEnd(p.end);
              }}
              className={cn(start === p.start && end === p.end && "border-primary bg-primary/5")}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <Button onClick={handleRun} disabled={running} className="w-full" aria-label="Verificar agora">
          {running ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          {running ? "Verificando…" : "Verificar agora"}
        </Button>
      </Card>

      {lastRun && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Resultado</p>
              <p className="text-xs text-muted-foreground">
                {lastRun.result.divergences.length === 0
                  ? "Nenhuma divergência encontrada."
                  : `${lastRun.result.divergences.length} pendência${lastRun.result.divergences.length > 1 ? "s" : ""} para revisar.`}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
          </div>

          {lastRun.result.divergences.length === 0 ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Tudo consistente</span>
            </div>
          ) : (
            <div className="space-y-2">
              {lastRun.result.divergences.map((d: any, i: number) => (
                <div key={i} className="border-l-2 border-destructive py-1 pl-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {CHECK_LABEL[d.check_type as CheckType] ?? "Verificação"}
                    </Badge>
                    <p className="text-sm font-medium">{d.entity_label}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Esperado {formatSignedBRL(d.expected)} · Encontrado {formatSignedBRL(d.actual)} · Diferença{" "}
                    <span className="font-semibold text-destructive">{formatSignedBRL(d.delta)}</span>
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

function normalizeRuleForEdit(rule: ReconciliationRule): Partial<ReconciliationRule> {
  if (rule.check_type === "card") {
    return {
      ...rule,
      rule_kind: rule.rule_kind === "zero" ? "zero" : "equality",
    };
  }
  if (rule.check_type === "invoice") return { ...rule, rule_kind: "zero" };
  if (rule.check_type === "budget") return { ...rule, rule_kind: "equality" };
  return { ...rule };
}

function targetCopy(checkType?: CheckType) {
  if (checkType === "card") return "Todos os cartões";
  if (checkType === "invoice") return "Todas as faturas";
  if (checkType === "budget") return "Todos os orçamentos";
  return "Todos os itens deste tipo";
}

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
    } catch (e) {
      toast.error(mapServerError(e));
    } finally {
      setLoading(false);
    }
  }, [listFn]);

  useEffect(() => {
    load();
  }, [load]);

  const startNewRule = () => {
    setEditing({
      name: "",
      check_type: "invoice",
      rule_kind: "zero",
      tolerance_kind: "abs",
      tolerance_value: 0.02,
      target_ids: [],
      enabled: true,
    });
  };

  const handleTypeChange = (value: string) => {
    if (!editing) return;
    const checkType = value as CheckType;
    const ruleKind: RuleKind =
      checkType === "invoice" ? "zero" : checkType === "budget" ? "equality" : "equality";
    setEditing({
      ...editing,
      check_type: checkType,
      rule_kind: ruleKind,
      target_ids: [],
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name?.trim()) {
      toast.error("Dê um nome para o alerta");
      return;
    }

    try {
      await upsertFn({ data: editing });
      toast.success("Alerta salvo");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(mapServerError(e));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFn({ data: { id } });
      toast.success("Alerta excluído");
      load();
    } catch (e) {
      toast.error(mapServerError(e));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="border-dashed bg-muted/25 p-4">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <div>
            <p className="text-sm font-semibold">Esta parte é opcional</p>
            <p className="mt-1 text-sm text-muted-foreground">
              As verificações principais já funcionam automaticamente. Crie um alerta apenas se quiser uma conferência extra.
            </p>
          </div>
        </div>
      </Card>

      <Button onClick={startNewRule} className="w-full">
        <Plus className="mr-2 h-4 w-4" /> Criar alerta extra
      </Button>

      {rules.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">
          Nenhum alerta extra configurado. Você pode usar a reconciliação normalmente assim.
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {CHECK_LABEL[r.check_type]} · {RULE_KIND_LABEL[r.rule_kind]} · Margem{" "}
                    {r.tolerance_kind === "pct"
                      ? `${r.tolerance_value}%`
                      : `R$ ${Number(r.tolerance_value).toFixed(2).replace(".", ",")}`}
                  </p>
                  {r.check_type === "bank_account" && (
                    <Badge variant="secondary" className="mt-2 text-xs">
                      Regra antiga
                    </Badge>
                  )}
                  {!r.enabled && (
                    <Badge variant="secondary" className="mt-2 text-xs">
                      Desativado
                    </Badge>
                  )}
                </div>

                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditing(normalizeRuleForEdit(r))}
                    aria-label="Editar alerta"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label="Excluir alerta">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir alerta?</AlertDialogTitle>
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
        </div>
      )}

      {editing && (
        <Card className="space-y-4 border-primary p-4">
          <div>
            <p className="font-semibold">{editing.id ? "Editar alerta" : "Novo alerta"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Escolha o que deseja conferir. O Cofre360 cuida da regra técnica por você.
            </p>
          </div>

          <div>
            <Label>Nome do alerta</Label>
            <Input
              value={editing.name ?? ""}
              placeholder="Ex.: Conferir faturas"
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </div>

          <div>
            <Label>O que conferir?</Label>
            <Select value={editing.check_type} onValueChange={handleTypeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {editing.check_type === "bank_account" && (
                  <SelectItem value="bank_account" disabled>
                    Conta bancária — regra antiga
                  </SelectItem>
                )}
                <SelectItem value="card">Cartões</SelectItem>
                <SelectItem value="invoice">Faturas</SelectItem>
                <SelectItem value="budget">Orçamentos</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {CHECK_HELP[editing.check_type as CheckType] ??
                "As contas bancárias já são verificadas automaticamente."}
            </p>
          </div>

          {editing.check_type === "card" && (
            <div>
              <Label>Como conferir?</Label>
              <Select
                value={editing.rule_kind === "zero" ? "zero" : "equality"}
                onValueChange={(v) =>
                  setEditing({ ...editing, rule_kind: v as RuleKind })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equality">Saldo deve bater com as movimentações</SelectItem>
                  <SelectItem value="zero">Saldo deve estar zerado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <Label>Margem aceita</Label>
              <span className="text-xs text-muted-foreground">
                {targetCopy(editing.check_type as CheckType)}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_150px] gap-2">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editing.tolerance_value ?? 0}
                onChange={(e) =>
                  setEditing({ ...editing, tolerance_value: Number(e.target.value) })
                }
              />
              <Select
                value={editing.tolerance_kind}
                onValueChange={(v) =>
                  setEditing({ ...editing, tolerance_kind: v as ToleranceKind })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="abs">Em reais</SelectItem>
                  <SelectItem value="pct">Em %</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Ex.: R$ 0,02 evita alerta por pequenas diferenças de centavos.
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} className="flex-1" disabled={!editing.name?.trim()}>
              Salvar alerta
            </Button>
            <Button onClick={() => setEditing(null)} variant="outline" className="flex-1">
              Cancelar
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
