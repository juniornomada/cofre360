import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { categorizeTransaction } from "@/lib/categorize-transaction";
import { restoreAccents } from "@/lib/restore-accents";
import { parseCardInvoicePdf } from "../server-fns/parse-card-invoice";
import { PdfPreviewTable } from "@/components/PdfPreviewTable";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankAccountId: string;
  bankAccountName: string;
  onSuccess: () => void;
};

type ParsedRow = {
  date: string;
  name: string;
  amount: number;
  type: "expense" | "income";
};

type TransactionInsert = TablesInsert<"transactions">;
type ExistingTransaction = Pick<Tables<"transactions">, "date" | "name" | "amount" | "type" | "bank_account_id">;

function normalize(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function buildDedupKey(input: { accountId: string; date: string; name: string; amount: number; type: string }) {
  return [
    input.accountId,
    input.date.trim(),
    normalize(input.name).replace(/\s+/g, " "),
    Number(input.amount).toFixed(2),
    input.type,
  ].join("|");
}

async function fetchExistingForAccount(accountId: string) {
  const PAGE = 1000;
  const rows: ExistingTransaction[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("date, name, amount, type, bank_account_id")
      .eq("bank_account_id", accountId)
      .range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    const page = (data ?? []) as ExistingTransaction[];
    rows.push(...page);
    if (page.length < PAGE) return { data: rows, error: null };
  }
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
}

export function PdfStatementImportDialog({ open, onOpenChange, bankAccountId, bankAccountName, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [dedupResult, setDedupResult] = useState<{ toImport: TransactionInsert[]; duplicateCount: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFileName("");
    setParsing(false);
    setError("");
    setPreview([]);
    setDedupResult(null);
    setChecking(false);
    setSaving(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Selecione um arquivo PDF.");
      return;
    }
    setFileName(file.name);
    setParsing(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const result = await parseCardInvoicePdf({ data: { fileBase64, fileName: file.name, kind: "bank_statement" } });
      const rows: ParsedRow[] = (result.transactions || []).map((t) => ({
        date: t.date,
        name: restoreAccents(t.name),
        amount: Math.abs(Number(t.amount) || 0),
        type: t.type,
      }));
      if (rows.length === 0) {
        setError("Nenhuma movimentação detectada no PDF.");
      }
      setPreview(rows);
    } catch (err: any) {
      setError(err?.message || "Erro ao processar o PDF.");
      setPreview([]);
    } finally {
      setParsing(false);
    }
  };

  const handleCheckDuplicates = async () => {
    setChecking(true);
    setError("");
    const { data: existing, error: existErr } = await fetchExistingForAccount(bankAccountId);
    if (existErr || !existing) {
      setChecking(false);
      setError("Erro ao consultar transações existentes.");
      return;
    }
    const seen = new Set(
      existing.map((t) =>
        buildDedupKey({
          accountId: bankAccountId,
          date: t.date,
          name: t.name,
          amount: Number(t.amount),
          type: t.type,
        })
      )
    );

    const toImport: TransactionInsert[] = [];
    for (const row of preview) {
      const { category, icon } = categorizeTransaction(row.name);
      const transaction: TransactionInsert = {
        id: crypto.randomUUID(),
        date: row.date,
        name: row.name,
        amount: row.amount,
        type: row.type,
        card: null,
        bank_account_id: bankAccountId,
        category,
        icon,
      };
      const key = buildDedupKey({
        accountId: bankAccountId,
        date: transaction.date,
        name: transaction.name,
        amount: Number(transaction.amount),
        type: transaction.type,
      });
      if (seen.has(key)) continue;
      seen.add(key);
      toImport.push(transaction);
    }

    const duplicateCount = preview.length - toImport.length;
    if (toImport.length === 0) {
      setError("Todas as movimentações deste extrato já foram importadas.");
      setChecking(false);
      return;
    }
    setDedupResult({ toImport, duplicateCount });
    setChecking(false);
  };

  const handleConfirmImport = async () => {
    if (!dedupResult) return;
    setSaving(true);
    setError("");
    const BATCH = 500;
    let imported = 0;
    for (let i = 0; i < dedupResult.toImport.length; i += BATCH) {
      const batch = dedupResult.toImport.slice(i, i + BATCH);
      const { error: insErr } = await supabase.from("transactions").insert(batch);
      if (insErr) {
        setSaving(false);
        setError("Erro ao importar: " + insErr.message);
        return;
      }
      imported += batch.length;
    }
    setSaving(false);
    if (imported === 0) {
      setError("Nenhuma movimentação foi importada.");
    } else {
      onSuccess();
      onOpenChange(false);
      reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md mx-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Importar extrato PDF — {bankAccountName}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Envie o PDF do extrato bancário. A IA irá extrair as movimentações automaticamente e vinculá-las à conta <strong>{bankAccountName}</strong>.
        </p>

        <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleFile} />

        {!preview.length && !parsing && (
          <Button variant="outline" className="w-full gap-2 rounded-xl" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Selecionar PDF do extrato
          </Button>
        )}

        {parsing && (
          <div className="flex flex-col items-center justify-center gap-2 py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Extraindo movimentações com IA...</p>
            <p className="text-[10px] text-muted-foreground">Isso pode levar alguns segundos.</p>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-destructive/10 p-3 space-y-2">
            <div className="flex items-start gap-2 text-destructive text-xs font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full h-8 text-[11px] rounded-lg border-destructive/20 hover:bg-destructive/5 hover:text-destructive"
              onClick={() => {
                if (preview.length > 0) {
                  if (dedupResult) {
                    handleConfirmImport();
                  } else {
                    handleCheckDuplicates();
                  }
                } else {
                  fileRef.current?.click();
                }
              }}
            >
              Tentar novamente
            </Button>
          </div>
        )}

        {preview.length > 0 && !parsing && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-4 w-4" />
                {fileName} — {preview.length} movimentações
              </div>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={reset}>Trocar PDF</Button>
            </div>

            <PdfPreviewTable
              rows={preview}
              onChange={(rows) => { setPreview(rows); setDedupResult(null); }}
              itemLabel="movimentações"
            />

            {!dedupResult ? (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={reset}>Cancelar</Button>
                <Button className="flex-1 rounded-xl gap-2" onClick={handleCheckDuplicates} disabled={checking}>
                  {checking && <Loader2 className="h-4 w-4 animate-spin" />}
                  Verificar {preview.length}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl bg-muted/50 p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-primary">
                    <CheckCircle2 className="h-4 w-4" />
                    {dedupResult.toImport.length} movimentações serão importadas
                  </div>
                  {dedupResult.duplicateCount > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {dedupResult.duplicateCount} duplicada{dedupResult.duplicateCount > 1 ? "s" : ""} ignorada{dedupResult.duplicateCount > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDedupResult(null)}>Voltar</Button>
                  <Button className="flex-1 rounded-xl gap-2" onClick={handleConfirmImport} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirmar importação
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
