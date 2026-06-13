import { createFileRoute } from "@tanstack/react-router";
import { SmartLink as Link } from "@/components/SmartLink";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  RefreshCw,
  Eye,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { refreshInvestmentQuotes } from "@/lib/investments.functions";
import {
  valuate,
  ASSET_CLASS_LABELS,
  CRYPTO_COINGECKO_IDS,
  type Investment,
  type AssetClass,
} from "@/lib/investments-calc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
} from "recharts";

const ASSET_CLASS_OPTIONS: { value: AssetClass; label: string; icon: string }[] = [
  { value: "tesouro", label: "Tesouro Direto", icon: "🏦" },
  { value: "cdb", label: "CDB", icon: "💰" },
  { value: "cripto", label: "Criptomoeda", icon: "₿" },
  { value: "acao", label: "Ação (B3)", icon: "📈" },
  { value: "fii", label: "Fundo Imobiliário", icon: "🏢" },
  { value: "etf", label: "ETF", icon: "📊" },
  { value: "outro", label: "Outro", icon: "💎" },
];

const CRYPTO_CODES = Object.keys(CRYPTO_COINGECKO_IDS);

const normalizeNumber = (s: string) => s.replace(/[^\d,.-]/g, "").replace(",", ".");
const parseNum = (s: string) => {
  const n = parseFloat(normalizeNumber(s));
  return Number.isFinite(n) ? n : 0;
};

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
];

type FormState = {
  name: string;
  icon: string;
  asset_class: AssetClass;
  asset_code: string;
  quantity: string;
  purchase_price: string;
  value: string;
  purchase_date: string;
  yield_rate: string;
  admin_fee: string;
  maturity_date: string;
};

const emptyForm = (cls: AssetClass = "tesouro"): FormState => ({
  name: "",
  icon: ASSET_CLASS_OPTIONS.find((o) => o.value === cls)?.icon || "📈",
  asset_class: cls,
  asset_code: "",
  quantity: "",
  purchase_price: "",
  value: "",
  purchase_date: new Date().toISOString().slice(0, 10),
  yield_rate: "",
  admin_fee: "",
  maturity_date: "",
});

function isVariable(cls: string) {
  return ["cripto", "acao", "fii", "etf"].includes(cls);
}

