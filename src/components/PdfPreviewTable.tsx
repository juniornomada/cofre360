import { Trash2, Pencil, Check, X, AlertTriangle, RefreshCw, Loader2, Settings2 } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type PdfPreviewRow = {
  date: string;
  name: string;
  amount: number;
  type: "expense" | "income";
  isFuture?: boolean;
  confidence_score?: number;
  approved?: boolean;
  original_amount_text?: string;
};

type Props = {
  rows: PdfPreviewRow[];
  onChange: (rows: PdfPreviewRow[]) => void;
  itemLabel?: string; // "transações" | "movimentações"
  rawPdfText?: string | null;
  documentKind?: "card_invoice" | "bank_statement";
};

import { aiRetrySingleTransaction } from "../server-fns/parse-card-invoice";

export function PdfPreviewTable({ rows, onChange, itemLabel = "transações", rawPdfText, documentKind = "card_invoice" }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [retryingIndex, setRetryingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<PdfPreviewRow | null>(null);

  const [confThreshold, setConfThreshold] = useState(80);
  const [divThreshold, setDivThreshold] = useState(0.01);

  const startEdit = (i: number) => {
    setEditingIndex(i);
    setDraft({ ...rows[i] });
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setDraft(null);
  };

  const saveEdit = () => {
    if (editingIndex === null || !draft) return;
    const next = [...rows];
    next[editingIndex] = {
      ...draft,
      amount: Math.abs(Number(draft.amount) || 0),
      name: draft.name.trim() || rows[editingIndex].name,
    };
    onChange(next);
    setEditingIndex(null);
    setDraft(null);
  };

  const removeRow = (i: number) => {
    if (editingIndex === i) cancelEdit();
    onChange(rows.filter((_, idx) => idx !== i));
  };

  const retryTransaction = async (i: number) => {
    if (!rawPdfText) return;
    setRetryingIndex(i);
    try {
      const result = await aiRetrySingleTransaction({
        data: {
          rawText: rawPdfText,
          transaction: rows[i] as any,
          kind: documentKind
        }
      });
      const next = [...rows];
      next[i] = { ...rows[i], ...result };
      onChange(next);
    } catch (err) {
      console.error("Retry failed:", err);
    } finally {
      setRetryingIndex(null);
    }
  };

  const visibleRows = rows.slice(0, 50);

  const hasDivergence = (r: PdfPreviewRow) => {
    if (!r.original_amount_text) return false;
    // Clean original text to extract numbers (e.g. "R$ 1.234,56" -> "1234.56")
    const cleanOrig = r.original_amount_text.replace(/[^\d,.-]/g, "").replace(",", ".");
    const numOrig = parseFloat(cleanOrig);
    if (isNaN(numOrig)) return true;
    // Difference > 0.01 is considered divergence
    return Math.abs(numOrig - r.amount) > 0.01;
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Button 
          variant="outline" 
          size="sm" 
          className="h-7 text-[10px] gap-1.5 rounded-lg"
          onClick={() => onChange(rows.map(r => ({ ...r, approved: true })))}
        >
          <Check className="h-3 w-3" />
          Aprovar todas
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-7 text-[10px] gap-1.5 rounded-lg"
          onClick={() => onChange(rows.map(r => ({ ...r, approved: false })))}
        >
          <X className="h-3 w-3" />
          Rejeitar todas
        </Button>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="p-2 w-[32px]"></th>
              <th className="text-left p-2 w-[88px]">Data</th>
              <th className="text-left p-2">Estabelecimento / Descrição</th>
              <th className="text-right p-2 w-[110px]">Valor</th>
              <th className="p-2 w-[64px]"></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r, i) => {
              const isEditing = editingIndex === i;
              const isApproved = r.approved !== false;
              
              const toggleApproval = (e: React.MouseEvent) => {
                e.stopPropagation();
                const next = [...rows];
                next[i] = { ...r, approved: !isApproved };
                onChange(next);
              };

              if (isEditing && draft) {
                return (
                  <tr key={i} className="border-t border-border bg-accent/40">
                    <td className="p-1.5"></td>
                    <td className="p-1.5">
                      <Input
                        type="date"
                        value={draft.date}
                        onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        className="h-7 text-xs px-2 rounded-md"
                      />
                    </td>
                    <td className="p-1.5">
                      <Input
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        className="h-7 text-xs px-2 rounded-md"
                        autoFocus
                      />
                    </td>
                    <td className="p-1.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setDraft({ ...draft, type: draft.type === "expense" ? "income" : "expense" })}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${draft.type === "income" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}
                          title="Alternar tipo"
                        >
                          {draft.type === "income" ? "+" : "−"}
                        </button>
                        <Input
                          type="number"
                          step="0.01"
                          value={draft.amount}
                          onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                          className="h-7 text-xs px-2 rounded-md text-right tabular-nums"
                        />
                      </div>
                    </td>
                    <td className="p-1.5">
                      <div className="flex items-center justify-end gap-0.5">
                        <button onClick={saveEdit} className="p-1 rounded hover:bg-primary/15 text-primary" title="Salvar">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={cancelEdit} className="p-1 rounded hover:bg-accent text-muted-foreground" title="Cancelar">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
              <tr 
                key={i} 
                className={`border-t border-border group transition-colors hover:bg-muted/30 cursor-pointer ${!isApproved ? "opacity-40 grayscale" : ""} ${r.isFuture ? "bg-muted/10" : ""} ${(isLowConfidence(r) || hasDivergence(r)) && isApproved ? "bg-amber-50/50" : ""}`}
                onClick={() => startEdit(i)}
                title={isApproved ? "Clique para editar" : "Rejeitado"}
              >
                  <td className="p-1.5" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={toggleApproval}
                      className={`p-1 rounded-md transition-colors ${isApproved ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-muted"}`}
                      title={isApproved ? "Rejeitar lançamento" : "Aprovar lançamento"}
                    >
                      {isApproved ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                  <td className="p-2 text-muted-foreground whitespace-nowrap">{r.date}</td>
                  <td className="p-2 truncate max-w-[140px]">
                    <span className="align-middle">{r.name}</span>
                    {r.isFuture && (
                      <span className="ml-1 inline-block align-middle text-[9px] font-semibold px-1 py-0.5 rounded bg-primary/10 text-primary">
                      futura
                    </span>
                  )}
                  {isLowConfidence(r) && (
                    <span className="ml-1 inline-block align-middle text-[9px] font-semibold px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                      revisar ({r.confidence_score}%)
                    </span>
                  )}
                </td>
                <td className={`p-2 text-right font-medium tabular-nums ${r.type === "income" ? "text-primary" : "text-destructive"}`}>
                  <div className="flex items-center justify-end gap-1.5">
                    {hasDivergence(r) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent className="text-[10px] p-2 max-w-[200px]">
                          O valor extraído (R$ {r.amount.toFixed(2)}) diverge do texto lido no PDF ("{r.original_amount_text}").
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <span>{r.type === "expense" ? "-" : "+"}R$ {r.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                </td>
                <td className="p-1.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {rawPdfText && (isLowConfidence(r) || hasDivergence(r)) && (
                      <button 
                        onClick={() => retryTransaction(i)} 
                        disabled={retryingIndex === i}
                        className="p-1 rounded hover:bg-accent text-primary disabled:opacity-50" 
                        title="Reprocessar com IA"
                      >
                        {retryingIndex === i ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                    <button onClick={() => startEdit(i)} className="p-1 rounded hover:bg-accent text-muted-foreground" title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => removeRow(i)} className="p-1 rounded hover:bg-destructive/15 text-destructive" title="Remover">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > 50 && (
          <p className="text-[10px] text-muted-foreground text-center py-1">
            Mostrando 50 de {rows.length} {itemLabel}. Importe e edite as restantes em Transações.
          </p>
        )}
        {rows.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-3">Nenhuma linha — adicione um PDF novamente.</p>
        )}
      </div>
    </div>
  </TooltipProvider>
);
}
