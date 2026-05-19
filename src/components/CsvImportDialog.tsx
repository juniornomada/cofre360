import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { categorizeTransaction } from "@/lib/categorize-transaction";
import { restoreAccents } from "@/lib/restore-accents";

type AccountOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankAccountId: string;
  bankAccountName: string;
  accounts?: AccountOption[];
  onSuccess: () => void;
};

type ParsedRow = {
  date: string;
  name: string;
  amount: number;
  type: "income" | "expense";
};

type ColumnMapping = {
  date: string;
  name: string;
  amount: string;
};

type TransactionInsert = Omit<TablesInsert<"transactions">, "type" | "bank_account_id"> & {
  type: "income" | "expense";
  bank_account_id: string | null;
};

type ExistingTransaction = Pick<
  Tables<"transactions">,
  "date" | "name" | "amount" | "type" | "bank_account_id"
>;

function splitCSVLine(line: string, sep: string): string[] {
  return line.split(sep).map((c) => c.trim().replace(/"/g, ""));
}

function parseWithMapping(lines: string[], sep: string, cols: string[], mapping: ColumnMapping): ParsedRow[] {
  const dateIdx = cols.indexOf(mapping.date);
  const nameIdx = cols.indexOf(mapping.name);
  const amountIdx = cols.indexOf(mapping.amount);

  if (dateIdx === -1 || nameIdx === -1 || amountIdx === -1) {
    throw new Error("Mapeamento inválido");
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = splitCSVLine(line, sep);
    const rawAmount = parts[amountIdx]?.replace(/\./g, "").replace(",", ".") || "0";
    const amount = parseFloat(rawAmount);
    if (isNaN(amount)) continue;

    rows.push({
      date: parts[dateIdx] || new Date().toISOString().slice(0, 10),
      name: restoreAccents(parts[nameIdx] || "Importado"),
      amount: Math.abs(amount),
      type: amount < 0 ? "expense" : "income",
    });
  }
  return rows;
}

const AUTO_DATE = ["data", "date", "dt", "data_transacao", "data transação", "data transacao", "dt_transacao", "data_lancamento", "data lançamento", "data lancamento", "dt_lancamento", "data_movimento", "data movimento", "data_pagamento", "data pagamento", "data_compra", "data compra", "dt_compra", "vencimento", "created_at", "created", "periodo", "período"];
const AUTO_NAME = ["descrição", "descricao", "description", "nome", "name", "titulo", "título", "historico", "histórico", "lancamento", "lançamento", "detalhe", "detalhes", "memo", "obs", "observacao", "observação", "estabelecimento", "destino", "origem", "favorecido", "pagador", "referencia", "referência", "info", "informacao", "informação"];
const AUTO_AMOUNT = ["valor", "value", "amount", "quantia", "montante", "total", "vlr", "vl", "preco", "preço", "price", "debito", "débito", "credito", "crédito", "saldo", "valor_transacao", "valor transação", "valor transacao", "valor_lancamento"];

function normalize(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function normalizeDateKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const compact = trimmed.replace(/\s+/g, "");
  const brDate = compact.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (brDate) {
    const [, day, month, year] = brDate;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const isoDate = compact.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return normalize(compact);
}

function buildTransactionDedupKey(input: {
  bankAccountId: string | null;
  date: string;
  name: string;
  amount: number;
  type: "income" | "expense";
}) {
  return [
    input.bankAccountId || "sem-conta",
    normalizeDateKey(input.date),
    normalize(input.name).replace(/\s+/g, " "),
    Number(input.amount).toFixed(2),
    input.type,
  ].join("|");
}

const EXISTING_TRANSACTIONS_PAGE_SIZE = 1000;
const IMPORT_INSERT_BATCH_SIZE = 500;

async function fetchExistingTransactions(bankAccountId: string | null) {
  const rows: ExistingTransaction[] = [];

  for (let from = 0; ; from += EXISTING_TRANSACTIONS_PAGE_SIZE) {
    const query = supabase
      .from("transactions")
      .select("date, name, amount, type, bank_account_id")
      .range(from, from + EXISTING_TRANSACTIONS_PAGE_SIZE - 1);

    const { data, error } = bankAccountId
      ? await query.eq("bank_account_id", bankAccountId)
      : await query.is("bank_account_id", null);

    if (error) {
      return { data: null, error };
    }

    const page = (data ?? []) as ExistingTransaction[];
    rows.push(...page);

    if (page.length < EXISTING_TRANSACTIONS_PAGE_SIZE) {
      return { data: rows, error: null };
    }
  }
}

async function insertTransactionsSkippingDuplicates(transactions: TransactionInsert[]) {
  let importedCount = 0;

  for (let start = 0; start < transactions.length; start += IMPORT_INSERT_BATCH_SIZE) {
    const batch = transactions.slice(start, start + IMPORT_INSERT_BATCH_SIZE);
    const { error } = await supabase.from("transactions").insert(batch);

    if (!error) {
      importedCount += batch.length;
      continue;
    }

    if (error.code !== "23505") {
      return { importedCount, error };
    }

    for (const transaction of batch) {
      const { error: rowError } = await supabase.from("transactions").insert(transaction);

      if (!rowError) {
        importedCount += 1;
        continue;
      }

      if (rowError.code === "23505") {
        continue;
      }

      return { importedCount, error: rowError };
    }
  }

  return { importedCount, error: null };
}

function autoDetectMapping(cols: string[]): Partial<ColumnMapping> {
  const normalized = cols.map((c) => normalize(c));
  const normalizedKeywords = (keywords: string[]) => keywords.map(normalize);
  const mapping: Partial<ColumnMapping> = {};

  const findMatch = (keywords: string[]) => {
    const nkw = normalizedKeywords(keywords);
    // Exact match first
    const exact = normalized.findIndex((c) => nkw.includes(c));
    if (exact !== -1) return exact;
    // Partial match
    for (const kw of nkw) {
      const partial = normalized.findIndex((c) => c.includes(kw) || kw.includes(c));
      if (partial !== -1) return partial;
    }
    return -1;
  };

  const dateIdx = findMatch(AUTO_DATE);
  if (dateIdx !== -1) mapping.date = cols[dateIdx];
  const nameIdx = findMatch(AUTO_NAME);
  if (nameIdx !== -1) mapping.name = cols[nameIdx];
  const amountIdx = findMatch(AUTO_AMOUNT);
  if (amountIdx !== -1) mapping.amount = cols[amountIdx];
  return mapping;
}

export function CsvImportDialog({ open, onOpenChange, bankAccountId, bankAccountName, accounts, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState(bankAccountId);

  // Column mapping state
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [csvLines, setCsvLines] = useState<string[]>([]);
  const [csvSep, setCsvSep] = useState(",");
  const [mapping, setMapping] = useState<ColumnMapping>({ date: "", name: "", amount: "" });
  const [mappingStep, setMappingStep] = useState(false);

  const [dedupResult, setDedupResult] = useState<{ toImport: TransactionInsert[]; duplicateCount: number } | null>(null);
  const [checking, setChecking] = useState(false);

  const reset = () => {
    setPreview([]);
    setError("");
    setFileName("");
    setSelectedAccountId(bankAccountId);
    setCsvColumns([]);
    setCsvLines([]);
    setMapping({ date: "", name: "", amount: "" });
    setMappingStep(false);
    setDedupResult(null);
    setChecking(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const processText = (text: string) => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error("Arquivo vazio ou sem dados");

    const header = lines[0];
    const sep = header.includes(";") ? ";" : ",";
    const cols = splitCSVLine(header, sep);

    setCsvLines(lines);
    setCsvSep(sep);
    setCsvColumns(cols);

    const auto = autoDetectMapping(cols);
    const detected: ColumnMapping = {
      date: auto.date || "",
      name: auto.name || "",
      amount: auto.amount || "",
    };
    setMapping(detected);

    if (detected.date && detected.name && detected.amount) {
      const rows = parseWithMapping(lines, sep, cols, detected);
      if (rows.length === 0) throw new Error("Nenhuma linha válida encontrada");
      setPreview(rows);
      setMappingStep(false);
    } else {
      setMappingStep(true);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const buffer = ev.target?.result as ArrayBuffer;

        // Try UTF-8 first with fatal flag — if it fails, use Latin-1
        let text: string;
        try {
          const decoder = new TextDecoder("utf-8", { fatal: true });
          text = decoder.decode(buffer);
        } catch {
          // UTF-8 decoding failed — file is likely Latin-1/Windows-1252
          text = new TextDecoder("windows-1252").decode(buffer);
        }

        // Even if UTF-8 succeeded, check for common Mojibake patterns
        // These are what Portuguese accented chars look like when Latin-1 is misread as UTF-8
        const hasMojibake = text.includes("\u00C3\u00A3") || text.includes("\u00C3\u00A7") ||
          text.includes("\u00C3\u00A9") || text.includes("\u00C3\u00B3") || text.includes("\u00C3\u00AA") ||
          text.includes("\u00C3\u00A1") || text.includes("\u00C3\u00AD") || text.includes("\u00C3\u00BA") ||
          text.includes("\u00C3\u00B4") || text.includes("\u00C3\u00A2");
        if (hasMojibake) {
          text = new TextDecoder("windows-1252").decode(buffer);
        }

        processText(text);
      } catch (err: any) {
        setError(err.message);
        setPreview([]);
        setMappingStep(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const applyMapping = () => {
    setError("");
    if (!mapping.date || !mapping.name || !mapping.amount) {
      setError("Selecione todas as colunas obrigatórias");
      return;
    }
    try {
      const rows = parseWithMapping(csvLines, csvSep, csvColumns, mapping);
      if (rows.length === 0) throw new Error("Nenhuma linha válida encontrada");
      setPreview(rows);
      setMappingStep(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCheckDuplicates = async () => {
    setChecking(true);
    setError("");

    const currentAccountId = selectedAccountId || null;
    const { data: existing, error: existingError } = await fetchExistingTransactions(currentAccountId);

    if (existingError || !existing) {
      setChecking(false);
      setError("Erro ao validar transações já importadas.");
      return;
    }

    const seenKeys = new Set(
      (existing || []).map((transaction) =>
        buildTransactionDedupKey({
          bankAccountId: transaction.bank_account_id,
          date: transaction.date,
          name: transaction.name,
          amount: Number(transaction.amount),
          type: transaction.type as "income" | "expense",
        })
      )
    );

    const payload = preview.reduce<TransactionInsert[]>((rows, row) => {
      const { category, icon } = categorizeTransaction(row.name);
      const transaction: TransactionInsert = {
        id: crypto.randomUUID(),
        date: row.date,
        name: row.name,
        amount: row.amount,
        type: row.type,
        bank_account_id: currentAccountId,
        category,
        icon,
      };

      const dedupKey = buildTransactionDedupKey({
        bankAccountId: transaction.bank_account_id,
        date: transaction.date,
        name: transaction.name,
        amount: Number(transaction.amount),
        type: transaction.type,
      });

      if (seenKeys.has(dedupKey)) {
        return rows;
      }

      seenKeys.add(dedupKey);
      rows.push(transaction);
      return rows;
    }, []);

    const duplicateCount = preview.length - payload.length;

    if (payload.length === 0) {
      setChecking(false);
      setError("Todas as transações deste arquivo já foram importadas ou estão duplicadas.");
      return;
    }

    setDedupResult({ toImport: payload, duplicateCount });
    setChecking(false);
  };

  const handleConfirmImport = async () => {
    if (!dedupResult) return;
    setSaving(true);
    setError("");

    const { importedCount, error: err } = await insertTransactionsSkippingDuplicates(dedupResult.toImport);
    setSaving(false);

    if (err) {
      setError("Erro ao importar: " + err.message);
    } else if (importedCount === 0) {
      setError("Todas as transações deste arquivo já foram importadas ou estão duplicadas.");
    } else {
      onSuccess();
      onOpenChange(false);
      reset();
    }
  };

  const mappingComplete = mapping.date && mapping.name && mapping.amount;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md mx-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Importar CSV{accounts ? "" : ` — ${bankAccountName}`}</DialogTitle>
        </DialogHeader>

        {accounts && accounts.length > 1 && (
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Conta de destino</label>
            <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)} className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none border border-border">
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          O CSV deve ter colunas de <strong>data</strong>, <strong>descrição</strong> e <strong>valor</strong> (negativo = despesa). Você poderá mapear as colunas manualmente.
        </p>

        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />

        {!preview.length && !mappingStep && (
          <Button variant="outline" className="w-full gap-2 rounded-xl" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Selecionar arquivo CSV
          </Button>
        )}

        {error && (
          <div className="flex items-center gap-2 text-destructive text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Column mapping step */}
        {mappingStep && !preview.length && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-foreground">Mapear colunas do CSV</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Coluna de Data *</label>
                <Select value={mapping.date} onValueChange={(v) => setMapping((m) => ({ ...m, date: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {csvColumns.map((col) => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Coluna de Descrição *</label>
                <Select value={mapping.name} onValueChange={(v) => setMapping((m) => ({ ...m, name: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {csvColumns.map((col) => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Coluna de Valor *</label>
                <Select value={mapping.amount} onValueChange={(v) => setMapping((m) => ({ ...m, amount: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {csvColumns.map((col) => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={reset}>Cancelar</Button>
              <Button className="flex-1 rounded-xl" onClick={applyMapping} disabled={!mappingComplete}>Aplicar</Button>
            </div>
          </div>
        )}

        {preview.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-4 w-4" />
                {fileName} — {preview.length} transações
              </div>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setPreview([]); setMappingStep(true); }}>
                Remapear
              </Button>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Data</th>
                    <th className="text-left p-2">Descrição</th>
                    <th className="text-right p-2">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-2 text-muted-foreground">{r.date}</td>
                      <td className="p-2 truncate max-w-[140px]">{r.name}</td>
                      <td className={`p-2 text-right font-medium ${r.type === "income" ? "text-primary" : "text-destructive"}`}>
                        {r.type === "expense" ? "-" : "+"}R$ {r.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 50 && (
                <p className="text-[10px] text-muted-foreground text-center py-1">... e mais {preview.length - 50}</p>
              )}
            </div>

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
                    {dedupResult.toImport.length} transações serão importadas
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
