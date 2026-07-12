import { parseTxDate } from "@/lib/invoice-utils";

/**
 * Item mínimo necessário para ordenar cronologicamente uma fatura.
 * Compatível com `CardTransaction`.
 */
export interface ChronoSortable {
  id: string | number;
  date: string | null | undefined;
  created_at?: string | null;
}

/**
 * Chave temporal usada pelo comparador.
 *
 * Contrato de robustez:
 *  - Se `parseTxDate(date, created_at)` produz uma data válida, retorna esse ms.
 *  - Se `date` é vazio/indefinido/inválido MAS `created_at` é ISO válido,
 *    retorna o ms de `created_at` — o item ancora no seu momento de criação
 *    em vez de "agora", o que evitaria determinismo.
 *  - Se AMBOS são inválidos ou ausentes, retorna `+Infinity` (afunda para o
 *    final da lista) — mantém a UI renderizável e a ordenação determinística;
 *    o desempate por id garante estabilidade entre esses itens.
 *
 * Observação: sem esse tratamento, `parseTxDate` cai em `new Date()`
 * (relógio atual) quando não há fallback, o que faria o item "flutuar" de
 * posição a cada refetch.
 */
export function invoiceChronoKey(t: ChronoSortable): number {
  const rawDate = typeof t.date === "string" ? t.date.trim() : "";
  const rawCreated =
    typeof t.created_at === "string" && t.created_at.trim().length > 0
      ? t.created_at
      : "";

  const createdMs = rawCreated ? new Date(rawCreated).getTime() : NaN;
  const createdOk = Number.isFinite(createdMs);

  if (rawDate) {
    const parsedMs = parseTxDate(rawDate, rawCreated).getTime();
    if (Number.isFinite(parsedMs)) {
      // Se parseTxDate teve que cair no fallback "agora" (nenhum input
      // válido), afunda para o final para não flutuar entre refetches.
      // Detecção: sem created_at válido E sem date parseável.
      if (!createdOk && !isDateStringParseable(rawDate)) {
        return Number.POSITIVE_INFINITY;
      }
      return parsedMs;
    }
  }

  // Sem `date` utilizável — ancora em created_at quando possível.
  if (createdOk) return createdMs;

  // Sem nenhum sinal temporal confiável.
  return Number.POSITIVE_INFINITY;
}

/**
 * Detecta se uma string de data pode ser interpretada por `parseTxDate`
 * sem cair no fallback de "agora". Cobre os formatos que a UI produz:
 * ISO (`YYYY-MM-DD` / `YYYY-MM-DDTHH:mm...`), `DD/MM[/YYYY]`, `DD-MM[-YY]`,
 * `DD mmm[ YYYY]` (mês abreviado PT).
 */
function isDateStringParseable(s: string): boolean {
  if (!s) return false;
  // ISO
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) {
    const d = new Date(s);
    return !Number.isNaN(d.getTime());
  }
  // Numérico DD[sep]MM[sep]?YY(YY)? com separadores comuns/unicode
  if (/^\s*\d{1,2}\s*[\/.\-\u2010-\u2015]\s*\d{1,2}(\s*[\/.\-\u2010-\u2015]\s*\d{2,4})?\s*$/u.test(s)) {
    return true;
  }
  // "DD mmm[ YYYY]" (jan..dez, com/sem acento)
  if (/^\s*\d{1,2}\s+[a-zç]{3,}\.?(\s+\d{2,4})?\s*$/iu.test(s)) return true;
  return false;
}

/**
 * Comparador determinístico usado no diálogo da fatura em /cards.
 *
 * Ordem: cronológica ascendente (mais antigo → mais recente). Desempates
 * em cascata:
 *   1. `created_at` (ISO) ascendente — 0 quando ausente/ inválido.
 *   2. `id` como string via `localeCompare` — desempate final estável.
 *
 * Itens com data indefinida/ inválida e sem `created_at` utilizável são
 * afundados para o final (chave `+Infinity`) e ainda assim ordenados
 * deterministicamente entre si pelo `id`.
 */
export function compareInvoiceChrono<T extends ChronoSortable>(
  a: T,
  b: T,
): number {
  const da = invoiceChronoKey(a);
  const db = invoiceChronoKey(b);
  if (da !== db) return da - db;
  const ca =
    a.created_at && Number.isFinite(new Date(a.created_at).getTime())
      ? new Date(a.created_at).getTime()
      : 0;
  const cb =
    b.created_at && Number.isFinite(new Date(b.created_at).getTime())
      ? new Date(b.created_at).getTime()
      : 0;
  if (ca !== cb) return ca - cb;
  return String(a.id).localeCompare(String(b.id));
}

/** Retorna uma nova lista ordenada cronologicamente (ascendente). */
export function sortInvoiceChronoAsc<T extends ChronoSortable>(
  txs: readonly T[],
): T[] {
  return [...txs].sort(compareInvoiceChrono);
}
