// Shared helpers for editing the installment plan of an existing transaction.
// Used by the "Editar Transação" dialogs in both /transactions and / (home).
import { supabase } from "@/integrations/supabase/client";
import { sanitizeTransactionWrite, sanitizeTransactionWrites, sanitizeTransactionName } from "@/lib/normalize-transaction-name";

const shortMonthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const shortMonthMap: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

function parseTxDateToDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const trimmed = dateStr.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
  const parts = trimmed.toLowerCase().split(/\s+/);
  if (parts.length >= 2) {
    const day = parseInt(parts[0], 10);
    const monthIdx = shortMonthMap[parts[1]];
    if (!isNaN(day) && monthIdx !== undefined) {
      const year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
      return new Date(year, monthIdx, day);
    }
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? new Date() : d;
}

function formatTxDate(original: string, target: Date): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(original.trim())) {
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, "0");
    const dd = String(target.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const dd = String(target.getDate()).padStart(2, "0");
  const mm = shortMonthNames[target.getMonth()];
  return `${dd} ${mm}`;
}

function addMonthsKeepingFormat(originalDateStr: string, monthsAhead: number): string {
  const base = parseTxDateToDate(originalDateStr);
  const target = new Date(base.getFullYear(), base.getMonth() + monthsAhead, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(base.getDate(), lastDay));
  return formatTxDate(originalDateStr, target);
}

export function stripInstallmentSuffix(name: string): string {
  return name.replace(/\s*\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)\s*$/, "").trim();
}

export type InstallmentEditSnapshot = {
  name: string;
  amount: number;
  total_installments?: number | null;
  category?: string | null;
  icon?: string | null;
  date?: string | null;
  card?: string | null;
  bank_account_id?: string | null;
};

export const COSMETIC_INSTALLMENT_FIELDS = ["Categoria", "Ícone", "Cartão", "Conta"] as const;

export function detectInstallmentChanges(original: InstallmentEditSnapshot, edited: InstallmentEditSnapshot, effectiveEditedAmount: number): string[] {
  const changes: string[] = [];
  if (stripInstallmentSuffix(original.name) !== stripInstallmentSuffix(edited.name)) changes.push("Nome");
  if (original.amount !== effectiveEditedAmount) changes.push("Valor");
  if ((original.total_installments ?? null) !== (edited.total_installments ?? null)) changes.push("Nº de parcelas");
  if ((original.category || "") !== (edited.category || "")) changes.push("Categoria");
  if ((original.icon || "") !== (edited.icon || "")) changes.push("Ícone");
  if ((original.date || "") !== (edited.date || "")) changes.push("Data");
  if ((original.card || "") !== (edited.card || "")) changes.push("Cartão");
  if ((original.bank_account_id || "") !== (edited.bank_account_id || "")) changes.push("Conta");
  return changes;
}

export function splitInstallmentChanges(changes: string[]): { cosmetic: string[]; structural: string[] } {
  const cosmeticSet = new Set<string>(COSMETIC_INSTALLMENT_FIELDS);
  const cosmetic: string[] = [];
  const structural: string[] = [];
  for (const c of changes) {
    if (cosmeticSet.has(c)) cosmetic.push(c); else structural.push(c);
  }
  return { cosmetic, structural };
}

export async function propagateCosmeticFieldsToGroup(
  groupId: string,
  fields: { category?: string | null; icon?: string | null; card?: string | null; bank_account_id?: string | null },
): Promise<void> {
  const updates: Record<string, any> = {};
  if (fields.category !== undefined) updates.category = fields.category;
  if (fields.icon !== undefined) updates.icon = fields.icon;
  if (fields.card !== undefined) updates.card = fields.card;
  if (fields.bank_account_id !== undefined) updates.bank_account_id = fields.bank_account_id;
  if (Object.keys(updates).length === 0) return;
  const { error } = await supabase.from("transactions").update(updates).eq("installment_group_id", groupId);
  if (error) throw error;
}

export type InstallmentGroupRow = {
  installment_group_id?: string | null;
  installment_number?: number | null;
  total_installments?: number | null;
  amount: number;
  installment_source_amount?: number | null;
  installment_mode?: string | null;
  category?: string | null;
  icon?: string | null;
  card?: string | null;
  bank_account_id?: string | null;
};

export type GroupCoherenceReport = { ok: boolean; errors: string[]; warnings: string[] };

