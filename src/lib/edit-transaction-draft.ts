// Draft persistence for the transaction edit dialog.
// Stores unsaved changes keyed by transaction id in localStorage, so reopening
// the same transaction restores the in-progress edits.
//
// Fields persisted: amount, total_installments, installment_number, category,
// icon, name, date, type, card, bank_account_id, and the UI-only
// installment_mode ("divide" | "fixed").

const STORAGE_KEY = "edit-tx-drafts:v1";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export type EditDraftMode = "divide" | "fixed";

export interface EditDraftFields {
  amount?: number;
  total_installments?: number | null;
  installment_number?: number | null;
  category?: string;
  icon?: string;
  name?: string;
  date?: string;
  type?: "income" | "expense";
  card?: string | null;
  bank_account_id?: string | null;
}

export interface EditDraft {
  fields: EditDraftFields;
  mode: EditDraftMode;
  savedAt: number;
}

type DraftMap = Record<string, EditDraft>;

function safeRead(): DraftMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as DraftMap) : {};
  } catch {
    return {};
  }
}

function safeWrite(map: DraftMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota / serialization errors
  }
}

function purgeExpired(map: DraftMap, ttlMs: number, now: number): DraftMap {
  const out: DraftMap = {};
  for (const [id, d] of Object.entries(map)) {
    if (d && typeof d.savedAt === "number" && now - d.savedAt <= ttlMs) {
      out[id] = d;
    }
  }
  return out;
}

export function loadEditDraft(
  txId: string,
  ttlMs: number = DEFAULT_TTL_MS,
): EditDraft | null {
  if (!txId) return null;
  const now = Date.now();
  const map = purgeExpired(safeRead(), ttlMs, now);
  const draft = map[txId];
  if (!draft) {
    safeWrite(map);
    return null;
  }
  return draft;
}

export function saveEditDraft(
  txId: string,
  draft: Omit<EditDraft, "savedAt">,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  if (!txId) return;
  const now = Date.now();
  const map = purgeExpired(safeRead(), ttlMs, now);
  map[txId] = { ...draft, savedAt: now };
  safeWrite(map);
}

export function clearEditDraft(txId: string): void {
  if (!txId) return;
  const map = safeRead();
  if (map[txId]) {
    delete map[txId];
    safeWrite(map);
  }
}

export function clearAllEditDrafts(): void {
  safeWrite({});
}
