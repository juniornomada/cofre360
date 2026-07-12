import { parseTxDate } from "@/lib/invoice-utils";

/**
 * Item mínimo necessário para ordenar cronologicamente uma fatura.
 * Compatível com `CardTransaction`.
 */
export interface ChronoSortable {
  id: string | number;
  date: string;
  created_at?: string | null;
}

/**
 * Comparador determinístico usado no diálogo da fatura em /cards.
 *
 * Ordem: cronológica ascendente (mais antigo → mais recente) via
 * `parseTxDate(date, created_at)`. Desempates:
 *   1. `created_at` (ISO) ascendente;
 *   2. `id` como string via `localeCompare`.
 *
 * Determinístico: aplicar duas vezes gera a mesma sequência.
 */
export function compareInvoiceChrono<T extends ChronoSortable>(
  a: T,
  b: T,
): number {
  const da = parseTxDate(a.date, a.created_at ?? undefined).getTime();
  const db = parseTxDate(b.date, b.created_at ?? undefined).getTime();
  if (da !== db) return da - db;
  const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
  const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
  if (ca !== cb) return ca - cb;
  return String(a.id).localeCompare(String(b.id));
}

/** Retorna uma nova lista ordenada cronologicamente (ascendente). */
export function sortInvoiceChronoAsc<T extends ChronoSortable>(
  txs: readonly T[],
): T[] {
  return [...txs].sort(compareInvoiceChrono);
}
