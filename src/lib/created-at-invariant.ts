/**
 * Invariante do loader da Home: `created_at` de uma transação SÓ pode vir
 * de duas fontes:
 *   1. Um timestamp ISO 8601 válido (o que o Supabase devolve na coluna
 *      `created_at`), ou
 *   2. `null` / `undefined` (linha antiga sem `created_at` — cai para o
 *      relógio do runtime via `new Date().toISOString()`).
 *
 * QUALQUER outra string — em particular, o campo `date` textual da
 * transação ("10 jul", "31 dez", "10/07/2025", "sem data", etc.) — é
 * uma quebra de contrato: `parseTxDate` usa `created_at` como fallback
 * confiável quando `date` é ambíguo, então promover `date` a `created_at`
 * é exatamente a fonte do bug que já causou ciclos de fatura errados
 * na virada de ano.
 *
 * Este módulo centraliza a coerção defensiva. Use `sanitizeCreatedAt`
 * em todo mapper que copia `created_at` para uma DTO consumida pelo
 * agrupamento de fatura.
 */

export type CreatedAtInput = string | null | undefined;

export class CreatedAtInvariantError extends Error {
  constructor(
    public readonly received: unknown,
    public readonly context: string,
  ) {
    super(
      `[created-at-invariant] valor inválido em "${context}": ` +
        `esperado ISO 8601 ou null/undefined, recebido ${JSON.stringify(received)}. ` +
        `Possível causa: campo "date" textual sendo copiado para "created_at".`,
    );
    this.name = "CreatedAtInvariantError";
  }
}

/**
 * Uma string é aceita como `created_at` quando:
 *  - `Date.parse` a reconhece (não NaN), E
 *  - possui um marcador ISO reconhecível: `T` separando data/hora (ex.
 *    "2025-07-10T13:00:00Z") ou é uma data-only ISO "YYYY-MM-DD".
 *
 * O `Date.parse` sozinho aceita coisas como "10 jul 2025" ou
 * "December 31, 2025" — que é EXATAMENTE o que queremos rejeitar. Por
 * isso combinamos com um regex estrito.
 */
const ISO_STRICT =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export function isIsoCreatedAt(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!ISO_STRICT.test(value.trim())) return false;
  const t = Date.parse(value);
  return Number.isFinite(t);
}

export interface SanitizeOptions {
  /** Rótulo humano para logs/erros (ex. "index.tsx:txsByName"). */
  context: string;
  /**
   * Comportamento quando o valor recebido é uma string NÃO-ISO
   * (violação de invariante):
   *   - "throw": lança `CreatedAtInvariantError` (default em dev/test).
   *   - "warn": faz `console.warn` e retorna o fallback.
   *   - "silent": retorna o fallback silenciosamente.
   */
  onViolation?: "throw" | "warn" | "silent";
  /** Fábrica do "agora" — permite mockar em testes. */
  now?: () => Date;
}

/**
 * Coage `input` para um ISO válido, rejeitando qualquer string que
 * pareça um `date` textual. Retorna sempre um ISO 8601.
 */
export function sanitizeCreatedAt(
  input: CreatedAtInput | unknown,
  options: SanitizeOptions,
): string {
  const now = options.now ?? (() => new Date());
  const violation = options.onViolation ?? defaultViolationMode();

  if (input == null || (typeof input === "string" && input.trim() === "")) {
    return now().toISOString();
  }

  if (isIsoCreatedAt(input)) {
    // Normaliza para ISO canônico (elimina espaços/timezone shorthand).
    return new Date(input).toISOString();
  }

  // Qualquer outra coisa é violação: string livre, número, objeto, etc.
  const err = new CreatedAtInvariantError(input, options.context);
  if (violation === "throw") throw err;
  if (violation === "warn") {
    // eslint-disable-next-line no-console
    console.warn(err.message);
  }
  return now().toISOString();
}

function defaultViolationMode(): "throw" | "warn" {
  // Em produção não queremos derrubar a Home por causa de uma linha
  // corrompida no banco — apenas registrar. Em dev/test o throw é
  // agressivo de propósito para que o teste falhe imediatamente se
  // alguém introduzir a regressão "created_at = t.date".
  const env =
    typeof process !== "undefined" && process.env
      ? process.env.NODE_ENV
      : undefined;
  return env === "production" ? "warn" : "throw";
}

/**
 * Auditoria em lote — retorna a lista de violações sem lançar.
 * Útil para o teste de regressão e para instrumentação futura.
 */
export function auditCreatedAtBatch(
  rows: ReadonlyArray<Record<string, unknown>>,
  field = "created_at",
): CreatedAtInvariantError[] {
  const errors: CreatedAtInvariantError[] = [];
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i][field];
    if (v == null || v === "") continue;
    if (!isIsoCreatedAt(v)) {
      errors.push(new CreatedAtInvariantError(v, `row[${i}].${field}`));
    }
  }
  return errors;
}