export function validateGroupCoherence(
  rows: InstallmentGroupRow[],
  expectCosmetic?: { category?: string | null; icon?: string | null; card?: string | null; bank_account_id?: string | null },
): GroupCoherenceReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (rows.length === 0) return { ok: false, errors: ["Grupo vazio"], warnings };
  const [first, ...rest] = rows;
  const groupId = first.installment_group_id ?? null;
  const total = first.total_installments ?? rows.length;
  const source = Number(first.installment_source_amount ?? 0);
  const mode = first.installment_mode ?? null;
  for (const r of rest) {
    if ((r.installment_group_id ?? null) !== groupId) errors.push("installment_group_id divergente entre parcelas");
    if ((r.total_installments ?? rows.length) !== total) errors.push("total_installments divergente entre parcelas");
    if (Number(r.installment_source_amount ?? 0) !== source) errors.push("installment_source_amount divergente entre parcelas");
    if ((r.installment_mode ?? null) !== mode) errors.push("installment_mode divergente entre parcelas");
  }
  if (rows.length !== total) errors.push(`Contagem de parcelas (${rows.length}) diverge do total_installments (${total})`);
  const seen = new Set<number>();
  for (const r of rows) {
    const n = r.installment_number ?? 0;
    if (n < 1 || n > total || !Number.isInteger(n)) errors.push(`installment_number inválido: ${n}`);
    if (seen.has(n)) errors.push(`installment_number duplicado: ${n}`);
    seen.add(n);
  }
  const sum = rows.reduce((s, r) => s + Number(r.amount), 0);
  const tolerance = rows.length * 0.01 + 1e-9;
  if (source > 0 && Math.abs(sum - source) > tolerance) errors.push(`Soma das parcelas (${sum.toFixed(2)}) diverge do total econômico (${source.toFixed(2)})`);
  if (mode === "fixed") {
    const a0 = Number(first.amount);
    for (const r of rest) {
      if (Number(r.amount) !== a0) { errors.push("Modo 'fixed' exige mesmo amount em todas as parcelas"); break; }
    }
  }
  if (expectCosmetic) {
    const check = (key: keyof typeof expectCosmetic) => {
      if (expectCosmetic[key] === undefined) return;
      const expected = expectCosmetic[key];
      for (const r of rows) {
        if ((r[key] ?? null) !== (expected ?? null)) { errors.push(`Campo cosmético '${key}' inconsistente entre parcelas`); return; }
      }
    };
    check("category"); check("icon"); check("card"); check("bank_account_id");
  }
  return { ok: errors.length === 0, errors, warnings };
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export type SaveInstallmentInput = {
  id: string;
  name: string;
  icon: string;
  category: string;
  date: string;
  amount: number;
  type: string;
  card: string | null;
  bank_account_id: string | null;
  installment_group_id?: string | null;
  current: number;
  total: number;
  installmentAmount?: number;
  installmentMode?: string;
  installmentSourceAmount?: number;
  updateAllInGroup?: boolean;
  syncDates?: boolean;
};

export type SaveInstallmentResult = { futureRowsAdded: number; cleared: boolean };

export async function saveInstallmentPlan(input: SaveInstallmentInput): Promise<SaveInstallmentResult> {
  const baseName = sanitizeTransactionName(stripInstallmentSuffix(input.name));
  // Invalid/absent installment metadata must behave as a normal single transaction.
  const total = Math.max(1, Math.floor(Number(input.total) || 1));
  const current = Math.max(1, Math.floor(Number(input.current) || 1));

  if (current > total) throw new Error("Parcela atual inválida");

  if (total === 1) {
    const { error } = await supabase
      .from("transactions")
      .update({
        name: baseName,
        // Restore the original edited amount. This is important when the caller
        // calculated a per-installment value before discovering that the row is
        // not actually an installment.
        amount: input.amount,
        type: input.type,
        card: input.card,
        bank_account_id: input.bank_account_id,
        installment_number: 1,
        total_installments: 1,
        installment_group_id: null,
        installment_mode: null,
        installment_source_amount: null,
      })
      .eq("id", input.id);
    if (error) throw error;
    return { futureRowsAdded: 0, cleared: true };
  }

  const groupId = input.installment_group_id || uuid();
  const perInstallment = typeof input.installmentAmount === "number" && isFinite(input.installmentAmount) ? input.installmentAmount : input.amount;
  const updateData = {
    name: baseName,
    amount: perInstallment,
    installment_number: current,
    total_installments: total,
    installment_group_id: groupId,
    installment_mode: input.installmentMode || "divide",
    installment_source_amount: input.installmentSourceAmount ?? perInstallment,
    icon: input.icon,
    category: input.category,
    card: input.card,
    bank_account_id: input.bank_account_id,
  };

  if (input.updateAllInGroup && input.installment_group_id) {
    const { data: siblings } = await supabase.from("transactions").select("id, installment_number").eq("installment_group_id", groupId);
    if (siblings) {
      const updates = siblings.map(s => {
        const n = s.installment_number || 1;
        const perSibling: any = { ...updateData, name: baseName, installment_number: n };
        if (input.syncDates) perSibling.date = addMonthsKeepingFormat(input.date, n - current);
        return supabase.from("transactions").update(perSibling).eq("id", s.id);
      });
      const results = await Promise.all(updates);
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;
    }
  } else {
    const { error: updErr } = await supabase.from("transactions").update(updateData).eq("id", input.id);
    if (updErr) throw updErr;
  }

  const { data: siblings } = await supabase.from("transactions").select("installment_number").eq("installment_group_id", groupId);
  const present = new Set<number>((siblings || []).map((s: any) => s.installment_number));
  present.add(current);
  const toInsert: any[] = [];
  for (let n = current + 1; n <= total; n++) {
    if (present.has(n)) continue;
    const months = n - current;
    toInsert.push({
      id: uuid(),
      name: baseName,
      icon: input.icon,
      category: input.category,
      date: addMonthsKeepingFormat(input.date, months),
      amount: perInstallment,
      type: input.type,
      card: input.card,
      bank_account_id: input.bank_account_id,
      installment_number: n,
      total_installments: total,
      installment_group_id: groupId,
      installment_mode: input.installmentMode || "divide",
      installment_source_amount: input.installmentSourceAmount ?? perInstallment,
    });
  }
  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from("transactions").insert(toInsert);
    if (insErr) throw insErr;
  }
  return { futureRowsAdded: toInsert.length, cleared: false };
}
