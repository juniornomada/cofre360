import { useCallback, useEffect, useState } from "react";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type TransactionTemplate = {
  id: string;
  name: string;
  icon: string | null;
  category: string;
  type: "expense" | "income" | "transfer";
  bank_account_id: string | null;
  card_id: string | null;
};

export function TransactionTemplates({
  open,
  current,
  onApply,
}: {
  open: boolean;
  current: Omit<TransactionTemplate, "id">;
  onApply: (template: TransactionTemplate) => void;
}) {
  const [templates, setTemplates] = useState<TransactionTemplate[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("transaction_templates")
      .select("id,name,icon,category,type,bank_account_id,card_id")
      .order("created_at", { ascending: false })
      .limit(12);
    if (!error) setTemplates((data || []) as TransactionTemplate[]);
  }, []);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const save = async () => {
    if (!current.name.trim()) {
      toast.error("Informe o nome antes de salvar um modelo.");
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão não encontrada");
      const { error } = await (supabase as any).from("transaction_templates").insert({
        user_id: session.user.id,
        name: current.name.trim(),
        icon: current.icon,
        category: current.category,
        type: current.type,
        bank_account_id: current.bank_account_id,
        card_id: current.card_id,
      });
      if (error) throw error;
      toast.success("Modelo salvo. Valor e parcelamento não foram armazenados.");
      await load();
    } catch (error) {
      console.error("template save error", error);
      toast.error("Não foi possível salvar o modelo.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="border-b border-border/40 bg-card/35 px-4 py-2">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={save}
          disabled={saving || !current.name.trim()}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 text-[11px] font-semibold text-primary disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
          Salvar modelo
        </button>
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onApply(template)}
            className="inline-flex h-8 max-w-[180px] shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-[11px] text-foreground hover:border-primary/40"
            title={`${template.name} · ${template.category}`}
          >
            <span>{template.icon || "📄"}</span>
            <span className="truncate">{template.name}</span>
          </button>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">Modelos reaproveitam nome, categoria e conta/cartão; valor e parcelas sempre começam novos.</p>
    </div>
  );
}
