import { Trash2, Pencil, Check, X } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

export type PdfPreviewRow = {
  date: string;
  name: string;
  amount: number;
  type: "expense" | "income";
  isFuture?: boolean;
};

type Props = {
  rows: PdfPreviewRow[];
  onChange: (rows: PdfPreviewRow[]) => void;
  itemLabel?: string; // "transações" | "movimentações"
};

export function PdfPreviewTable({ rows, onChange, itemLabel = "transações" }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<PdfPreviewRow | null>(null);

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

  const visibleRows = rows.slice(0, 50);

  return (
    <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            <th className="text-left p-2 w-[88px]">Data</th>
            <th className="text-left p-2">Estabelecimento / Descrição</th>
            <th className="text-right p-2 w-[110px]">Valor</th>
            <th className="p-2 w-[64px]"></th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r, i) => {
            const isEditing = editingIndex === i;
            if (isEditing && draft) {
              return (
                <tr key={i} className="border-t border-border bg-accent/40">
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
                className={`border-t border-border group transition-colors hover:bg-muted/30 cursor-pointer ${r.isFuture ? "bg-muted/10" : ""}`}
                onClick={() => startEdit(i)}
                title="Clique para editar"
              >
                <td className="p-2 text-muted-foreground whitespace-nowrap">{r.date}</td>
                <td className="p-2 truncate max-w-[140px]">
                  <span className="align-middle">{r.name}</span>
                  {r.isFuture && (
                    <span className="ml-1 inline-block align-middle text-[9px] font-semibold px-1 py-0.5 rounded bg-primary/10 text-primary">
                      futura
                    </span>
                  )}
                </td>
                <td className={`p-2 text-right font-medium tabular-nums ${r.type === "income" ? "text-primary" : "text-destructive"}`}>
                  {r.type === "expense" ? "-" : "+"}R$ {r.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </td>
                <td className="p-1.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
  );
}
