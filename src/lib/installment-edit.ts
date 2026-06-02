// Shared helpers for editing the installment plan of an existing transaction.
// Used by the "Editar Transação" dialogs in both /transactions and / (home).
import { supabase } from "@/integrations/supabase/client";

const shortMonthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const shortMonthMap: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

function parseTxDateToDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const trimmed = dateStr.trim();
  // ISO yyyy-MM-dd
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
  }
  // "DD mmm" or "DD mmm YYYY"
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

// Format date back into the same shape used by the row ("DD mmm" or ISO).
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

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
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
  /**
   * Optional value of EACH installment. When provided (and total > 1), every
   * installment row (including the current one) will be saved with this amount
   * instead of the original `amount`. Use this to support both modes:
   *  - "divide": pass total/N
   *  - "fixed":  pass the user-defined per-installment value
   */
  installmentAmount?: number;
  /**
   * If true, updates all existing installments in the same group (siblings).
   * Useful when changing value or name and wanting it reflected everywhere.
   */
  updateAllInGroup?: boolean;
};

export type SaveInstallmentResult = {
  futureRowsAdded: number;
  cleared: boolean; // true when total = 1 (parcelamento removido)
};

/**
 * Persist installment plan changes for an existing transaction:
 * - total = 1 → strip group_id and reset numbers
 * - total > 1 → set group, current/total on the row, append missing future rows
 */
export async function saveInstallmentPlan(input: SaveInstallmentInput): Promise<SaveInstallmentResult> {
  const baseName = stripInstallmentSuffix(input.name);
  const total = Math.floor(input.total);
  const current = Math.floor(input.current);

  if (!isFinite(total) || !isFinite(current) || total < 1 || current < 1 || current > total) {
    throw new Error("Parcelas inválidas");
  }

  if (total === 1) {
    const { error } = await supabase
      .from("transactions")
      .update({
        name: baseName,
        installment_number: 1,
        total_installments: 1,
        installment_group_id: null,
      })
      .eq("id", input.id);
    if (error) throw error;
    return { futureRowsAdded: 0, cleared: true };
  }

  const groupId = input.installment_group_id || uuid();
  const perInstallment =
    typeof input.installmentAmount === "number" && isFinite(input.installmentAmount)
      ? input.installmentAmount
      : input.amount;

  const updateData = {
    name: baseName,
    amount: perInstallment,
    installment_number: current,
    total_installments: total,
    installment_group_id: groupId,
    icon: input.icon,
    category: input.category,
    card: input.card,
    bank_account_id: input.bank_account_id,
  };

  if (input.updateAllInGroup && input.installment_group_id) {
    // Fetch all siblings to update their names with correct numbering
    const { data: siblings } = await supabase
      .from("transactions")
      .select("id, installment_number")
      .eq("installment_group_id", groupId);

    if (siblings) {
      const updates = siblings.map(s => {
        // We use the sibling's current installment number but update other fields
        const n = s.installment_number || 1;
        return supabase.from("transactions").update({
          ...updateData,
          name: baseName,
          installment_number: n,
        }).eq("id", s.id);
      });
      await Promise.all(updates);
    }
  } else {
    const { error: updErr } = await supabase
      .from("transactions")
      .update(updateData)
      .eq("id", input.id);
    if (updErr) throw updErr;
  }

  // Avoid duplicating siblings already present in this group.
  const { data: siblings } = await supabase
    .from("transactions")
    .select("installment_number")
    .eq("installment_group_id", groupId);
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
    });
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from("transactions").insert(toInsert);
    if (insErr) throw insErr;
  }

  return { futureRowsAdded: toInsert.length, cleared: false };
}