function InvestPage() {
  const [portfolio, setPortfolio] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Investment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [targetDate, setTargetDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );

  const refreshFn = useServerFn(refreshInvestmentQuotes);

  const fetchInvestments = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("investments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      toast.error("Erro ao carregar investimentos");
    } else {
      setPortfolio((data || []) as unknown as Investment[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInvestments();
  }, [fetchInvestments]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await refreshFn();
      if (res?.updated > 0) {
        toast.success(`${res.updated} cotação(ões) atualizadas`);
      } else {
        toast.info("Nenhuma cotação para atualizar");
      }
      await fetchInvestments();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar cotações");
    } finally {
      setRefreshing(false);
    }
  }, [refreshFn, fetchInvestments]);

  // Auto-refresh on mount if any quote is stale (>15min)
  useEffect(() => {
    if (loading || portfolio.length === 0) return;
    const stale = portfolio.some((i) => {
      const cls = (i.asset_class || "").toLowerCase();
      if (cls !== "cripto" && cls !== "tesouro") return false;
      if (!i.asset_code) return false;
      if (!i.last_quote_at) return true;
      const age = Date.now() - new Date(i.last_quote_at).getTime();
      return age > 15 * 60 * 1000;
    });
    if (stale) handleRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Valuations
  const target = useMemo(() => new Date(targetDate + "T12:00:00"), [targetDate]);
  const valuations = useMemo(
    () => portfolio.map((inv) => ({ inv, val: valuate(inv, target) })),
    [portfolio, target]
  );

  const totalInvested = valuations.reduce((s, v) => s + v.val.invested, 0);
  const totalGross = valuations.reduce((s, v) => s + v.val.grossValue, 0);
  const totalNet = valuations.reduce((s, v) => s + v.val.netValue, 0);
  const totalPnL = totalGross - totalInvested;
  const pnlPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  // Pie data by asset_class
  const pieData = useMemo(() => {
    const map = new Map<string, number>();
    for (const { inv, val } of valuations) {
      const key = ASSET_CLASS_LABELS[(inv.asset_class || "outro") as AssetClass] || inv.type || "Outro";
      map.set(key, (map.get(key) || 0) + val.grossValue);
    }
    return Array.from(map, ([name, value]) => ({ name, value })).filter((d) => d.value > 0);
  }, [valuations]);

  const openAdd = (cls?: AssetClass) => {
    setForm(emptyForm(cls));
    setEditing(null);
    setShowAdd(true);
  };

  const openEdit = (inv: Investment) => {
    setEditing(inv);
    setForm({
      name: inv.name || "",
      icon: inv.icon || "📈",
      asset_class: (inv.asset_class as AssetClass) || "outro",
      asset_code: inv.asset_code || "",
      quantity: inv.quantity != null ? String(inv.quantity).replace(".", ",") : "",
      purchase_price:
        inv.purchase_price != null ? String(inv.purchase_price).replace(".", ",") : "",
      value: inv.value != null ? String(inv.value).replace(".", ",") : "",
      purchase_date: inv.purchase_date || new Date().toISOString().slice(0, 10),
      yield_rate: inv.yield_rate != null ? String(inv.yield_rate).replace(".", ",") : "",
      admin_fee: inv.admin_fee != null ? String(inv.admin_fee).replace(".", ",") : "",
      maturity_date: inv.maturity_date || "",
    });
    setShowAdd(true);
  };

  const handleSave = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Faça login para salvar investimentos");
        return;
      }
      const variable = isVariable(form.asset_class);
      const qty = parseNum(form.quantity);
      const px = parseNum(form.purchase_price);
      const value = variable ? qty * px : parseNum(form.value);
      const payload: any = {
        name: form.name,
        icon: form.icon,
        type: ASSET_CLASS_LABELS[form.asset_class] || "Outro",
        asset_class: form.asset_class,
        asset_code: form.asset_code || null,
        quantity: form.quantity ? qty : null,
        purchase_price: form.purchase_price ? px : null,
        purchase_date: form.purchase_date || null,
        yield_rate: form.yield_rate ? parseNum(form.yield_rate) : null,
        admin_fee: form.admin_fee ? parseNum(form.admin_fee) : null,
        maturity_date: form.maturity_date || null,
        value: value || 0,
        change: 0,
      };
      if (editing) {
        const { error } = await supabase
          .from("investments")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Investimento atualizado");
      } else {
        const { error } = await supabase
          .from("investments")
          .insert([{ ...payload, user_id: user.id }]);
        if (error) throw error;
        toast.success("Investimento adicionado");
      }
      setShowAdd(false);
      setEditing(null);
      await fetchInvestments();
      // Refresh quotes if applicable
      if (form.asset_code && (form.asset_class === "cripto" || form.asset_class === "tesouro")) {
        handleRefresh();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao salvar");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("investments").delete().eq("id", deleteId);
    if (error) toast.error("Erro ao excluir");
    else {
      toast.success("Investimento excluído");
      fetchInvestments();
    }
    setDeleteId(null);
  };

  const variable = isVariable(form.asset_class);
  const fixedIncome = form.asset_class === "tesouro" || form.asset_class === "cdb";

  return (
    <div className="animate-page-enter flex flex-col gap-5 px-4 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="interactive-button flex h-9 w-9 items-center justify-center rounded-xl bg-card">
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Investimentos</h1>
            <p className="text-sm text-muted-foreground">Sua carteira em tempo real</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label="Atualizar cotações"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => openAdd()}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
            aria-label="Adicionar"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Resumo */}
      <div className="interactive-card rounded-2xl bg-gradient-to-br from-primary/20 to-card p-5 animate-stagger-in">
        <p className="text-sm text-muted-foreground">Patrimônio bruto</p>
        <p className="text-2xl font-bold text-foreground tabular-nums mt-1">{fmtBRL(totalGross)}</p>
        <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">Investido: <strong className="text-foreground">{fmtBRL(totalInvested)}</strong></span>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">Líquido: <strong className="text-foreground">{fmtBRL(totalNet)}</strong></span>
        </div>
        {totalInvested > 0 && (
          <div className="mt-2 flex items-center gap-1">
            {totalPnL >= 0 ? (
              <TrendingUp className="h-3 w-3 text-primary" />
            ) : (
              <TrendingDown className="h-3 w-3 text-destructive" />
            )}
            <span className={`text-xs font-medium ${totalPnL >= 0 ? "text-primary" : "text-destructive"}`}>
              {totalPnL >= 0 ? "+" : ""}{fmtBRL(totalPnL)} ({pnlPct.toFixed(2)}%)
            </span>
          </div>
        )}
      </div>

      {/* Data alvo para projeção */}
      <div className="rounded-2xl bg-card p-4">
        <label className="text-xs text-muted-foreground mb-1 block">Projetar valor para a data</label>
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="w-full rounded-xl bg-accent/40 px-3 py-2 text-sm text-foreground outline-none"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Renda fixa: aplica juros compostos, IR regressivo e taxa de administração até essa data.
        </p>
      </div>

      {/* Gráfico de alocação */}
      {pieData.length > 0 && (
        <div className="rounded-2xl bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-2">Alocação por classe</h2>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip
                  formatter={(v: any) => fmtBRL(Number(v))}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {pieData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <div className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {d.name} {((d.value / totalGross) * 100).toFixed(1)}%
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de investimentos */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Meus ativos</h2>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : valuations.length === 0 ? (
          <div className="rounded-2xl bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">Nenhum investimento cadastrado</p>
            <Button onClick={() => openAdd()}>Adicionar primeiro investimento</Button>
          </div>
        ) : (
          valuations.map(({ inv, val }, i) => {
            const positive = val.grossPnL >= 0;
            return (
              <div
                key={inv.id}
                className="group interactive-card flex items-center gap-3 rounded-2xl bg-card p-4 animate-stagger-in"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg">
                  {inv.icon}
                </div>
                <button
                  onClick={() => setDetail(inv)}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-sm font-medium text-foreground truncate">{inv.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {ASSET_CLASS_LABELS[(inv.asset_class as AssetClass) || "outro"] || inv.type}
                    {inv.asset_code ? ` • ${inv.asset_code}` : ""}
                  </p>
                </button>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    {fmtBRL(val.grossValue)}
                  </p>
                  <div className="flex items-center justify-end gap-0.5">
                    {positive ? (
                      <TrendingUp className="h-2.5 w-2.5 text-primary" />
                    ) : (
                      <TrendingDown className="h-2.5 w-2.5 text-destructive" />
                    )}
                    <span className={`text-[10px] font-medium tabular-nums ${positive ? "text-primary" : "text-destructive"}`}>
                      {positive ? "+" : ""}{val.pctChange.toFixed(2)}%
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setDetail(inv)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-muted-foreground hover:text-foreground"
                    aria-label="Detalhes"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => openEdit(inv)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-muted-foreground hover:text-foreground"
                    aria-label="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteId(inv.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20"
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-[92vw] max-h-[85vh] overflow-y-auto rounded-2xl bg-background">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar investimento" : "Novo investimento"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tipo de ativo</label>
              <select
                value={form.asset_class}
                onChange={(e) => {
                  const cls = e.target.value as AssetClass;
                  const icon = ASSET_CLASS_OPTIONS.find((o) => o.value === cls)?.icon || form.icon;
                  setForm({ ...form, asset_class: cls, icon });
                }}
                className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none"
              >
                {ASSET_CLASS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={form.asset_class === "tesouro" ? "Ex: Tesouro Selic 2027" : "Ex: Bitcoin"}
                className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none"
              />
            </div>

            {form.asset_class === "cripto" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Código (CoinGecko)</label>
                <select
                  value={form.asset_code}
                  onChange={(e) => setForm({ ...form, asset_code: e.target.value })}
                  className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none"
                >
                  <option value="">Selecione…</option>
                  {CRYPTO_CODES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}

            {form.asset_class === "tesouro" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Código do título</label>
                <input
                  value={form.asset_code}
                  onChange={(e) => setForm({ ...form, asset_code: e.target.value })}
                  placeholder="Ex: Tesouro Selic 2027"
                  className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Use o nome exato do título conforme Tesouro Direto (para cotação automática).
                </p>
              </div>
            )}

            {variable ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Quantidade</label>
                  <input
                    inputMode="decimal"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    placeholder="0"
                    className="w-full rounded-xl bg-card px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Preço de compra (R$)</label>
                  <input
                    inputMode="decimal"
                    value={form.purchase_price}
                    onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                    placeholder="0,00"
                    className="w-full rounded-xl bg-card px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Valor investido (R$)</label>
                <input
                  inputMode="decimal"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder="0,00"
                  className="w-full rounded-xl bg-card px-3 py-2 text-sm outline-none"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Data de compra</label>
              <input
                type="date"
                value={form.purchase_date}
                onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                className="w-full rounded-xl bg-card px-3 py-2 text-sm outline-none"
              />
            </div>

            {fixedIncome && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Rentabilidade (% a.a.)</label>
                    <input
                      inputMode="decimal"
                      value={form.yield_rate}
                      onChange={(e) => setForm({ ...form, yield_rate: e.target.value })}
                      placeholder="Ex: 12,5"
                      className="w-full rounded-xl bg-card px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Taxa adm. (% a.a.)</label>
                    <input
                      inputMode="decimal"
                      value={form.admin_fee}
                      onChange={(e) => setForm({ ...form, admin_fee: e.target.value })}
                      placeholder="0"
                      className="w-full rounded-xl bg-card px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Vencimento</label>
                  <input
                    type="date"
                    value={form.maturity_date}
                    onChange={(e) => setForm({ ...form, maturity_date: e.target.value })}
                    className="w-full rounded-xl bg-card px-3 py-2 text-sm outline-none"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditing(null); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name}>
              {editing ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader>
            <DialogTitle>Excluir Investimento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza? Essa ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-[92vw] max-h-[85vh] overflow-y-auto rounded-2xl bg-background">
          {detail && (() => {
            const v = valuate(detail, target);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="text-xl">{detail.icon}</span>
                    {detail.name}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3 text-sm">
                  <div className="rounded-xl bg-card p-3">
                    <p className="text-xs text-muted-foreground">Classe</p>
                    <p className="font-medium">
                      {ASSET_CLASS_LABELS[(detail.asset_class as AssetClass) || "outro"] || detail.type}
                      {detail.asset_code && <span className="text-muted-foreground"> • {detail.asset_code}</span>}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-[10px] text-muted-foreground">Investido</p>
                      <p className="font-semibold tabular-nums">{fmtBRL(v.invested)}</p>
                    </div>
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-[10px] text-muted-foreground">Valor bruto</p>
                      <p className="font-semibold tabular-nums">{fmtBRL(v.grossValue)}</p>
                    </div>
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-[10px] text-muted-foreground">Lucro/Prejuízo</p>
                      <p className={`font-semibold tabular-nums ${v.grossPnL >= 0 ? "text-primary" : "text-destructive"}`}>
                        {v.grossPnL >= 0 ? "+" : ""}{fmtBRL(v.grossPnL)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{v.pctChange.toFixed(2)}%</p>
                    </div>
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-[10px] text-muted-foreground">Valor líquido</p>
                      <p className="font-semibold tabular-nums">{fmtBRL(v.netValue)}</p>
                    </div>
                  </div>
                  {(v.estimatedTax > 0 || v.estimatedAdminFee > 0) && (
                    <div className="rounded-xl bg-accent/30 p-3 text-xs space-y-1">
                      {v.estimatedAdminFee > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Taxa de administração</span>
                          <span className="tabular-nums">-{fmtBRL(v.estimatedAdminFee)}</span>
                        </div>
                      )}
                      {v.estimatedTax > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">IR estimado</span>
                          <span className="tabular-nums">-{fmtBRL(v.estimatedTax)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {detail.current_price != null && (
                    <p className="text-[10px] text-muted-foreground">
                      Cotação atual: {fmtBRL(detail.current_price)}
                      {detail.last_quote_at && ` • ${new Date(detail.last_quote_at).toLocaleString("pt-BR")}`}
                    </p>
                  )}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Simular para data</label>
                    <input
                      type="date"
                      value={targetDate}
                      onChange={(e) => setTargetDate(e.target.value)}
                      className="w-full rounded-xl bg-card px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDetail(null)}>Fechar</Button>
                  <Button onClick={() => { openEdit(detail); setDetail(null); }}>Editar</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/invest")({
  head: () => ({
    meta: [
      { title: "Investimentos — Cofre 360" },
      { name: "description", content: "Acompanhe seus investimentos com cotações em tempo real" },
    ],
  }),
  component: InvestPage,
});
