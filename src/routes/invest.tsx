import { createFileRoute } from "@tanstack/react-router";
import { SmartLink as Link } from "@/components/SmartLink";
import { ArrowLeft, TrendingUp, TrendingDown, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";


interface Investment {
  id: string;
  name: string;
  icon: string;
  value: number;
  change: number;
  type: string;
}


const typeOptions = ["Renda Fixa", "ETF", "Ações", "FII", "Crypto"];
const iconOptions = ["🏦", "📊", "🇺🇸", "⛽", "🏢", "₿", "💎", "🪙", "📈", "🏠", "💰", "🔒"];

function InvestPage() {
  const [portfolio, setPortfolio] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<Investment | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newItem, setNewItem] = useState<Omit<Investment, "id">>({
    name: "", icon: "📈", value: 0, change: 0, type: "Renda Fixa",
  });



  const fetchInvestments = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.from("investments").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setPortfolio(data || []);
    } catch (error: any) {
      console.error("Error fetching investments:", error);
      toast.error("Erro ao carregar investimentos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvestments();
  }, [fetchInvestments]);

  const totalValue = portfolio.reduce((s, p) => s + p.value, 0);

  const handleSaveEdit = async () => {
    if (!editItem) return;
    try {
      const { error } = await supabase
        .from("investments")
        .update({
          name: editItem.name,
          icon: editItem.icon,
          value: editItem.value,
          change: editItem.change,
          type: editItem.type,
        })
        .eq("id", editItem.id);
      if (error) throw error;
      toast.success("Investimento atualizado");
      setShowEditDialog(false);
      setEditItem(null);
      fetchInvestments();
    } catch (error: any) {
      toast.error("Erro ao atualizar");
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteId === null) return;
    try {
      const { error } = await supabase.from("investments").delete().eq("id", deleteId);
      if (error) throw error;
      toast.success("Investimento excluído");
      setShowDeleteDialog(false);
      setDeleteId(null);
      fetchInvestments();
    } catch (error: any) {
      toast.error("Erro ao excluir");
    }
  };

  const handleAdd = async () => {
    try {
      const { error } = await supabase.from("investments").insert([newItem]);
      if (error) throw error;
      toast.success("Investimento adicionado");
      setShowAddDialog(false);
      setNewItem({ name: "", icon: "📈", value: 0, change: 0, type: "Renda Fixa" });
      fetchInvestments();
    } catch (error: any) {
      toast.error("Erro ao adicionar");
    }
  };

  // Allocation calc
  const typeGroups = portfolio.reduce((acc, p) => {
    acc[p.type] = (acc[p.type] || 0) + p.value;
    return acc;
  }, {} as Record<string, number>);


  const allocationColors: Record<string, string> = {
    "Renda Fixa": "bg-chart-1",
    "ETF": "bg-chart-2",
    "Ações": "bg-chart-3",
    "FII": "bg-chart-4",
    "Crypto": "bg-chart-5",
  };

  return (
    <div className="animate-page-enter flex flex-col gap-6 px-4 pt-6 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="interactive-button flex h-9 w-9 items-center justify-center rounded-xl bg-card">
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Investimentos</h1>
            <p className="text-sm text-muted-foreground">Sua carteira</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Portfolio summary */}
      <div className="interactive-card rounded-2xl bg-gradient-to-br from-primary/20 to-card p-5 animate-stagger-in" style={{ animationDelay: "60ms" }}>
        <p className="text-sm text-muted-foreground">Patrimônio investido</p>
        <p className="text-2xl font-bold text-foreground tabular-nums mt-1">
          R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </p>
        <div className="mt-2 flex items-center gap-1">
          <TrendingUp className="h-3 w-3 text-primary" />
          <span className="text-xs font-medium text-primary">+R$ 320,00 (1.0%) este mês</span>
        </div>
      </div>

      {/* Asset allocation */}
      {totalValue > 0 && (
        <div className="rounded-2xl bg-card p-4 animate-stagger-in" style={{ animationDelay: "120ms" }}>
          <h2 className="text-sm font-semibold text-foreground mb-3">Alocação</h2>
          <div className="flex h-3 rounded-full overflow-hidden bg-accent">
            {Object.entries(typeGroups).map(([type, val]) => (
              <div key={type} className={`${allocationColors[type] || "bg-chart-1"} h-full`} style={{ width: `${(val / totalValue) * 100}%` }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            {Object.entries(typeGroups).map(([type, val]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className={`h-2 w-2 rounded-full ${allocationColors[type] || "bg-chart-1"}`} />
                <span className="text-[10px] text-muted-foreground">{type} {((val / totalValue) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assets list */}
      <div className="flex flex-col gap-2">
        {portfolio.map((asset, i) => {
          const isPositive = asset.change >= 0;
          return (
            <div
              key={asset.id}
              className="group interactive-card flex items-center gap-3 rounded-2xl bg-card p-4 relative animate-stagger-in"
              style={{ animationDelay: `${180 + i * 50}ms` }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg">
                {asset.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{asset.name}</p>
                <p className="text-[10px] text-muted-foreground">{asset.type}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground tabular-nums">
                  R$ {asset.value.toLocaleString("pt-BR")}
                </p>
                <div className="flex items-center justify-end gap-0.5">
                  {isPositive ? (
                    <TrendingUp className="h-2.5 w-2.5 text-primary" />
                  ) : (
                    <TrendingDown className="h-2.5 w-2.5 text-destructive" />
                  )}
                  <span className={`text-[10px] font-medium tabular-nums ${isPositive ? "text-primary" : "text-destructive"}`}>
                    {isPositive ? "+" : ""}{asset.change}%
                  </span>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => { setEditItem({ ...asset }); setShowEditDialog(true); }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => { setDeleteId(asset.id); setShowDeleteDialog(true); }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {portfolio.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum investimento cadastrado</p>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader>
            <DialogTitle>Editar Investimento</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Ícone</label>
                <div className="flex flex-wrap gap-2">
                  {iconOptions.map(ic => (
                    <button
                      key={ic}
                      onClick={() => setEditItem({ ...editItem, icon: ic })}
                      className={`text-xl p-1 rounded-lg transition-colors ${editItem.icon === ic ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-accent"}`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
                <input
                  value={editItem.name}
                  onChange={e => setEditItem({ ...editItem, name: e.target.value })}
                  className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
                <select
                  value={editItem.type}
                  onChange={e => setEditItem({ ...editItem, type: e.target.value })}
                  className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none"
                >
                  {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editItem.value}
                  onChange={e => setEditItem({ ...editItem, value: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Variação (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editItem.change}
                  onChange={e => setEditItem({ ...editItem, change: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader>
            <DialogTitle>Excluir Investimento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este investimento? Essa ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-[90vw] rounded-2xl bg-background">
          <DialogHeader>
            <DialogTitle>Novo Investimento</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ícone</label>
              <div className="flex flex-wrap gap-2">
                {iconOptions.map(ic => (
                  <button
                    key={ic}
                    onClick={() => setNewItem({ ...newItem, icon: ic })}
                    className={`text-xl p-1 rounded-lg transition-colors ${newItem.icon === ic ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-accent"}`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
              <input
                value={newItem.name}
                onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                placeholder="Ex: Tesouro Selic"
                className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
              <select
                value={newItem.type}
                onChange={e => setNewItem({ ...newItem, type: e.target.value })}
                className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none"
              >
                {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                value={newItem.value || ""}
                onChange={e => setNewItem({ ...newItem, value: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Variação (%)</label>
              <input
                type="number"
                step="0.01"
                value={newItem.change || ""}
                onChange={e => setNewItem({ ...newItem, change: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={!newItem.name || !newItem.value}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
 }

 export const Route = createFileRoute("/invest")({
   head: () => ({
     meta: [
       { title: "Investimentos — Cofre 360" },
       { name: "description", content: "Acompanhe seus investimentos" },
     ],
   }),
   component: InvestPage,
 });
